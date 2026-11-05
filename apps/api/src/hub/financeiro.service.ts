import { createHash } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { FinAccountInputSchema, FinEntryEditSchema, FinEntryInputSchema, FinImportInputSchema, FinPayInputSchema, FinTransferInputSchema } from "@novoseminovo/shared-types";
import type { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import {
  type Conta,
  type Movimento,
  type Transferencia,
  PLANO_DE_CONTAS,
  categoriaAutomatica,
  dre,
  extrato,
  fluxoCaixa,
  gerarParcelas,
  lerOfx,
  lerPlanilha,
  pontoEquilibrio,
  pontosAtencao,
  saldos,
} from "./financeiro-regras";

// Financeiro do Hub. Os lançamentos manuais/importados ficam em fin_entries;
// as mensalidades e planos de anúncio pagos no Stripe entram sozinhos (lidos
// de subscription_payments e listing_boost_purchases, conta "Stripe").

const dia = (d: Date) => d.toISOString().slice(0, 10);
const data = (s: string) => new Date(`${s}T00:00:00Z`);
const num = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;
const STRIPE: Conta = { id: "stripe", nome: "Stripe (mensalidades e planos)", saldoInicial: 0, saldoInicialEm: "2000-01-01" };
const CATEGORIAS = new Set(PLANO_DE_CONTAS.map((c) => c.codigo));
const somarMeses = (iso: string, n: number) => gerarParcelas({ descricao: "", valor: 1, vencimento: iso, parcelas: n + 1, recorrente: true })[n].vencimento;

@Injectable()
export class FinanceiroService {
  constructor(private readonly prisma: PrismaService) {}

  async contas(): Promise<(Conta & { banco?: string; tipo: string })[]> {
    const rows = await this.prisma.finAccount.findMany({ where: { ativa: true }, orderBy: { createdAt: "asc" } });
    return [...rows.map((r) => ({ id: r.id, nome: r.nome, banco: r.banco ?? undefined, tipo: r.tipo, saldoInicial: num(r.saldoInicial), saldoInicialEm: dia(r.saldoInicialEm) })), { ...STRIPE, tipo: "stripe" }];
  }

  async movimentos(): Promise<Movimento[]> {
    const [rows, subs, anuncios] = await Promise.all([
      this.prisma.finEntry.findMany({ orderBy: { vencimento: "asc" }, take: 20000 }),
      this.prisma.subscriptionPayment.findMany({ select: { stripeInvoiceId: true, partnerId: true, amount: true, refundedAmount: true, paidAt: true } }),
      this.prisma.listingBoostPurchase.findMany({ where: { status: "paid", paidAt: { not: null } }, select: { id: true, amount: true, paidAt: true, tier: true } }),
    ]);
    const nomes = new Map((await this.prisma.partner.findMany({ where: { id: { in: [...new Set(subs.map((s) => s.partnerId))] } }, select: { id: true, legalName: true } })).map((p) => [p.id, p.legalName]));
    const manuais: Movimento[] = rows.map((r) => ({
      id: r.id,
      tipo: r.tipo as Movimento["tipo"],
      descricao: r.descricao,
      contraparte: r.contraparte ?? undefined,
      categoria: r.categoria,
      competencia: dia(r.competencia),
      vencimento: dia(r.vencimento),
      valor: num(r.valor),
      status: r.status as Movimento["status"],
      pagoEm: r.pagoEm ? dia(r.pagoEm) : undefined,
      contaId: r.contaId ?? undefined,
      origem: r.origem as Movimento["origem"],
      observacao: r.observacao ?? undefined,
    }));
    const stripe: Movimento[] = [
      ...subs
        .map((s) => ({ s, valor: num(Number(s.amount) - Number(s.refundedAmount)) }))
        .filter(({ valor }) => valor > 0)
        .map(({ s, valor }) => ({ id: `stripe-sub-${s.stripeInvoiceId}`, tipo: "receber" as const, descricao: "Mensalidade do plano", contraparte: nomes.get(s.partnerId), categoria: "R01", competencia: dia(s.paidAt), vencimento: dia(s.paidAt), valor, status: "pago" as const, pagoEm: dia(s.paidAt), contaId: "stripe", origem: "stripe" as const })),
      ...anuncios.map((a) => ({ id: `stripe-anuncio-${a.id}`, tipo: "receber" as const, descricao: `Plano de anúncio (${a.tier})`, categoria: "R02", competencia: dia(a.paidAt!), vencimento: dia(a.paidAt!), valor: num(a.amount), status: "pago" as const, pagoEm: dia(a.paidAt!), contaId: "stripe", origem: "stripe" as const })),
    ];
    return [...manuais, ...stripe];
  }

  async transferencias(): Promise<Transferencia[]> {
    const rows = await this.prisma.finTransfer.findMany({ orderBy: { data: "asc" } });
    return rows.map((t) => ({ id: t.id, deContaId: t.deContaId, paraContaId: t.paraContaId, valor: num(t.valor), data: dia(t.data), descricao: t.descricao ?? undefined }));
  }

  private async contaExiste(id: string) {
    if (id === "stripe") return true;
    return Boolean(await this.prisma.finAccount.findFirst({ where: { id, ativa: true }, select: { id: true } }));
  }

  async criarConta(raw: z.input<typeof FinAccountInputSchema>) {
    const i = FinAccountInputSchema.parse(raw);
    return this.prisma.finAccount.create({ data: { nome: i.nome, banco: i.banco, tipo: i.tipo, saldoInicial: i.saldoInicial, saldoInicialEm: data(i.saldoInicialEm) }, select: { id: true } });
  }

  // Parcelado ou recorrente: cada parcela vence (e pertence) a um mês.
  async criarLancamento(raw: z.input<typeof FinEntryInputSchema>, byUserId: string) {
    const i = FinEntryInputSchema.parse(raw);
    if (!CATEGORIAS.has(i.categoria)) throw new BadRequestException("Categoria inválida.");
    if (i.pago && (!i.contaId || !(await this.contaExiste(i.contaId)))) throw new BadRequestException("Escolha a conta em que foi pago ou recebido.");
    const partes = gerarParcelas({ descricao: i.descricao, valor: i.valor, vencimento: i.vencimento, parcelas: i.parcelas, recorrente: i.recorrente });
    const grupoId = partes.length > 1 ? `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}` : undefined;
    const rows = partes.map((p, k) => ({
      tipo: i.tipo,
      descricao: p.descricao,
      contraparte: i.contraparte,
      categoria: i.categoria,
      valor: p.valor,
      competencia: data(somarMeses(i.competencia, k)),
      vencimento: data(p.vencimento),
      status: i.pago && k === 0 ? "pago" : "aberto",
      pagoEm: i.pago && k === 0 ? data(i.pagoEm ?? p.vencimento) : null,
      contaId: i.contaId,
      origem: "manual",
      grupoId,
      observacao: i.observacao,
      createdById: byUserId,
    }));
    await this.prisma.finEntry.createMany({ data: rows });
    return rows.map((r) => ({ vencimento: dia(r.vencimento), valor: r.valor }));
  }

  async baixar(id: string, raw: z.input<typeof FinPayInputSchema>) {
    const i = FinPayInputSchema.parse(raw);
    if (!(await this.contaExiste(i.contaId))) throw new BadRequestException("Conta não encontrada.");
    const { count } = await this.prisma.finEntry.updateMany({ where: { id, status: "aberto" }, data: { status: "pago", pagoEm: data(i.pagoEm), contaId: i.contaId } });
    if (!count) throw new BadRequestException("Lançamento não encontrado ou já baixado.");
  }

  async reabrir(id: string) {
    const { count } = await this.prisma.finEntry.updateMany({ where: { id, status: { in: ["pago", "cancelado"] }, origem: { not: "ofx" } }, data: { status: "aberto", pagoEm: null } });
    if (!count) throw new BadRequestException("Não dá para reabrir este lançamento.");
  }

  async cancelar(id: string) {
    const { count } = await this.prisma.finEntry.updateMany({ where: { id, status: "aberto" }, data: { status: "cancelado" } });
    if (!count) throw new BadRequestException("Só lançamento em aberto pode ser cancelado.");
  }

  async editar(id: string, raw: z.input<typeof FinEntryEditSchema>) {
    const i = FinEntryEditSchema.parse(raw);
    if (i.categoria && !CATEGORIAS.has(i.categoria)) throw new BadRequestException("Categoria inválida.");
    const { count } = await this.prisma.finEntry.updateMany({
      where: { id },
      data: { ...i, competencia: i.competencia ? data(i.competencia) : undefined, vencimento: i.vencimento ? data(i.vencimento) : undefined },
    });
    if (!count) throw new NotFoundException("Lançamento não encontrado.");
  }

  async transferir(raw: z.input<typeof FinTransferInputSchema>) {
    const i = FinTransferInputSchema.parse(raw);
    if (i.deContaId === i.paraContaId) throw new BadRequestException("Escolha duas contas diferentes (não dá para transferir para a mesma conta).");
    if (!(await this.contaExiste(i.deContaId)) || !(await this.contaExiste(i.paraContaId))) throw new BadRequestException("Conta não encontrada.");
    return this.prisma.finTransfer.create({ data: { deContaId: i.deContaId, paraContaId: i.paraContaId, valor: i.valor, data: data(i.data), descricao: i.descricao }, select: { id: true } });
  }

  // OFX do banco: cada linha vira lançamento já pago naquela conta (crédito
  // do Stripe vira transferência Stripe → banco). Planilha: lançamentos com
  // a situação da planilha. Linha repetida (mesmo código) não entra de novo.
  async importar(raw: z.input<typeof FinImportInputSchema>, byUserId: string) {
    const i = FinImportInputSchema.parse(raw);
    if (i.contaId && !(await this.contaExiste(i.contaId))) throw new BadRequestException("Conta não encontrada.");
    const out = { lancamentos: 0, transferencias: 0, repetidos: 0, erros: [] as string[] };
    const jaExiste = async (externalId: string) =>
      Boolean((await this.prisma.finEntry.findUnique({ where: { externalId }, select: { id: true } })) || (await this.prisma.finTransfer.findUnique({ where: { externalId }, select: { id: true } })));
    if (i.formato === "ofx") {
      if (!i.contaId) throw new BadRequestException("Escolha a conta do extrato.");
      const linhas = lerOfx(i.texto);
      if (!linhas.length) throw new BadRequestException("Não encontrei lançamentos neste arquivo. Ele é um extrato .ofx do banco?");
      for (const t of linhas) {
        const externalId = `ofx:${i.contaId}:${t.id || createHash("sha256").update(`${t.data}|${t.valor}|${t.descricao}`).digest("hex").slice(0, 24)}`;
        if (await jaExiste(externalId)) {
          out.repetidos++;
          continue;
        }
        if (t.valor > 0 && /stripe/i.test(t.descricao) && i.contaId !== "stripe") {
          await this.prisma.finTransfer.create({ data: { deContaId: "stripe", paraContaId: i.contaId, valor: t.valor, data: data(t.data), descricao: `Repasse do Stripe (${t.descricao})`.slice(0, 200), externalId } });
          out.transferencias++;
          continue;
        }
        await this.prisma.finEntry.create({
          data: { tipo: t.valor > 0 ? "receber" : "pagar", descricao: t.descricao || "Sem descrição", categoria: categoriaAutomatica(t.descricao, t.valor), valor: Math.abs(t.valor), competencia: data(t.data), vencimento: data(t.data), status: "pago", pagoEm: data(t.data), contaId: i.contaId, origem: "ofx", externalId, createdById: byUserId },
        });
        out.lancamentos++;
      }
      return out;
    }
    const { linhas, erros } = lerPlanilha(i.texto);
    out.erros = erros.slice(0, 50);
    for (const l of linhas) {
      const externalId = `planilha:${createHash("sha256").update(`${l.data}|${l.descricao}|${l.valor}|${l.tipo}`).digest("hex").slice(0, 32)}`;
      if (await jaExiste(externalId)) {
        out.repetidos++;
        continue;
      }
      const categoria = l.categoria && CATEGORIAS.has(l.categoria) ? l.categoria : categoriaAutomatica(l.descricao, l.tipo === "receber" ? l.valor : -l.valor);
      const pago = l.status === "pago";
      await this.prisma.finEntry.create({
        data: { tipo: l.tipo, descricao: l.descricao, categoria, valor: l.valor, competencia: data(l.data), vencimento: data(l.data), status: pago ? "pago" : "aberto", pagoEm: pago ? data(l.data) : null, contaId: i.contaId, origem: "planilha", externalId, createdById: byUserId },
      });
      out.lancamentos++;
    }
    return out;
  }

  // ------------------------------------------------------------ Telas

  async saldos(ate: string) {
    const [c, m, t] = await Promise.all([this.contas(), this.movimentos(), this.transferencias()]);
    return saldos(c, m, t, ate);
  }

  async painel(ano: number, hoje: string) {
    const [contas, movs, transf] = await Promise.all([this.contas(), this.movimentos(), this.transferencias()]);
    const atual = dre(movs, ano, "competencia");
    const anterior = dre(movs, ano - 1, "competencia");
    const mesHoje = hoje.slice(0, 7);
    // Acumulado até o mês atual, comparado com o mesmo período do ano anterior.
    const ate = (d: ReturnType<typeof dre>, limite: string) => d.meses.filter((l) => l.mes.slice(5) <= limite.slice(5));
    const soma = (ls: ReturnType<typeof dre>["meses"], k: "receitaBruta" | "margemContribuicao" | "ebitda" | "lucroLiquido" | "retiradas") => num(ls.reduce((s, l) => s + l[k], 0));
    const acum = ate(atual, mesHoje);
    const acumAnt = ate(anterior, mesHoje);
    const fechados = atual.meses.filter((l) => l.mes < mesHoje && l.receitaBruta > 0).map((l) => l.mes).slice(-3);
    const receitaAcum = soma(acum, "receitaBruta");
    const despesas = ["D01", "C01", "C02", "F01", "F02", "F03", "F04", "F05", "F06", "S01"];
    const por100 = receitaAcum > 0 ? Object.fromEntries(despesas.map((k) => [k, num((acum.reduce((s, l) => s + (l.porCategoria[k] ?? 0), 0) / receitaAcum) * 100)])) : {};
    return {
      ano,
      atencao: pontosAtencao(movs, hoje),
      acumulado: {
        receitaBruta: receitaAcum,
        margemContribuicao: soma(acum, "margemContribuicao"),
        ebitda: soma(acum, "ebitda"),
        lucroLiquido: soma(acum, "lucroLiquido"),
        retiradas: soma(acum, "retiradas"),
        anterior: { receitaBruta: soma(acumAnt, "receitaBruta"), ebitda: soma(acumAnt, "ebitda"), lucroLiquido: soma(acumAnt, "lucroLiquido"), retiradas: soma(acumAnt, "retiradas") },
      },
      saldos: saldos(contas, movs, transf, hoje),
      fluxo: fluxoCaixa(contas, movs, transf, hoje, 3),
      equilibrio: pontoEquilibrio(atual, fechados),
      porMes: atual.meses.map((l) => ({ mes: l.mes, receitaBruta: l.receitaBruta, ebitda: l.ebitda, anterior: anterior.meses.find((a) => a.mes.slice(5) === l.mes.slice(5))?.receitaBruta ?? 0 })),
      por100,
      categorias: PLANO_DE_CONTAS,
    };
  }

  async lancamentos(f: { tipo?: string; status?: string; mes?: string; categoria?: string; q?: string; contaId?: string }, hoje: string) {
    const movs = (await this.movimentos()).filter((m) => m.origem !== "stripe" || f.categoria === "R01" || f.categoria === "R02" || f.status === "pago");
    const q = f.q?.toLowerCase();
    const lista = movs
      .filter((m) => !f.tipo || m.tipo === f.tipo)
      .filter((m) => !f.status || (f.status === "vencido" ? m.status === "aberto" && m.vencimento < hoje : m.status === f.status))
      .filter((m) => !f.mes || m.vencimento.startsWith(f.mes))
      .filter((m) => !f.categoria || m.categoria === f.categoria)
      .filter((m) => !f.contaId || m.contaId === f.contaId)
      .filter((m) => !q || `${m.descricao} ${m.contraparte ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    const mesAtual = f.mes ?? hoje.slice(0, 7);
    const doMes = movs.filter((m) => m.status !== "cancelado" && m.vencimento.startsWith(mesAtual));
    const s = (t: "receber" | "pagar", st?: string) => num(doMes.filter((m) => m.tipo === t && (!st || m.status === st)).reduce((a, m) => a + m.valor, 0));
    return {
      lista: lista.slice(0, 1000),
      total: lista.length,
      resumo: { mes: mesAtual, aReceber: s("receber"), recebido: s("receber", "pago"), aPagar: s("pagar"), pago: s("pagar", "pago"), saldoPrevisto: num(s("receber") - s("pagar")), ...pontosAtencao(movs, hoje) },
      contas: await this.contas(),
      categorias: PLANO_DE_CONTAS,
    };
  }

  async extrato(f: { contaId?: string; de: string; ate: string }, hoje: string) {
    const [contas, movs, transf] = await Promise.all([this.contas(), this.movimentos(), this.transferencias()]);
    return { contas, saldos: saldos(contas, movs, transf, hoje), ...extrato(contas, movs, transf, f) };
  }

  async fluxo(hoje: string, meses: number) {
    const [contas, movs, transf] = await Promise.all([this.contas(), this.movimentos(), this.transferencias()]);
    return fluxoCaixa(contas, movs, transf, hoje, meses);
  }

  async dre(ano: number, regime: "competencia" | "caixa") {
    return { ...dre(await this.movimentos(), ano, regime), categorias: PLANO_DE_CONTAS };
  }
}

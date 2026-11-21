import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { Prisma } from "@novoseminovo/db";
import {
  CAIXAS_EMAIL,
  PROSPECCAO_MOTIVO_PARADA,
  VENDEDOR_CAIXAS,
  type VendedorCaixa,
  ProspeccaoAjustesSchema,
  ProspeccaoInscreverSchema,
  ProspeccaoPassoSchema,
  ProspeccaoRemetenteSchema,
  ProspeccaoRemoverSchema,
  ProspeccaoSequenciaSchema,
  SEQUENCIA_LOJAS_BH,
  segmentoLabel,
  type ProspeccaoAjustes,
  type ProspeccaoInscricao,
  type ProspeccaoPainel,
  type ProspeccaoPasso,
  type ProspeccaoSequencia,
  type ProspeccaoSequenciaInput,
} from "@novoseminovo/shared-types";
import { z } from "zod";
import { blindIndex, currentDataKeys } from "../common/field-encryption";
import { parseOrBadRequest } from "../common/parse";
import { signLink, verifyLink, webOrigin } from "../marketing/links";
import { trackRoutine } from "../operations/routine-health";
import { PrismaService } from "../prisma/prisma.service";
import {
  MAX_FALHAS_TEMPORARIAS,
  agendarPasso,
  descreverErroSmtp,
  falhaTemporaria,
  inicioDoDiaBr,
  intervaloEntreEnvios,
  motivoParaParar,
  podeEnviar,
  proximoHorarioUtil,
  reagendarFalha,
  renderizarEmail,
  textoDeFalhaTemporaria,
  type MotivoParada,
} from "./sequencia-regras";
import { caixaSmtpConfig, criarEnvio, nomeRemetente, prospeccaoSmtpConfig, semSenha, type EnviarProspeccao, type SmtpConfig } from "./smtp";

// Sequências de e-mail de prospecção pelo CRM do Hub. Segurança:
// - só envia sequência aprovada pelo dono ("Aprovar e ativar"; editar tira
//   a aprovação) e com o envio geral não pausado;
// - seg–sex 9h–17h (Brasília), teto por dia POR CAIXA (padrão 25, máx. 50),
//   um e-mail por vez por caixa com 2 a 6 minutos de intervalo sorteado; cada
//   inscrição sai pela caixa do vendedor do card (sem vendedor: contato@);
// - lista de bloqueio única para todas as caixas;
// - antes de cada envio confere: respondeu, saiu (lista de bloqueio pelo
//   HMAC do e-mail), "não contatar" do Hub, mudou de etapa, virou parceira;
// - todo e-mail leva rodapé legal + link de saída; todo envio vira
//   interação "E-mail" na ficha da empresa;
// - falha temporária do SMTP (4xx, conexão caiu) reagenda a mesma inscrição
//   (+30 min, +2 h, dentro da janela; log "adiado"); na 3ª seguida no mesmo
//   passo vira "erro". Falha permanente (5xx) vira "erro" direto.

const AJUSTES = "prospeccao";
const ESTADO = "prospeccao_estado";
const SAIR_PREFIXO = "prospeccao-sair|";
const ROTINA_MS = 60_000;
const IdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "Identificador inválido.");
const ATIVOS = ["agendado", "enviando"];

export type ResultadoTick = "desligado" | "sem_smtp" | "pausado" | "fora_do_horario" | "teto_do_dia" | "intervalo" | "nada_para_enviar" | "enviado" | "erro";
export type ResultadoReenvio = { reagendadas: number; emOutraSequencia: number };
export type ResultadoInscricao = { inscritas: number; puladas: { jaInscritas: number; emOutraSequencia: number; semEmail: number; sairam: number; parceiras: number; outraEtapa: number; outraCaixa: number } };
type SeqComVendedor = { salesAgent: { id: string; name: string; mailbox: string | null } | null };

// Resultado do tick com várias caixas: o mais importante entre elas.
const PRIORIDADE: ResultadoTick[] = ["enviado", "erro", "teto_do_dia", "intervalo", "pausado", "fora_do_horario", "nada_para_enviar"];

const passosDe = (json: Prisma.JsonValue): ProspeccaoPasso[] => z.array(ProspeccaoPassoSchema).catch([]).parse(json);

@Injectable()
export class ProspeccaoSequenciasService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("Prospecção");
  private timer?: NodeJS.Timeout;
  private rodando = false;
  private envioDeTeste?: EnviarProspeccao;

  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------ ajustes

  async ajustes(): Promise<ProspeccaoAjustes> {
    const r = await this.prisma.mktSetting.findUnique({ where: { chave: AJUSTES } });
    return ProspeccaoAjustesSchema.catch({ limiteDiario: 25, pausado: false }).parse(r?.valor ?? {});
  }

  async salvarAjustes(raw: ProspeccaoAjustes): Promise<ProspeccaoAjustes> {
    const valor = parseOrBadRequest(ProspeccaoAjustesSchema as z.ZodType<ProspeccaoAjustes>, raw);
    await this.prisma.mktSetting.upsert({ where: { chave: AJUSTES }, create: { chave: AJUSTES, valor }, update: { valor } });
    return valor;
  }

  private chaveEstado(caixa: VendedorCaixa): string {
    return caixa === "prospeccao" ? ESTADO : `${ESTADO}:${caixa}`;
  }

  private async liberadoApos(caixa: VendedorCaixa): Promise<Date | undefined> {
    const r = await this.prisma.mktSetting.findUnique({ where: { chave: this.chaveEstado(caixa) } });
    const v = (r?.valor as { liberadoApos?: string } | null)?.liberadoApos;
    return v ? new Date(v) : undefined;
  }

  private async liberarEm(caixa: VendedorCaixa, d: Date) {
    const valor = { liberadoApos: d.toISOString() };
    const chave = this.chaveEstado(caixa);
    await this.prisma.mktSetting.upsert({ where: { chave }, create: { chave, valor }, update: { valor } });
  }

  // ------------------------------------------------------------ sequências

  // Rascunho "Lojas BH" com os textos do Diego (nunca ativo sozinho).
  async garantirRascunhoLojasBh(): Promise<string> {
    const existe = await this.prisma.prospectSequence.findFirst({ where: { name: SEQUENCIA_LOJAS_BH.nome }, select: { id: true } });
    if (existe) return existe.id;
    const s = await this.prisma.prospectSequence.create({ data: { name: SEQUENCIA_LOJAS_BH.nome, status: "rascunho", steps: SEQUENCIA_LOJAS_BH.passos as Prisma.InputJsonValue } });
    return s.id;
  }

  async salvar(id: string | undefined, raw: ProspeccaoSequenciaInput, userId: string): Promise<{ id: string }> {
    const input = parseOrBadRequest(ProspeccaoSequenciaSchema, raw);
    const data = { name: input.nome, steps: input.passos as Prisma.InputJsonValue };
    if (!id) return this.prisma.prospectSequence.create({ data: { ...data, createdById: userId, status: "rascunho" }, select: { id: true } });
    await this.existe(id);
    // Texto mudou: volta para rascunho e precisa ser aprovado de novo.
    await this.prisma.prospectSequence.update({ where: { id }, data: { ...data, status: "rascunho", approvedAt: null, approvedById: null } });
    return { id };
  }

  private async existe(id: string) {
    const s = await this.prisma.prospectSequence.findUnique({ where: { id: parseOrBadRequest(IdSchema, id) }, include: { salesAgent: { select: { id: true, name: true, mailbox: true } } } });
    if (!s) throw new NotFoundException("Sequência não encontrada.");
    return s;
  }

  async aprovar(id: string, userId: string): Promise<void> {
    const s = await this.existe(id);
    if (!passosDe(s.steps).length) throw new BadRequestException("Sequência sem e-mails.");
    await this.prisma.prospectSequence.update({ where: { id }, data: { status: "ativa", approvedAt: new Date(), approvedById: userId } });
  }

  async pausar(id: string): Promise<void> {
    await this.existe(id);
    await this.prisma.prospectSequence.update({ where: { id }, data: { status: "pausada" } });
  }

  async painel(): Promise<ProspeccaoPainel> {
    await this.garantirRascunhoLojasBh();
    const [ajustes, cfg, rows, contagens, enviadosHoje] = await Promise.all([
      this.ajustes(),
      Promise.resolve(prospeccaoSmtpConfig()),
      this.prisma.prospectSequence.findMany({ orderBy: { createdAt: "asc" }, include: { salesAgent: { select: { id: true, name: true, mailbox: true } } } }),
      this.prisma.prospectEnrollment.groupBy({ by: ["sequenceId", "status"], _count: { _all: true } }),
      this.prisma.prospectEmailLog.count({ where: { status: "enviado", createdAt: { gte: inicioDoDiaBr(new Date()) } } }),
    ]);
    const aprovadores = await this.nomes(rows.map((r) => r.approvedById));
    return {
      ajustes,
      enviadosHoje,
      smtpConfigurado: Boolean(cfg),
      remetente: cfg ? `${cfg.fromName} <${cfg.user}>` : undefined,
      rotinaDesligada: this.desligada(),
      sequencias: rows.map((r) => this.vista(r, aprovadores, contagens)),
    };
  }

  private async nomes(ids: (string | null)[]): Promise<Map<string, string>> {
    const lista = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    const users = lista.length ? await this.prisma.user.findMany({ where: { id: { in: lista } }, select: { id: true, name: true } }) : [];
    return new Map(users.map((u) => [u.id, u.name]));
  }

  private vista(r: { id: string; name: string; status: string; steps: Prisma.JsonValue; approvedById: string | null; approvedAt: Date | null; updatedAt: Date } & SeqComVendedor, aprovadores: Map<string, string>, contagens: { sequenceId: string; status: string; _count: { _all: number } }[]): ProspeccaoSequencia {
    return {
      id: r.id,
      nome: r.name,
      status: r.status as ProspeccaoSequencia["status"],
      passos: passosDe(r.steps),
      aprovadaPor: r.approvedById ? aprovadores.get(r.approvedById) : undefined,
      aprovadaEm: r.approvedAt?.toISOString(),
      atualizadaEm: r.updatedAt.toISOString(),
      inscritas: Object.fromEntries(contagens.filter((c) => c.sequenceId === r.id).map((c) => [c.status, c._count._all])),
      remetente: r.salesAgent
        ? { vendedorId: r.salesAgent.id, nome: r.salesAgent.name, caixa: r.salesAgent.mailbox ?? undefined, endereco: r.salesAgent.mailbox && r.salesAgent.mailbox in CAIXAS_EMAIL ? CAIXAS_EMAIL[r.salesAgent.mailbox as VendedorCaixa].endereco : undefined }
        : undefined,
    };
  }

  // Remetente (vendedor IA) da sequência. Só o dono (controller). Não envia nada.
  async definirRemetente(id: string, raw: z.input<typeof ProspeccaoRemetenteSchema>): Promise<void> {
    await this.existe(id);
    const { vendedorId } = parseOrBadRequest(ProspeccaoRemetenteSchema, raw);
    if (vendedorId && !(await this.prisma.salesAgent.findUnique({ where: { id: vendedorId }, select: { id: true } }))) throw new NotFoundException("Vendedor não encontrado.");
    await this.prisma.prospectSequence.update({ where: { id }, data: { salesAgentId: vendedorId } });
  }

  async detalhe(id: string): Promise<{ sequencia: ProspeccaoSequencia; inscricoes: ProspeccaoInscricao[]; previa: { assunto: string; texto: string; html: string }[]; exemplo: string; falhasTemporarias: number }> {
    const s = await this.existe(id);
    const [aprovadores, contagens, inscricoes, falhas] = await Promise.all([
      this.nomes([s.approvedById]),
      this.prisma.prospectEnrollment.groupBy({ by: ["sequenceId", "status"], where: { sequenceId: id }, _count: { _all: true } }),
      this.prisma.prospectEnrollment.findMany({ where: { sequenceId: id }, include: { prospect: { select: { id: true, name: true, city: true, segment: true } } }, orderBy: [{ updatedAt: "desc" }], take: 2000 }),
      this.falhasTemporarias(id),
    ]);
    // Prévia com uma empresa de verdade inscrita (ou uma de exemplo).
    const amostra = inscricoes[0]?.prospect ?? { id: "exemplo", name: "Loja Exemplo Veículos", city: "Belo Horizonte" };
    const passos = passosDe(s.steps);
    const primeiro = passos[0] ? renderizarEmail(passos[0], { empresa: amostra.name, cidade: amostra.city ?? undefined }, { linkSair: this.linkSair(amostra.id), numero: 1 }).assunto : "";
    return {
      sequencia: this.vista(s, aprovadores, contagens),
      exemplo: amostra.name,
      falhasTemporarias: falhas.length,
      previa: passos.map((p, i) => renderizarEmail(p, { empresa: amostra.name, cidade: amostra.city ?? undefined }, { linkSair: this.linkSair(amostra.id), numero: i + 1, assuntoPrimeiro: primeiro })),
      inscricoes: inscricoes.map((e) => ({
        id: e.id,
        empresa: e.prospect.name,
        cardId: e.prospect.id,
        segmento: e.prospect.segment,
        status: e.status as ProspeccaoInscricao["status"],
        passosEnviados: e.stepsSent,
        proximoEnvio: ATIVOS.includes(e.status) ? e.nextSendAt?.toISOString() : undefined,
        ultimoEnvio: e.lastSentAt?.toISOString(),
        motivo: e.stopReason ? (PROSPECCAO_MOTIVO_PARADA[e.stopReason as keyof typeof PROSPECCAO_MOTIVO_PARADA] ?? e.stopReason) : undefined,
        erro: e.lastError ?? undefined,
        tentativas: ATIVOS.includes(e.status) && e.tempRetries ? e.tempRetries : undefined,
      })),
    };
  }

  // ------------------------------------------------------------ inscrição

  private hashEmail(email: string): string {
    return blindIndex("email", email, currentDataKeys());
  }

  private async suprimidos(emails: string[]): Promise<Set<string>> {
    if (!emails.length) return new Set();
    const hashes = emails.map((e) => this.hashEmail(e));
    const rows = await this.prisma.prospectSuppression.findMany({ where: { addressHmac: { in: hashes } }, select: { addressHmac: true } });
    return new Set(rows.map((r) => r.addressHmac));
  }

  private async naoContatar(ids: string[]): Promise<Set<string>> {
    if (!ids.length) return new Set();
    const marcas = await this.prisma.hubMark.findMany({ where: { key: { in: ids }, naoContatar: true }, select: { key: true } });
    return new Set(marcas.map((m) => m.key));
  }

  // Caixa de uma inscrição: a do vendedor da sequência; sem ele, a do
  // vendedor do card; sem nenhum, o contato@.
  private caixaDe(seq: SeqComVendedor, card: { salesAgent: { mailbox: string | null } | null }): VendedorCaixa {
    const c = seq.salesAgent?.mailbox ?? card.salesAgent?.mailbox ?? "prospeccao";
    return (c in CAIXAS_EMAIL ? c : "prospeccao") as VendedorCaixa;
  }

  // Caixas que já falaram (ou vão falar) com este endereço, em qualquer card:
  // e-mails enviados, respostas mandadas e inscrições ativas.
  async caixasDoEndereco(email: string, ignorarCard?: string): Promise<Set<VendedorCaixa>> {
    const cards = await this.prisma.salesProspect.findMany({ where: { email }, select: { id: true, salesAgent: { select: { mailbox: true } } } });
    const ids = cards.map((c) => c.id).filter((c) => c !== ignorarCard);
    const r = new Set<VendedorCaixa>();
    if (!ids.length) return r;
    const [logs, msgs, ativas] = await Promise.all([
      this.prisma.prospectEmailLog.findMany({ where: { status: "enviado", enrollment: { prospectId: { in: ids } } }, select: { mailbox: true }, distinct: ["mailbox"] }),
      this.prisma.prospectMessage.findMany({ where: { prospectId: { in: ids }, direction: "out", channel: "email" }, select: { mailbox: true }, distinct: ["mailbox"] }),
      this.prisma.prospectEnrollment.findMany({ where: { prospectId: { in: ids }, activeKey: { not: null } }, select: { sequence: { select: { salesAgent: { select: { id: true, name: true, mailbox: true } } } }, prospect: { select: { salesAgent: { select: { mailbox: true } } } } } }),
    ]);
    for (const l of [...logs, ...msgs]) r.add(((l.mailbox ?? "prospeccao") in CAIXAS_EMAIL ? (l.mailbox ?? "prospeccao") : "prospeccao") as VendedorCaixa);
    for (const a of ativas) r.add(this.caixaDe(a.sequence, a.prospect));
    return r;
  }

  async inscrever(id: string, raw: z.input<typeof ProspeccaoInscreverSchema>, userId: string, agora = new Date()): Promise<ResultadoInscricao> {
    const seq = await this.existe(id);
    const filtro = parseOrBadRequest(ProspeccaoInscreverSchema, raw);
    const cards = await this.prisma.salesProspect.findMany({
      where: { AND: [filtro.etiqueta ? { campaignTag: filtro.etiqueta } : {}, filtro.segmento ? { segment: filtro.segmento } : {}, filtro.ids?.length ? { id: { in: filtro.ids } } : {}] },
      select: { id: true, email: true, stage: true, partnerId: true, optedOutAt: true, repliedAt: true, emailInvalidAt: true, salesAgent: { select: { mailbox: true } } },
      take: 5000,
    });
    const r: ResultadoInscricao = { inscritas: 0, puladas: { jaInscritas: 0, emOutraSequencia: 0, semEmail: 0, sairam: 0, parceiras: 0, outraEtapa: 0, outraCaixa: 0 } };
    const bloqueados = await this.suprimidos(cards.map((c) => c.email).filter((e): e is string => Boolean(e)));
    const marcados = await this.naoContatar(cards.map((c) => c.id));
    const jaNesta = new Set((await this.prisma.prospectEnrollment.findMany({ where: { sequenceId: id, prospectId: { in: cards.map((c) => c.id) } }, select: { prospectId: true } })).map((e) => e.prospectId));
    const quando = agendarPasso(agora, 0);
    for (const c of cards) {
      if (jaNesta.has(c.id)) {
        r.puladas.jaInscritas++;
        continue;
      }
      if (c.partnerId) {
        r.puladas.parceiras++;
        continue;
      }
      if (!c.email || c.emailInvalidAt) {
        r.puladas.semEmail++;
        continue;
      }
      if (c.optedOutAt || marcados.has(c.id) || bloqueados.has(this.hashEmail(c.email))) {
        r.puladas.sairam++;
        continue;
      }
      if (c.stage !== "a_abordar" || c.repliedAt) {
        r.puladas.outraEtapa++;
        continue;
      }
      // Regra fixa: o mesmo endereço nunca recebe e-mail de duas caixas.
      const caixa = this.caixaDe(seq, c);
      if ([...(await this.caixasDoEndereco(c.email, c.id))].some((x) => x !== caixa)) {
        r.puladas.outraCaixa++;
        continue;
      }
      try {
        // activeKey único: a empresa não fica em duas sequências ativas.
        await this.prisma.prospectEnrollment.create({ data: { sequenceId: id, prospectId: c.id, activeKey: c.id, status: "agendado", nextSendAt: quando, enrolledById: userId } });
        r.inscritas++;
      } catch (error) {
        if ((error as { code?: string }).code !== "P2002") throw error;
        const mesma = await this.prisma.prospectEnrollment.findUnique({ where: { sequenceId_prospectId: { sequenceId: id, prospectId: c.id } }, select: { id: true } });
        if (mesma) r.puladas.jaInscritas++;
        else r.puladas.emOutraSequencia++;
      }
    }
    return r;
  }

  // Tira empresas da sequência (uma ou várias). Sem e-mail enviado, a
  // inscrição some; com e-mail enviado, fica no histórico como "retirada".
  // Nada é enviado. A empresa fica livre para outra sequência.
  async remover(id: string, raw: z.input<typeof ProspeccaoRemoverSchema>): Promise<{ removidas: number }> {
    await this.existe(id);
    const { ids } = parseOrBadRequest(ProspeccaoRemoverSchema, raw);
    const apagadas = await this.prisma.prospectEnrollment.deleteMany({ where: { sequenceId: id, prospectId: { in: ids }, stepsSent: 0, status: { in: ATIVOS } } });
    const paradas = await this.prisma.prospectEnrollment.updateMany({ where: { sequenceId: id, prospectId: { in: ids }, status: { in: ATIVOS } }, data: { status: "parou", stopReason: "removida", activeKey: null, nextSendAt: null } });
    return { removidas: apagadas.count + paradas.count };
  }

  // ------------------------------------------------------------ falhas temporárias

  // Inscrições paradas em "erro" cuja última falha foi temporária (SMTP 4xx,
  // conexão caiu). Inclui as de antes da correção (só o texto do erro).
  private async falhasTemporarias(sequenceId: string): Promise<{ id: string; prospectId: string }[]> {
    const rows = await this.prisma.prospectEnrollment.findMany({ where: { sequenceId, status: "erro", lastError: { not: null } }, select: { id: true, prospectId: true, lastError: true }, take: 5000 });
    return rows.filter((r) => textoDeFalhaTemporaria(r.lastError));
  }

  // Botão "Reenviar falhas temporárias" (só o dono). Só sequência ativa e
  // aprovada. Volta para "agendado" agora (dentro da janela); a rodada de
  // envio confere tudo de novo antes de mandar (respondeu, saiu, lista de
  // bloqueio, outra caixa, etapa) e respeita teto, intervalo e ordem: não
  // aumenta o volume. Empresa que entrou em outra sequência ativa fica de fora.
  async reenviarFalhasTemporarias(id: string, agora = new Date()): Promise<ResultadoReenvio> {
    const seq = await this.existe(id);
    if (seq.status !== "ativa" || !seq.approvedAt) throw new BadRequestException("A sequência precisa estar ativa e aprovada para reenviar.");
    const r: ResultadoReenvio = { reagendadas: 0, emOutraSequencia: 0 };
    const quando = proximoHorarioUtil(agora);
    for (const f of await this.falhasTemporarias(id)) {
      try {
        const u = await this.prisma.prospectEnrollment.updateMany({
          where: { id: f.id, status: "erro" },
          data: { status: "agendado", nextSendAt: quando, tempRetries: 0, activeKey: f.prospectId, lastError: null, stopReason: null },
        });
        r.reagendadas += u.count;
      } catch (error) {
        // activeKey único: a empresa já está em outra sequência ativa.
        if ((error as { code?: string }).code !== "P2002") throw error;
        r.emOutraSequencia++;
      }
    }
    if (r.reagendadas) this.logger.log(`Sequência ${id}: ${r.reagendadas} inscrição(ões) com falha temporária de volta na fila.`);
    return r;
  }

  // ------------------------------------------------------------ parar

  private async parar(prospectId: string, status: "respondeu" | "saiu" | "parou", motivo: MotivoParada | "removida") {
    await this.prisma.prospectEnrollment.updateMany({ where: { prospectId, status: { in: ATIVOS } }, data: { status, stopReason: motivo, activeKey: null, nextSendAt: null } });
  }

  async respondeu(prospectId: string, userId: string): Promise<void> {
    const id = parseOrBadRequest(IdSchema, prospectId);
    const card = await this.prisma.salesProspect.findUnique({ where: { id }, select: { id: true } });
    if (!card) throw new NotFoundException("Empresa não encontrada.");
    await this.prisma.salesProspect.update({ where: { id }, data: { repliedAt: new Date() } });
    await this.parar(id, "respondeu", "respondeu");
    await this.prisma.salesNote.create({ data: { prospectId: id, authorId: userId, kind: "email", body: "Respondeu o e-mail de prospecção. A sequência de e-mails parou para esta empresa." } });
  }

  async mudarSegmento(prospectId: string, segmento: string, userId: string): Promise<void> {
    const id = parseOrBadRequest(IdSchema, prospectId);
    const card = await this.prisma.salesProspect.findUnique({ where: { id }, select: { segment: true } });
    if (!card) throw new NotFoundException("Empresa não encontrada.");
    if (card.segment === segmento) return;
    await this.prisma.salesProspect.update({ where: { id }, data: { segment: segmento } });
    await this.prisma.salesNote.create({ data: { prospectId: id, authorId: userId, kind: "note", body: `Tipo da empresa trocado: ${segmentoLabel(card.segment)} → ${segmentoLabel(segmento)}.` } });
  }

  // Token do link de saída: id do card + assinatura (HMAC).
  tokenSair(prospectId: string): string {
    return `${prospectId}.${signLink(`${SAIR_PREFIXO}${prospectId}`)}`;
  }

  private linkSair(prospectId: string): string {
    return `${webOrigin()}/sair/${this.tokenSair(prospectId)}`;
  }

  async sair(token: string): Promise<boolean> {
    const m = /^([A-Za-z0-9_-]{1,40})\.([A-Za-z0-9_-]{22})$/.exec(token ?? "");
    if (!m || !verifyLink(`${SAIR_PREFIXO}${m[1]}`, m[2]!)) return false;
    const card = await this.prisma.salesProspect.findUnique({ where: { id: m[1]! }, select: { id: true, email: true, optedOutAt: true } });
    if (!card) return false;
    if (!card.optedOutAt) {
      await this.prisma.salesProspect.update({ where: { id: card.id }, data: { optedOutAt: new Date() } });
      await this.prisma.salesNote.create({ data: { prospectId: card.id, kind: "note", body: "Pediu para sair dos e-mails de prospecção (link do e-mail). Nenhum e-mail de sequência será enviado para este endereço." } });
    }
    if (card.email) await this.prisma.prospectSuppression.upsert({ where: { addressHmac: this.hashEmail(card.email) }, create: { addressHmac: this.hashEmail(card.email), reason: "link" }, update: {} });
    await this.parar(card.id, "saiu", "saiu");
    return true;
  }

  // ------------------------------------------------------------ envio

  // Testes trocam o envio (sem SMTP de verdade).
  usarEnvio(envio: EnviarProspeccao | undefined) {
    this.envioDeTeste = envio;
  }

  private desligada(): boolean {
    return process.env.NODE_ENV === "test" || process.env.PROSPECCAO_DISABLED === "1";
  }

  // Caixas que podem mandar agora (configuradas; nos testes, o envio falso vale para todas).
  private caixasProntas(): { caixa: VendedorCaixa; cfg?: SmtpConfig }[] {
    return VENDEDOR_CAIXAS.map((caixa) => ({ caixa, cfg: caixaSmtpConfig(caixa) })).filter((c) => c.cfg || this.envioDeTeste);
  }

  // Inscrições de cada caixa: as das sequências do vendedor dela; sequência
  // sem vendedor usa o vendedor do card; sem nenhum, o contato@.
  private filtroCaixa(caixa: VendedorCaixa): Prisma.ProspectEnrollmentWhereInput {
    const doCard: Prisma.SalesProspectWhereInput = caixa === "prospeccao" ? { OR: [{ salesAgentId: null }, { salesAgent: { mailbox: "prospeccao" } }] } : { salesAgent: { mailbox: caixa } };
    return { OR: [{ sequence: { salesAgent: { mailbox: caixa } } }, { sequence: { salesAgentId: null }, prospect: doCard }] };
  }

  private filtroLogCaixa(caixa: VendedorCaixa): Prisma.ProspectEmailLogWhereInput {
    return caixa === "prospeccao" ? { OR: [{ mailbox: "prospeccao" }, { mailbox: null }] } : { mailbox: caixa };
  }

  // Um e-mail por vez em cada caixa. somenteSequencias: só para os testes isolarem os dados.
  async tick(agora = new Date(), opcoes: { somenteSequencias?: string[] } = {}): Promise<ResultadoTick> {
    const caixas = this.caixasProntas();
    if (!caixas.length) return "sem_smtp";
    const ajustes = await this.ajustes();
    // Vendedores IA que não podem mandar agora (pausados, sem caixa, fora do
    // ar, teto do dia deles, pausa geral): os cards deles esperam.
    const bloqueados = await this.vendedoresBloqueados(agora);
    const resultados: ResultadoTick[] = [];
    for (const { caixa, cfg } of caixas) resultados.push(await this.tickCaixa(caixa, cfg, ajustes, bloqueados, agora, opcoes));
    return PRIORIDADE.find((r) => resultados.includes(r)) ?? "nada_para_enviar";
  }

  private async tickCaixa(caixa: VendedorCaixa, cfg: SmtpConfig | undefined, ajustes: ProspeccaoAjustes, bloqueados: string[], agora: Date, opcoes: { somenteSequencias?: string[] }): Promise<ResultadoTick> {
    const enviadosHoje = await this.prisma.prospectEmailLog.count({ where: { status: "enviado", createdAt: { gte: inicioDoDiaBr(agora), lte: agora }, ...this.filtroLogCaixa(caixa) } });
    const pode = podeEnviar({ agora, enviadosHoje, limite: ajustes.limiteDiario, pausado: ajustes.pausado, liberadoApos: await this.liberadoApos(caixa) });
    if (!pode.ok) return pode.motivo;

    for (let tentativas = 0; tentativas < 25; tentativas++) {
      const e = await this.prisma.prospectEnrollment.findFirst({
        where: {
          status: "agendado",
          nextSendAt: { lte: agora },
          sequence: { status: "ativa", approvedAt: { not: null } },
          ...(opcoes.somenteSequencias ? { sequenceId: { in: opcoes.somenteSequencias } } : {}),
          AND: [
            this.filtroCaixa(caixa),
            // Vendedor que não pode mandar agora: o da sequência ou, sem ele, o do card.
            ...(bloqueados.length
              ? [{ OR: [{ sequence: { salesAgentId: { notIn: bloqueados } } }, { sequence: { salesAgentId: null }, prospect: { OR: [{ salesAgentId: null }, { salesAgentId: { notIn: bloqueados } }] } }] }]
              : []),
          ],
        },
        orderBy: [{ nextSendAt: "asc" }, { createdAt: "asc" }],
        include: { sequence: { include: { salesAgent: { select: { id: true, name: true, mailbox: true } } } }, prospect: { select: { id: true, name: true, city: true, email: true, stage: true, repliedAt: true, optedOutAt: true, partnerId: true, emailInvalidAt: true, salesAgent: { select: { id: true, name: true } } } } },
      });
      if (!e) return "nada_para_enviar";
      const p = e.prospect;
      const motivo = p.emailInvalidAt ? "sem_email" : motivoParaParar(p, {
        suprimido: p.email ? (await this.suprimidos([p.email])).size > 0 : false,
        naoContatar: (await this.naoContatar([p.id])).size > 0,
      });
      // O mesmo endereço já falou com outra caixa: não manda (e avisa na inscrição).
      if (!motivo && p.email && [...(await this.caixasDoEndereco(p.email, p.id))].some((x) => x !== caixa)) {
        this.logger.warn(`Inscrição ${e.id}: o mesmo e-mail já foi contatado por outra caixa; não enviado.`);
        await this.prisma.prospectEnrollment.update({ where: { id: e.id }, data: { status: "parou", stopReason: "outra_caixa", activeKey: null, nextSendAt: null } });
        continue;
      }
      if (motivo) {
        const status = motivo === "respondeu" ? "respondeu" : motivo === "saiu" ? "saiu" : motivo === "sem_email" ? (p.emailInvalidAt ? "parou" : "erro") : "parou";
        await this.prisma.prospectEnrollment.update({ where: { id: e.id }, data: { status, stopReason: motivo, activeKey: null, nextSendAt: null } });
        continue;
      }
      const passos = passosDe(e.sequence.steps);
      const n = e.stepsSent;
      const passo = passos[n];
      if (!passo) {
        await this.prisma.prospectEnrollment.update({ where: { id: e.id }, data: { status: "concluido", activeKey: null, nextSendAt: null } });
        continue;
      }
      // Trava: só um envio por inscrição, mesmo com duas rotinas ao mesmo tempo.
      const trava = await this.prisma.prospectEnrollment.updateMany({ where: { id: e.id, status: "agendado", stepsSent: n }, data: { status: "enviando" } });
      if (trava.count !== 1) continue;
      return this.enviar(e, passos, n, agora, caixa, cfg);
    }
    return "nada_para_enviar";
  }

  private async enviar(
    e: { id: string; tempRetries: number; firstMessageId: string | null; firstSubject: string | null; sequence: { name: string } & SeqComVendedor; prospect: { id: string; name: string; city: string | null; email: string | null; salesAgent: { id: string; name: string } | null } },
    passos: ProspeccaoPasso[],
    n: number,
    agora: Date,
    caixa: VendedorCaixa,
    cfg: SmtpConfig | undefined,
  ): Promise<ResultadoTick> {
    const p = e.prospect;
    // Quem manda: o vendedor da sequência (e as respostas vão para ele); sem ele, o do card.
    const vendedor = e.sequence.salesAgent ?? p.salesAgent;
    const email = renderizarEmail(passos[n]!, { empresa: p.name, cidade: p.city ?? undefined }, { linkSair: this.linkSair(p.id), numero: n + 1, assuntoPrimeiro: e.firstSubject ?? undefined });
    const messageId = `<prospeccao.${e.id}.${n + 1}.${randomBytes(6).toString("hex")}@novoseminovo.com.br>`;
    const umClique = `${(process.env.PUBLIC_API_URL ?? "").replace(/\/+$/, "")}/prospeccao/sair/${this.tokenSair(p.id)}`;
    const remetente = cfg?.user ?? CAIXAS_EMAIL[caixa].endereco;
    // Descadastro de um clique (Gmail/Yahoo) só com o endereço https da API.
    const https = /^https:\/\//.test(umClique);
    const cabecalhos: Record<string, string> = {
      "List-Unsubscribe": `${https ? `<${umClique}>, ` : ""}<mailto:${remetente}?subject=SAIR>`,
      ...(https ? { "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : {}),
    };
    await this.liberarEm(caixa, new Date(agora.getTime() + intervaloEntreEnvios()));
    try {
      const envio = this.envioDeTeste ?? criarEnvio(cfg!);
      await envio({ para: p.email!, assunto: email.assunto, texto: email.texto, html: email.html, messageId, inReplyTo: n > 0 ? (e.firstMessageId ?? undefined) : undefined, cabecalhos, caixa, deNome: nomeRemetente(caixa) ?? (vendedor ? `${vendedor.name} | NovoSeminovo` : undefined) });
    } catch (error) {
      const msg = semSenha(descreverErroSmtp(error), cfg).slice(0, 300);
      const falhas = e.tempRetries + 1;
      // Temporária (4xx, conexão): tenta de novo mais tarde, mantendo a vaga.
      if (falhaTemporaria(error) && falhas < MAX_FALHAS_TEMPORARIAS) {
        const quando = reagendarFalha(agora, falhas);
        this.logger.warn(`Falha temporária ao enviar e-mail de prospecção (inscrição ${e.id}, passo ${n + 1}, tentativa ${falhas}): ${msg}. Nova tentativa em ${quando.toISOString()}.`);
        await this.prisma.prospectEmailLog.create({ data: { enrollmentId: e.id, step: n + 1, status: "adiado", error: msg, createdAt: agora, salesAgentId: vendedor?.id, mailbox: caixa } });
        await this.prisma.prospectEnrollment.update({ where: { id: e.id }, data: { status: "agendado", lastError: msg, tempRetries: falhas, nextSendAt: quando } });
        return "erro";
      }
      this.logger.warn(`Falha ao enviar e-mail de prospecção (inscrição ${e.id}, passo ${n + 1}): ${msg}`);
      await this.prisma.prospectEmailLog.create({ data: { enrollmentId: e.id, step: n + 1, status: "erro", error: msg, createdAt: agora, salesAgentId: vendedor?.id, mailbox: caixa } });
      await this.prisma.prospectEnrollment.update({ where: { id: e.id }, data: { status: "erro", lastError: msg, activeKey: null, nextSendAt: null, tempRetries: 0 } });
      return "erro";
    }
    const ultimo = n + 1 >= passos.length;
    await this.prisma.prospectEmailLog.create({ data: { enrollmentId: e.id, step: n + 1, status: "enviado", messageId, createdAt: agora, salesAgentId: vendedor?.id, mailbox: caixa } });
    if (vendedor && p.salesAgent?.id !== vendedor.id) await this.prisma.salesProspect.update({ where: { id: p.id }, data: { salesAgentId: vendedor.id } });
    await this.prisma.prospectEnrollment.update({
      where: { id: e.id },
      data: {
        stepsSent: n + 1,
        lastSentAt: agora,
        lastError: null,
        tempRetries: 0,
        ...(n === 0 ? { firstMessageId: messageId, firstSubject: email.assunto } : {}),
        ...(ultimo ? { status: "concluido", activeKey: null, nextSendAt: null } : { status: "agendado", nextSendAt: agendarPasso(agora, passos[n + 1]!.esperaDias) }),
      },
    });
    await this.prisma.salesNote.create({ data: { prospectId: p.id, kind: "email", body: `E-mail de prospecção enviado${vendedor ? ` por ${vendedor.name} (assistente comercial IA)` : ""} (sequência "${e.sequence.name}", passo ${n + 1}/${passos.length}): "${email.assunto}".`.slice(0, 2000) } });
    return "enviado";
  }

  // Vendedores IA que não mandam e-mail agora: fora do ar, sem caixa,
  // pausados (ou pausa geral) ou que já bateram o teto do dia deles.
  async vendedoresBloqueados(agora: Date): Promise<string[]> {
    const geral = await this.prisma.mktSetting.findUnique({ where: { chave: "vendedores_ia" } });
    const pausarTodos = Boolean((geral?.valor as { pausarTodos?: boolean } | null)?.pausarTodos);
    const vendedores = await this.prisma.salesAgent.findMany({ select: { id: true, active: true, paused: true, mailbox: true, dailyEmailCap: true } });
    if (!vendedores.length) return [];
    const inicio = inicioDoDiaBr(agora);
    const [logs, respostas] = await Promise.all([
      this.prisma.prospectEmailLog.groupBy({ by: ["salesAgentId"], where: { status: "enviado", createdAt: { gte: inicio, lte: agora }, salesAgentId: { not: null } }, _count: { _all: true } }),
      this.prisma.prospectMessage.groupBy({ by: ["salesAgentId"], where: { direction: "out", channel: "email", createdAt: { gte: inicio, lte: agora }, salesAgentId: { not: null } }, _count: { _all: true } }),
    ]);
    const hoje = new Map<string, number>();
    for (const r of [...logs, ...respostas]) hoje.set(r.salesAgentId!, (hoje.get(r.salesAgentId!) ?? 0) + r._count._all);
    return vendedores.filter((v) => pausarTodos || !v.active || v.paused || !v.mailbox || (hoje.get(v.id) ?? 0) >= v.dailyEmailCap).map((v) => v.id);
  }

  // A cada minuto (um e-mail por vez). Desligada em teste ou com PROSPECCAO_DISABLED=1.
  onModuleInit(): void {
    if (this.desligada()) return;
    this.timer = setInterval(() => {
      if (this.rodando) return;
      this.rodando = true;
      void trackRoutine("prospeccao-emails", ROTINA_MS, () => this.tick()).finally(() => {
        this.rodando = false;
      });
    }, ROTINA_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}

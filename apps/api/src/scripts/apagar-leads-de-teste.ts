// Apaga os 5 leads de TESTE que aparecem na lista de Leads (Hub → Leads de
// compradores; pedido do Diego, 24/11/2026). Rodar no servidor, depois do
// backup e do deploy (ver DEPLOY.md, "Apagar os leads de teste"):
//
//   docker compose exec api node dist/scripts/apagar-leads-de-teste.js             (só mostra o plano)
//   docker compose exec api node dist/scripts/apagar-leads-de-teste.js --confirmar (apaga de verdade)
//
// De onde vêm (ver apps/api/src/hub/compradores.service.ts):
//   - "Formulário Meta" = contato de marketing (marketing_contacts) com
//     source "meta_lead_ads". Junto saem os e-mails e inscrições de sequência
//     desse contato (o banco apaga em cascata). O registro do leadgen da Meta
//     (meta_leadgens) FICA de propósito: é ele que impede a rotina de
//     segurança de importar o mesmo lead de novo.
//   - "Financiamento" = pedido de financiamento (financing_leads). Junto saem
//     as provas de consentimento de crédito dele (credit_consents, cascata) —
//     aceites de teste do próprio Diego/Ronaldo, não de cliente.
//     Ficam: a conversa do assistente, o contato de marketing que o pedido
//     criou (é o e-mail do próprio Diego) e os avisos já enviados.
//
// Critérios estreitos: cada item precisa bater com EXATAMENTE 1 registro
// (minuto exato em Brasília + nome; ou e-mail test@meta.com). Achou 0 ou mais
// de 1: nada é apagado daquele item. Pedido que já foi ENVIADO à
// Credihome/Creditas (histórico de envio a parceiro) só sai com
// --incluir-enviados; pedido com negócio registrado (comissão) nunca sai.
// Rodar de novo é seguro: o que já saiu aparece como "não encontrado".
import "dotenv/config";
import type { Prisma } from "@novoseminovo/db";
import { PrismaService } from "../prisma/prisma.service";

export type AlvoFinanciamento = { tipo: "financiamento"; rotulo: string; minuto: string; nome: string };
export type AlvoMeta = { tipo: "formulario_meta"; rotulo: string; email: string };
export type Alvo = AlvoFinanciamento | AlvoMeta;

// minuto = data e hora de Brasília (-03:00) como aparece na lista.
export const ALVOS: readonly Alvo[] = [
  { tipo: "formulario_meta", rotulo: "24/11/2026 16:43 — Formulário Meta (Testador de Lead Ads)", email: "test@meta.com" },
  { tipo: "financiamento", rotulo: "13/11/2026 19:33 — Financiamento, Diego Louis Pereira", minuto: "2026-11-13T19:33", nome: "Diego Louis Pereira" },
  { tipo: "financiamento", rotulo: "27/10/2026 10:35 — Financiamento, Diego Louis", minuto: "2026-10-27T10:35", nome: "Diego Louis" },
  { tipo: "financiamento", rotulo: "26/10/2026 16:07 — Financiamento, Ronaldo Murasawwa", minuto: "2026-10-26T16:07", nome: "Ronaldo Murasawwa" },
  { tipo: "financiamento", rotulo: "26/10/2026 15:10 — Financiamento, Diego Louis", minuto: "2026-10-26T15:10", nome: "Diego Louis" },
];

export type Situacao = "apagar" | "nao_encontrado" | "mais_de_um" | "enviado_a_parceiro" | "com_negocio";
export interface ItemPlano {
  rotulo: string;
  tipo: Alvo["tipo"];
  situacao: Situacao;
  ids: string[];
  detalhes: string[];
}
export interface Apagados {
  financiamentos: number;
  consentimentos: number;
  contatosMeta: number;
  emailsDoContato: number;
  inscricoesDoContato: number;
}
export interface ResultadoApagar {
  modo: "simulacao" | "execucao";
  itens: ItemPlano[];
  apagados: Apagados;
}
export interface OpcoesApagar {
  confirmar: boolean;
  incluirEnviados?: boolean;
  log?: (linha: string) => void;
}

type Db = PrismaService | Prisma.TransactionClient;

const SITUACAO: Record<Situacao, string> = {
  apagar: "VAI SER APAGADO",
  nao_encontrado: "não encontrado (já apagado?) — nada a fazer",
  mais_de_um: "mais de um registro bate — NADA é apagado deste item",
  enviado_a_parceiro: "FICA: já foi enviado a parceiro (use --incluir-enviados para apagar mesmo assim)",
  com_negocio: "FICA: tem negócio registrado (comissão) — não é apagado por este script",
};

const quando = (d: Date) =>
  d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "");
const dia = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

function janela(minuto: string): { gte: Date; lt: Date } {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(minuto)) throw new Error(`Minuto inválido: ${minuto}`);
  const inicio = new Date(`${minuto}:00-03:00`);
  return { gte: inicio, lt: new Date(inicio.getTime() + 60_000) };
}

async function planejarFinanciamento(db: Db, alvo: AlvoFinanciamento, incluirEnviados: boolean): Promise<ItemPlano> {
  const achados = await db.financingLead.findMany({
    where: { createdAt: janela(alvo.minuto), name: { startsWith: alvo.nome, mode: "insensitive" } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      financingDealId: true,
      credihomeLeadId: true,
      credihomeSentAt: true,
      creditasLeadId: true,
      creditasSentAt: true,
      listing: { select: { title: true } },
      _count: { select: { creditConsents: true } },
    },
  });
  // O nome precisa ser exatamente o da lista (o startsWith só tolera maiúsculas).
  const exatos = achados.filter((l) => l.name.trim().toLowerCase() === alvo.nome.toLowerCase());
  const base = { rotulo: alvo.rotulo, tipo: alvo.tipo, ids: exatos.map((l) => l.id) };
  if (!exatos.length) return { ...base, situacao: "nao_encontrado", detalhes: [] };
  const detalhes = exatos.map((l) => {
    const envios = [
      (l.credihomeSentAt || l.credihomeLeadId) && `enviado à Credihome${l.credihomeSentAt ? ` em ${dia(l.credihomeSentAt)}` : ""}`,
      (l.creditasSentAt || l.creditasLeadId) && `enviado à Creditas${l.creditasSentAt ? ` em ${dia(l.creditasSentAt)}` : ""}`,
    ].filter(Boolean);
    return [
      `id ${l.id}: ${quando(l.createdAt)} ${l.name}`,
      l.listing ? `anúncio "${l.listing.title}"` : "sem anúncio",
      `${l._count.creditConsents} consentimento(s) de crédito`,
      ...envios,
      ...(l.financingDealId ? ["tem negócio registrado"] : []),
    ].join(" · ");
  });
  if (exatos.length > 1) return { ...base, situacao: "mais_de_um", detalhes };
  const [l] = exatos;
  if (l.financingDealId) return { ...base, situacao: "com_negocio", detalhes };
  const enviado = Boolean(l.credihomeSentAt || l.credihomeLeadId || l.creditasSentAt || l.creditasLeadId);
  if (enviado && !incluirEnviados) return { ...base, situacao: "enviado_a_parceiro", detalhes };
  return { ...base, situacao: "apagar", detalhes };
}

async function planejarMeta(db: Db, alvo: AlvoMeta): Promise<ItemPlano> {
  const achados = await db.marketingContact.findMany({
    where: { email: alvo.email, source: "meta_lead_ads" },
    select: { id: true, name: true, createdAt: true, _count: { select: { sends: true, enrollments: true } } },
  });
  const base = { rotulo: alvo.rotulo, tipo: alvo.tipo, ids: achados.map((c) => c.id) };
  if (!achados.length) return { ...base, situacao: "nao_encontrado", detalhes: [] };
  const detalhes = achados.map(
    (c) => `id ${c.id}: ${quando(c.createdAt)} ${c.name ?? "(sem nome)"} · ${c._count.sends} e-mail(s) e ${c._count.enrollments} inscrição(ões) em sequência saem junto`,
  );
  return { ...base, situacao: achados.length > 1 ? "mais_de_um" : "apagar", detalhes };
}

async function planejar(db: Db, incluirEnviados: boolean): Promise<ItemPlano[]> {
  const itens: ItemPlano[] = [];
  for (const alvo of ALVOS) {
    itens.push(alvo.tipo === "financiamento" ? await planejarFinanciamento(db, alvo, incluirEnviados) : await planejarMeta(db, alvo));
  }
  return itens;
}

const nada = (): Apagados => ({ financiamentos: 0, consentimentos: 0, contatosMeta: 0, emailsDoContato: 0, inscricoesDoContato: 0 });

export async function apagarLeadsDeTeste(prisma: PrismaService, opcoes: OpcoesApagar): Promise<ResultadoApagar> {
  // eslint-disable-next-line no-console
  const log = opcoes.log ?? ((linha: string) => console.log(linha));
  const incluirEnviados = Boolean(opcoes.incluirEnviados);
  const imprimir = (itens: ItemPlano[]) => {
    for (const item of itens) {
      log(`- ${item.rotulo}: ${SITUACAO[item.situacao]}`);
      for (const d of item.detalhes) log(`    ${d}`);
    }
  };

  if (!opcoes.confirmar) {
    const itens = await planejar(prisma, incluirEnviados);
    log("SIMULAÇÃO (nada foi apagado). Para apagar, rode de novo com --confirmar.");
    imprimir(itens);
    log(`Seriam apagados ${itens.filter((i) => i.situacao === "apagar").length} de ${itens.length} itens.`);
    return { modo: "simulacao", itens, apagados: nada() };
  }

  // Plano refeito dentro da transação: apaga só o que bate agora.
  const { itens, apagados } = await prisma.$transaction(
    async (tx) => {
      const itens = await planejar(tx, incluirEnviados);
      const apagar = (tipo: Alvo["tipo"]) => itens.filter((i) => i.tipo === tipo && i.situacao === "apagar" && i.ids.length === 1).map((i) => i.ids[0]);
      const fin = apagar("financiamento");
      const meta = apagar("formulario_meta");
      const apagados = nada();
      apagados.consentimentos = (await tx.creditConsent.deleteMany({ where: { financingLeadId: { in: fin } } })).count;
      apagados.financiamentos = (await tx.financingLead.deleteMany({ where: { id: { in: fin }, financingDealId: null } })).count;
      apagados.emailsDoContato = (await tx.emailSend.deleteMany({ where: { contactId: { in: meta } } })).count;
      apagados.inscricoesDoContato = (await tx.sequenceEnrollment.deleteMany({ where: { contactId: { in: meta } } })).count;
      apagados.contatosMeta = (await tx.marketingContact.deleteMany({ where: { id: { in: meta }, source: "meta_lead_ads" } })).count;
      if (apagados.financiamentos !== fin.length || apagados.contatosMeta !== meta.length) {
        throw new Error("Recusado: o banco mudou no meio da limpeza. Nada foi apagado; rode a simulação de novo.");
      }
      return { itens, apagados };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );

  imprimir(itens);
  log(
    `APAGADO: ${apagados.financiamentos} pedido(s) de financiamento (com ${apagados.consentimentos} consentimento(s) de crédito), ` +
      `${apagados.contatosMeta} contato(s) do Formulário Meta (com ${apagados.emailsDoContato} e-mail(s) e ${apagados.inscricoesDoContato} inscrição(ões)).`,
  );
  if (apagados.financiamentos || apagados.contatosMeta) {
    await prisma.opsReport.create({
      data: {
        agent: "script:apagar-leads-de-teste",
        kind: "limpeza_leads_teste",
        body: `Leads de teste apagados: ${apagados.financiamentos} financiamento(s) e ${apagados.contatosMeta} Formulário Meta.`,
        data: { apagados: { ...apagados }, itens: itens.map((i) => ({ rotulo: i.rotulo, situacao: i.situacao, ids: i.ids })) },
      },
    });
  }
  log("PRONTO.");
  return { modo: "execucao", itens, apagados };
}

async function main() {
  const args = process.argv.slice(2);
  const conhecidos = ["--confirmar", "--incluir-enviados"];
  const desconhecidos = args.filter((a) => !conhecidos.includes(a));
  if (desconhecidos.length) throw new Error(`Opção desconhecida: ${desconhecidos.join(" ")}. Use --confirmar e/ou --incluir-enviados (ou nada, para simular).`);
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    await apagarLeadsDeTeste(prisma, { confirmar: args.includes("--confirmar"), incluirEnviados: args.includes("--incluir-enviados") });
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Nada foi apagado:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

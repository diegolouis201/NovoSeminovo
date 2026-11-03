import { SALES_STAGES, type CrmOverview, type CrmOverviewScope } from "@novoseminovo/shared-types";
import type { CrmEmpresa, CrmFeed } from "./crm.service";

// Visão geral do CRM (/admin/crm): agrega o mesmo feed que o repositório do
// CRM usa. Função pura: recebe o feed, os pagamentos e a data de hoje.

export type OverviewPayment = { paidAt: Date; amount: unknown; refundedAmount: unknown; partnerType?: string };

const DAY_MS = 86_400_000;
const NPS_JANELA_DIAS = 90;
const SEM_ACESSO_DIAS = 30;
const CHAMADO_PARADO_DIAS = 2;
const SEM_ORIGEM = "Direto / sem origem";
const SEM_DONO = "Sem dono";
const PROPERTY_TYPES = new Set(["real_estate_agency", "builder", "broker"]);

const cents = (value: number) => Math.round(value * 100) / 100;
const monthKey = (date: Date) => date.toISOString().slice(0, 7);
const isSubscriber = (e: CrmEmpresa) => e.plano?.status === "ativa" || e.plano?.status === "em_atraso";
const daysAgo = (iso: string | undefined, hoje: Date) => (iso ? (hoje.getTime() - new Date(iso).getTime()) / DAY_MS : Infinity);

function countBy<T>(items: T[], key: (item: T) => string | undefined) {
  const map = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (k) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}

export function buildCrmOverview(feed: CrmFeed, payments: OverviewPayment[], hoje: Date, recorte: CrmOverviewScope): CrmOverview {
  const inScope = (segmento?: string) => recorte === "all" || segmento === recorte;
  const empresas = feed.empresas.filter((e) => inScope(e.segmento));
  const prospeccao = feed.prospeccao.filter((p) => inScope(p.segmento));
  const thisMonth = monthKey(hoje);

  const assinantes = empresas.filter(isSubscriber);
  const mrr = cents(assinantes.reduce((sum, e) => sum + (e.plano?.valorMensal ?? 0), 0));

  const npsRecent = empresas.map((e) => e.nps).filter((n) => n && daysAgo(n.data, hoje) <= NPS_JANELA_DIAS);
  const promotores = npsRecent.filter((n) => n!.classificacao === "promotor").length;
  const detratores = npsRecent.filter((n) => n!.classificacao === "detrator").length;
  const respostas = npsRecent.length;

  const resolucao = empresas.map((e) => e.chamados.tempoMedioResolucaoHoras).filter((h): h is number => h !== undefined);

  // Funil: prospecção (sem cadastro) + empresas do site, na ordem das etapas.
  const stageCount = countBy([...prospeccao.map((p) => p.etapa.id), ...empresas.map((e) => e.etapa.id)], (id) => id);
  const funil = SALES_STAGES.map((s) => ({ etapa: s.id, nome: s.label, quantidade: stageCount.get(s.id) ?? 0 }));

  // Receita recebida por mês (12 meses até o atual), descontando estornos.
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) months.push(monthKey(new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - i, 1))));
  const revenue = new Map(months.map((m) => [m, 0]));
  for (const p of payments) {
    if (p.partnerType && recorte !== "all" && (PROPERTY_TYPES.has(p.partnerType) ? "property" : "vehicle") !== recorte) continue;
    const key = monthKey(p.paidAt);
    if (revenue.has(key)) revenue.set(key, revenue.get(key)! + Number(p.amount ?? 0) - Number(p.refundedAmount ?? 0));
  }
  const receitaPorMes = months.map((mes) => ({ mes, valor: cents(revenue.get(mes)!) }));

  const lost = [...prospeccao.filter((p) => p.etapa.id === "perdida"), ...empresas.filter((e) => e.etapa.id === "cancelou")];
  const motivos = [...countBy(lost, (x) => x.motivoPerda?.categoria ?? (x.motivoPerda?.texto ? "Outro" : undefined))]
    .map(([categoria, quantidade]) => ({ categoria, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade || a.categoria.localeCompare(b.categoria));

  const origem = [...countBy(empresas, (e) => e.origemMarketing?.canal ?? SEM_ORIGEM)]
    .map(([canal, quantidade]) => ({ canal, quantidade }))
    .sort((a, b) => Number(a.canal === SEM_ORIGEM) - Number(b.canal === SEM_ORIGEM) || b.quantidade - a.quantidade || a.canal.localeCompare(b.canal));

  const sellers = new Map<string, { nome: string; cards: number; cadastradas: number; assinantes: number; mrr: number }>();
  const seller = (nome?: string) => {
    const key = nome ?? SEM_DONO;
    if (!sellers.has(key)) sellers.set(key, { nome: key, cards: 0, cadastradas: 0, assinantes: 0, mrr: 0 });
    return sellers.get(key)!;
  };
  for (const p of prospeccao) seller(p.vendedor).cards++;
  for (const e of empresas) {
    const s = seller(e.vendedor);
    s.cards++;
    s.cadastradas++;
    if (isSubscriber(e)) {
      s.assinantes++;
      s.mrr = cents(s.mrr + (e.plano?.valorMensal ?? 0));
    }
  }
  const vendedores = [...sellers.values()].sort((a, b) => Number(a.nome === SEM_DONO) - Number(b.nome === SEM_DONO) || b.mrr - a.mrr || b.cards - a.cards);

  const atencao: CrmOverview["atencao"] = [];
  for (const e of empresas) {
    const base = { empresa: e.nome, cardId: e.cardId };
    if (e.plano?.status === "em_atraso") atencao.push({ ...base, nivel: "urgente", motivo: `pagamento atrasado (plano ${e.plano.nome})` });
    if (e.nps?.classificacao === "detrator" && daysAgo(e.nps.data, hoje) <= 30) atencao.push({ ...base, nivel: "urgente", motivo: `nota ${e.nps.nota} no NPS${e.nps.comentario ? ` ("${e.nps.comentario}")` : ""}` });
    if (e.chamados.abertoDesde && daysAgo(e.chamados.abertoDesde, hoje) > CHAMADO_PARADO_DIAS) atencao.push({ ...base, nivel: "urgente", motivo: `chamado aberto há ${Math.floor(daysAgo(e.chamados.abertoDesde, hoje))} dias` });
    if (isSubscriber(e) && (e.uso.diasSemAcesso ?? 0) >= SEM_ACESSO_DIAS) atencao.push({ ...base, nivel: "acompanhar", motivo: `assinante sem entrar no painel há ${e.uso.diasSemAcesso} dias` });
    if (e.leads.paradosMais3Dias >= 3) atencao.push({ ...base, nivel: "acompanhar", motivo: `${e.leads.paradosMais3Dias} clientes esperando resposta há mais de 3 dias` });
  }
  atencao.sort((a, b) => Number(a.nivel !== "urgente") - Number(b.nivel !== "urgente") || a.empresa.localeCompare(b.empresa));

  return {
    geradoEm: hoje.toISOString(),
    recorte,
    numeros: {
      empresas: empresas.length,
      assinantes: assinantes.length,
      mrr,
      ticketMedio: assinantes.length ? cents(mrr / assinantes.length) : undefined,
      novasAssinaturasMes: empresas.filter((e) => e.pagamentos.primeiro?.slice(0, 7) === thisMonth).length,
      cancelamentosMes: empresas.filter((e) => e.plano?.status === "cancelada" && e.plano.mudouEm.slice(0, 7) === thisMonth).length,
      emRisco: assinantes.filter((e) => (e.uso.diasSemAcesso ?? 0) >= SEM_ACESSO_DIAS).length,
      chamadosAbertos: empresas.reduce((sum, e) => sum + e.chamados.abertos, 0),
      tempoMedioResolucaoHoras: resolucao.length ? Math.round((resolucao.reduce((a, b) => a + b, 0) / resolucao.length) * 10) / 10 : undefined,
      nps: { score: respostas ? Math.round(((promotores - detratores) / respostas) * 100) : undefined, respostas, promotores, neutros: respostas - promotores - detratores, detratores },
    },
    funil,
    receitaPorMes,
    motivos,
    origem,
    vendedores,
    atencao: atencao.slice(0, 30),
  };
}

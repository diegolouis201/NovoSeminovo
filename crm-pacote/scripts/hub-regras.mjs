// Regras do NovoSeminovo Hub (hub.novoseminovo.com.br), sobre o mesmo feed do
// CRM (dados/clientes.json): régua de relacionamento, meta do mês com ritmo,
// empresas sem próximo passo e NPS pendente. Funções puras.

const DAY = 86_400_000;
const dayOf = (text) => new Date(`${String(text).slice(0, 10)}T00:00:00Z`);
const isoDay = (date) => (typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10));
const diffDays = (from, to) => Math.round((dayOf(isoDay(to)).getTime() - dayOf(isoDay(from)).getTime()) / DAY);
const cents = (v) => Math.round(v * 100) / 100;
const naoContatar = (marcacoes, ...keys) => keys.some((k) => k && marcacoes?.[k]?.naoContatar);

export const CICLO_ASSINANTE = 30;
export const CICLO_GRATIS = 15;
const VENCENDO_DIAS = 7;

// Cada empresa ativa tem um prazo para o próximo contato: assinante a cada 30
// dias; quem está no período grátis (cadastrou ou publicou, sem plano) a cada
// 15. Conta do último contato (ligação, WhatsApp, e-mail ou reunião) ou, se
// nunca houve, do cadastro. Quem pediu para não ser contatado fica de fora.
export function regua(feed, hoje, marcacoes = {}, ciclos = { assinante: CICLO_ASSINANTE, gratis: CICLO_GRATIS }) {
  const linhas = [];
  for (const e of feed.empresas ?? []) {
    if (naoContatar(marcacoes, e.id, e.cardId)) continue;
    const assinante = e.plano?.status === "ativa" || e.plano?.status === "em_atraso";
    const gratis = !e.plano && ["cadastrou", "publicou"].includes(e.etapa?.id);
    if (!assinante && !gratis) continue;
    const ciclo = assinante ? ciclos.assinante : ciclos.gratis;
    const base = e.ultimoContato?.data ?? e.cadastroNoSiteEm;
    if (!base) continue;
    const vence = new Date(dayOf(base).getTime() + ciclo * DAY);
    const dias = diffDays(hoje, vence);
    linhas.push({
      empresaId: e.id,
      cardId: e.cardId,
      nome: e.nome,
      vendedor: e.vendedor,
      plano: e.plano?.nome,
      telefone: e.responsavel?.telefone,
      ciclo,
      ultimo: e.ultimoContato?.data?.slice(0, 10),
      ultimoTipo: e.ultimoContato?.tipo,
      vence: isoDay(vence),
      dias,
      progresso: Math.round((diffDays(dayOf(base), hoje) / ciclo) * 100) / 100,
      situacao: dias < 0 ? "atrasado" : dias <= VENCENDO_DIAS ? "vencendo" : "em_dia",
    });
  }
  return linhas.sort((a, b) => a.dias - b.dias || a.nome.localeCompare(b.nome));
}

function ritmo(meta, realizado, fracao) {
  const ritmoHoje = cents(meta * fracao);
  return {
    meta,
    realizado,
    ritmoHoje,
    falta: cents(Math.max(0, meta - realizado)),
    percentual: meta > 0 ? Math.round((realizado / meta) * 100) : undefined,
    situacao: realizado > ritmoHoje ? "acima" : realizado === ritmoHoje ? "no_ritmo" : "abaixo",
  };
}

// Meta do mês contra o realizado, com o "ritmo para hoje" (quanto já deveria
// ter sido feito, proporcional aos dias do mês que passaram).
export function ritmoMeta(meta, realizado, hoje) {
  if (!meta) return null;
  const ano = hoje.getUTCFullYear();
  const mes = hoje.getUTCMonth();
  const diasNoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const fracao = hoje.getUTCDate() / diasNoMes;
  return {
    dia: hoje.getUTCDate(),
    diasNoMes,
    assinaturas: ritmo(meta.newSubscriptions, realizado.assinaturas ?? 0, fracao),
    faturamento: ritmo(meta.revenue, realizado.faturamento ?? 0, fracao),
  };
}

const EM_NEGOCIACAO = ["em_contato", "interessada", "proposta", "cadastrou", "publicou"];

// Empresas em negociação sem próximo passo: nenhum contato marcado para hoje
// ou depois e nenhuma tarefa aberta no Hub. Quem está há mais tempo sem
// contato aparece primeiro.
export function semProximoPasso(feed, tarefasAbertas, hoje, marcacoes = {}) {
  const comTarefa = new Set((tarefasAbertas ?? []).map((t) => t.empresa?.id).filter(Boolean));
  const hojeDia = isoDay(hoje);
  const cards = [
    ...(feed.prospeccao ?? []).map((p) => ({ ...p, empresaId: undefined, tipo: "prospeccao" })),
    ...(feed.empresas ?? []).filter((e) => e.cardId && !e.plano).map((e) => ({ ...e, empresaId: e.id, tipo: "empresa" })),
  ];
  return cards
    .filter((c) => EM_NEGOCIACAO.includes(c.etapa?.id))
    .filter((c) => !naoContatar(marcacoes, c.empresaId, c.cardId))
    .filter((c) => !(c.proximoContato && c.proximoContato.slice(0, 10) >= hojeDia))
    .filter((c) => !comTarefa.has(c.cardId))
    .map((c) => ({
      cardId: c.cardId,
      empresaId: c.empresaId,
      nome: c.nome,
      etapa: c.etapa,
      vendedor: c.vendedor,
      ultimoContato: c.ultimoContato?.data?.slice(0, 10),
      diasSemContato: c.ultimoContato ? diffDays(c.ultimoContato.data, hoje) : undefined,
      contatoVencido: c.proximoContato?.slice(0, 10),
    }))
    .sort((a, b) => (b.diasSemContato ?? Infinity) - (a.diasSemContato ?? Infinity) || a.nome.localeCompare(b.nome));
}

const NPS_CARENCIA = 30;
const NPS_VALIDADE = 180;

// Empresas cadastradas há 30+ dias sem resposta de NPS nos últimos 180 dias
// (o site pergunta sozinho no painel do parceiro; esta é a lista de quem
// ainda não respondeu, para lembrar no próximo contato).
export function npsPendentes(feed, hoje, marcacoes = {}) {
  return (feed.empresas ?? [])
    .filter((e) => !naoContatar(marcacoes, e.id, e.cardId))
    .filter((e) => e.cadastroNoSiteEm && diffDays(e.cadastroNoSiteEm, hoje) >= NPS_CARENCIA)
    .filter((e) => !e.nps || diffDays(e.nps.data, hoje) > NPS_VALIDADE)
    .map((e) => ({ empresaId: e.id, cardId: e.cardId, nome: e.nome, vendedor: e.vendedor, telefone: e.responsavel?.telefone, ultimaResposta: e.nps?.data?.slice(0, 10), ultimaNota: e.nps?.nota }))
    .sort((a, b) => Number(Boolean(a.ultimaResposta)) - Number(Boolean(b.ultimaResposta)) || (a.ultimaResposta ?? "").localeCompare(b.ultimaResposta ?? "") || a.nome.localeCompare(b.nome));
}

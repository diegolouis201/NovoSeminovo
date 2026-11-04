// Contas do painel do CRM (relatorios/painel.html). Funções puras: recebem os
// dados já baixados do site (dados/*.json) e a data de hoje.
import { iso, nextFromDdMm, nextOccurrence, sectorDate } from "./lib.mjs";

export const ETAPAS = [
  { id: "a_abordar", nome: "A abordar" },
  { id: "em_contato", nome: "Em contato" },
  { id: "interessada", nome: "Interessada" },
  { id: "proposta", nome: "Proposta enviada" },
  { id: "cadastrou", nome: "Cadastrou (período grátis)" },
  { id: "publicou", nome: "Publicou anúncio" },
  { id: "assinante", nome: "Assinante" },
  { id: "perdida", nome: "Perdida" },
  { id: "cancelou", nome: "Cancelou" },
];

const DAY = 86_400_000;
const SEM_ORIGEM = "Direto / sem origem";
const SEM_DONO = "Sem dono";
const cents = (v) => Math.round(v * 100) / 100;
const daysAgo = (text, hoje) => (text ? (hoje.getTime() - new Date(text).getTime()) / DAY : Infinity);
const isSubscriber = (e) => e.plano?.status === "ativa" || e.plano?.status === "em_atraso";

// Texto que vem do site é dado: tudo que vai para o HTML passa por aqui.
export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function countBy(items, key) {
  const map = new Map();
  for (const item of items) {
    const k = key(item);
    if (k) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}

export function visaoGeral(feed, hoje, recorte = "all") {
  const inScope = (s) => recorte === "all" || s === recorte;
  const empresas = (feed.empresas ?? []).filter((e) => inScope(e.segmento));
  const prospeccao = (feed.prospeccao ?? []).filter((p) => inScope(p.segmento));
  const mes = iso(hoje).slice(0, 7);

  const assinantes = empresas.filter(isSubscriber);
  const mrr = cents(assinantes.reduce((s, e) => s + (e.plano?.valorMensal ?? 0), 0));
  const nps = empresas.map((e) => e.nps).filter((n) => n && daysAgo(n.data, hoje) <= 90);
  const promotores = nps.filter((n) => n.classificacao === "promotor").length;
  const detratores = nps.filter((n) => n.classificacao === "detrator").length;
  const resolucao = empresas.map((e) => e.chamados?.tempoMedioResolucaoHoras).filter((h) => h !== undefined);

  const stageCount = countBy([...prospeccao, ...empresas], (x) => x.etapa?.id);
  const funil = ETAPAS.map((s) => ({ etapa: s.id, nome: s.nome, quantidade: stageCount.get(s.id) ?? 0 }));

  const lost = [...prospeccao.filter((p) => p.etapa?.id === "perdida"), ...empresas.filter((e) => e.etapa?.id === "cancelou")];
  const motivos = [...countBy(lost, (x) => x.motivoPerda?.categoria ?? (x.motivoPerda?.texto ? "Outro" : undefined))]
    .map(([categoria, quantidade]) => ({ categoria, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade || a.categoria.localeCompare(b.categoria));
  const origem = [...countBy(empresas, (e) => e.origemMarketing?.canal ?? SEM_ORIGEM)]
    .map(([canal, quantidade]) => ({ canal, quantidade }))
    .sort((a, b) => Number(a.canal === SEM_ORIGEM) - Number(b.canal === SEM_ORIGEM) || b.quantidade - a.quantidade);

  const sellers = new Map();
  const seller = (nome) => {
    const key = nome ?? SEM_DONO;
    if (!sellers.has(key)) sellers.set(key, { nome: key, cards: 0, cadastradas: 0, assinantes: 0, mrr: 0 });
    return sellers.get(key);
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

  const atencao = [];
  for (const e of empresas) {
    const base = { empresa: e.nome, empresaId: e.id };
    if (e.plano?.status === "em_atraso") atencao.push({ ...base, nivel: "urgente", motivo: `pagamento atrasado (plano ${e.plano.nome})` });
    if (e.nps?.classificacao === "detrator" && daysAgo(e.nps.data, hoje) <= 30) atencao.push({ ...base, nivel: "urgente", motivo: `nota ${e.nps.nota} no NPS${e.nps.comentario ? ` ("${e.nps.comentario}")` : ""}` });
    if (e.chamados?.abertoDesde && daysAgo(e.chamados.abertoDesde, hoje) > 2) atencao.push({ ...base, nivel: "urgente", motivo: `chamado aberto há ${Math.floor(daysAgo(e.chamados.abertoDesde, hoje))} dias` });
    if (isSubscriber(e) && (e.uso?.diasSemAcesso ?? 0) >= 30) atencao.push({ ...base, nivel: "acompanhar", motivo: `assinante sem entrar no painel há ${e.uso.diasSemAcesso} dias` });
    if ((e.leads?.paradosMais3Dias ?? 0) >= 3) atencao.push({ ...base, nivel: "acompanhar", motivo: `${e.leads.paradosMais3Dias} clientes esperando resposta há mais de 3 dias` });
  }
  atencao.sort((a, b) => Number(a.nivel !== "urgente") - Number(b.nivel !== "urgente") || a.empresa.localeCompare(b.empresa));

  return {
    numeros: {
      empresas: empresas.length,
      prospeccao: prospeccao.filter((p) => p.etapa?.id !== "perdida").length,
      assinantes: assinantes.length,
      mrr,
      ticketMedio: assinantes.length ? cents(mrr / assinantes.length) : undefined,
      novasAssinaturasMes: empresas.filter((e) => e.pagamentos?.primeiro?.slice(0, 7) === mes).length,
      cancelamentosMes: empresas.filter((e) => e.plano?.status === "cancelada" && e.plano.mudouEm?.slice(0, 7) === mes).length,
      emRisco: assinantes.filter((e) => (e.uso?.diasSemAcesso ?? 0) >= 30).length,
      chamadosAbertos: empresas.reduce((s, e) => s + (e.chamados?.abertos ?? 0), 0),
      tempoMedioResolucaoHoras: resolucao.length ? Math.round((resolucao.reduce((a, b) => a + b, 0) / resolucao.length) * 10) / 10 : undefined,
      nps: { score: nps.length ? Math.round(((promotores - detratores) / nps.length) * 100) : undefined, respostas: nps.length, promotores, neutros: nps.length - promotores - detratores, detratores },
    },
    funil,
    motivos,
    origem,
    vendedores,
    atencao,
  };
}

const TIPO_ORDEM = ["Reunião", "Contato", "Aniversário de sócio", "Aniversário da empresa", "Aniversário de parceria", "Fim do período grátis", "Data do setor"];

// O que vem nos próximos dias: contatos marcados, aniversários, fim do
// período grátis e datas do setor. Quem pediu para não ser contatado fica de
// fora dos aniversários e das datas.
export function agenda(feed, marcacoes, calendario, hoje, dias = 60) {
  const inicio = new Date(`${iso(hoje)}T00:00:00Z`);
  const fim = new Date(inicio.getTime() + dias * DAY);
  const dentro = (d) => d && d >= inicio && d <= fim;
  const itens = [];
  const add = (data, tipo, texto, empresaId) => itens.push({ data: iso(data), tipo, texto, empresaId });

  for (const e of feed.empresas ?? []) {
    const naoContatar = Boolean(marcacoes[e.id]?.naoContatar);
    if (e.proximoContato && dentro(new Date(e.proximoContato))) add(new Date(e.proximoContato), e.proximoContatoTipo === "reuniao" ? "Reunião" : "Contato", `${e.nome}${e.vendedor ? ` (${e.vendedor})` : ""}`, e.id);
    const fimGratis = e.periodoGratisAte ? new Date(`${e.periodoGratisAte.slice(0, 10)}T00:00:00Z`) : undefined;
    if (!e.plano && dentro(fimGratis)) add(fimGratis, "Fim do período grátis", `${e.nome}: ${e.anuncios?.noAr ?? 0} anúncio(s) no ar`, e.id);
    if (naoContatar) continue;
    for (const s of e.socios ?? []) {
      const d = nextFromDdMm(s.aniversario, inicio);
      if (dentro(d)) add(d, "Aniversário de sócio", `${s.nome} (${e.nome})`, e.id);
    }
    for (const [campo, tipo, texto] of [
      ["abertaEm", "Aniversário da empresa", (anos) => `${e.nome} faz ${anos} ano(s)`],
      ["cadastroNoSiteEm", "Aniversário de parceria", (anos) => `${e.nome}: ${anos} ano(s) de NovoSeminovo`],
    ]) {
      if (!e[campo]) continue;
      const base = new Date(`${e[campo].slice(0, 10)}T00:00:00Z`);
      const d = nextOccurrence(base.getUTCDate(), base.getUTCMonth() + 1, inicio);
      const anos = d ? d.getUTCFullYear() - base.getUTCFullYear() : 0;
      if (anos > 0 && dentro(d)) add(d, tipo, texto(anos), e.id);
    }
  }
  for (const p of feed.prospeccao ?? []) {
    if (p.proximoContato && p.etapa?.id !== "perdida" && dentro(new Date(p.proximoContato))) {
      add(new Date(p.proximoContato), p.proximoContatoTipo === "reuniao" ? "Reunião" : "Contato", `${p.nome} — prospecção${p.vendedor ? ` (${p.vendedor})` : ""}`);
    }
  }
  for (const item of calendario) {
    const d = [inicio.getUTCFullYear(), inicio.getUTCFullYear() + 1].map((y) => sectorDate(item.data, y)).find((x) => dentro(x));
    if (d) add(d, "Data do setor", `${item.nome}: ${item.ideia}`);
  }
  return itens.sort((a, b) => a.data.localeCompare(b.data) || TIPO_ORDEM.indexOf(a.tipo) - TIPO_ORDEM.indexOf(b.tipo));
}

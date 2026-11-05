// Marketing do NovoSeminovo Hub: regras puras (testes em
// marketing-regras.spec.ts). Nada publica sem aprovação do Diego.

export type StatusConteudo = "rascunho" | "em_aprovacao" | "ajuste" | "aprovado" | "publicando" | "publicado" | "erro" | "cancelado";
export type AcaoConteudo = "aprovar" | "ajuste" | "revisar" | "publicando" | "publicado" | "erro" | "cancelar";

const TRANSICOES: Record<AcaoConteudo, { de: StatusConteudo[]; para: StatusConteudo }> = {
  aprovar: { de: ["em_aprovacao", "erro"], para: "aprovado" },
  ajuste: { de: ["em_aprovacao"], para: "ajuste" },
  revisar: { de: ["rascunho", "em_aprovacao", "ajuste"], para: "em_aprovacao" },
  publicando: { de: ["aprovado"], para: "publicando" },
  publicado: { de: ["aprovado", "publicando", "erro"], para: "publicado" },
  erro: { de: ["publicando"], para: "erro" },
  cancelar: { de: ["rascunho", "em_aprovacao", "ajuste", "aprovado", "erro"], para: "cancelado" },
};

export function proximoStatus(atual: string, acao: AcaoConteudo): StatusConteudo | null {
  const t = TRANSICOES[acao];
  return t && t.de.includes(atual as StatusConteudo) ? t.para : null;
}

// O Hub publica sozinho só imagem e carrossel no Instagram e no Facebook
// (API oficial da Meta). TikTok, YouTube, vídeo, e-mail e WhatsApp: aprovação
// no Hub e publicação à mão, marcando o link depois.
export const CANAIS_AUTOMATICOS = new Set(["instagram", "facebook"]);
const IMAGEM = /\.(jpe?g|png|webp)(\?|$)/i;

export function publicacaoAutomatica(c: { tipo: string; redes: string[]; midias: string[] }) {
  const podeAuto = (c.tipo === "post" || c.tipo === "carrossel") && c.midias.length > 0 && c.midias.length <= 10 && c.midias.every((m) => IMAGEM.test(m));
  const automatico = podeAuto ? c.redes.filter((r) => CANAIS_AUTOMATICOS.has(r)) : [];
  return { automatico, manual: c.redes.filter((r) => !automatico.includes(r)) };
}

// ------------------------------------------------------------------ Gastos

export type LinhaGasto = { plataforma: string; campanha: string; data: string; gasto: number; cliques: number; impressoes: number; conversoes: number };
const cents = (v: number) => Math.round(v * 100) / 100;
const ORDEM = ["meta_ads", "google_ads", "tiktok_ads"];

function agregados(ls: LinhaGasto[], orcamento?: number) {
  const gasto = cents(ls.reduce((s, l) => s + l.gasto, 0));
  const cliques = ls.reduce((s, l) => s + l.cliques, 0);
  const impressoes = ls.reduce((s, l) => s + l.impressoes, 0);
  const conversoes = ls.reduce((s, l) => s + l.conversoes, 0);
  return {
    gasto,
    orcamento,
    usadoPct: orcamento ? Math.round((gasto / orcamento) * 100) : undefined,
    estourou: orcamento !== undefined && gasto > orcamento,
    cliques,
    impressoes,
    conversoes,
    cpc: cliques ? cents(gasto / cliques) : undefined,
    ctr: impressoes ? Math.round((cliques / impressoes) * 10000) / 100 : undefined,
    custoPorConversao: conversoes ? cents(gasto / conversoes) : undefined,
  };
}

export function resumoGastos(linhas: LinhaGasto[], orcamentos: Record<string, number>) {
  const plataformas = [...new Set([...Object.keys(orcamentos), ...linhas.map((l) => l.plataforma)])].sort((a, b) => (ORDEM.indexOf(a) + 1 || 99) - (ORDEM.indexOf(b) + 1 || 99) || a.localeCompare(b));
  const porPlataforma = plataformas.map((p) => ({ plataforma: p, ...agregados(linhas.filter((l) => l.plataforma === p), orcamentos[p]) }));
  const campanhas = new Map<string, LinhaGasto[]>();
  for (const l of linhas) campanhas.set(`${l.plataforma}|${l.campanha}`, [...(campanhas.get(`${l.plataforma}|${l.campanha}`) ?? []), l]);
  const porCampanha = [...campanhas.entries()].map(([k, ls]) => ({ plataforma: k.split("|")[0], campanha: k.split("|").slice(1).join("|"), ...agregados(ls) })).sort((a, b) => b.gasto - a.gasto);
  const totalOrc = Object.values(orcamentos).reduce((s, v) => s + v, 0);
  return { porPlataforma, porCampanha, total: agregados(linhas, totalOrc || undefined) };
}

export function custoPorCadastro(gasto: number, r: { cadastros: number; assinaturas: number }) {
  return { porCadastro: r.cadastros ? cents(gasto / r.cadastros) : undefined, porAssinatura: r.assinaturas ? cents(gasto / r.assinaturas) : undefined };
}

// --------------------------------------------------------------- Calendário

const diaBrasil = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
const somarDias = (dia: string, n: number) => new Date(new Date(`${dia}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

// Mês em semanas de segunda a domingo; cada dia com os conteúdos daquele dia
// (horário de Brasília). Sem data vai para "semData".
export function calendarioMes<T extends { id: string; dataPlanejada?: string }>(mes: string, itens: T[]) {
  const primeiro = `${mes}-01`;
  const dow = (new Date(`${primeiro}T00:00:00Z`).getUTCDay() + 6) % 7;
  const inicio = somarDias(primeiro, -dow);
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  const dowFim = (new Date(`${ultimo}T00:00:00Z`).getUTCDay() + 6) % 7;
  const fim = somarDias(ultimo, 6 - dowFim);
  const porDia = new Map<string, T[]>();
  for (const i of itens) if (i.dataPlanejada) porDia.set(diaBrasil(i.dataPlanejada), [...(porDia.get(diaBrasil(i.dataPlanejada)) ?? []), i]);
  const semanas: { dia: string; doMes: boolean; itens: T[] }[][] = [];
  for (let d = inicio; d <= fim; d = somarDias(d, 7)) {
    semanas.push(Array.from({ length: 7 }, (_, k) => {
      const dia = somarDias(d, k);
      return { dia, doMes: dia.startsWith(mes), itens: (porDia.get(dia) ?? []).sort((x, y) => (x.dataPlanejada ?? "").localeCompare(y.dataPlanejada ?? "")) };
    }));
  }
  return { mes, semanas, semData: itens.filter((i) => !i.dataPlanejada) };
}

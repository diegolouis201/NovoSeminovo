import { redirect } from "next/navigation";
import { hubFetch } from "./api";
import { me } from "./crm";

// Tipos das respostas do marketing (apps/api/src/hub/marketing.service.ts).
export type Conteudo = {
  id: string;
  tipo: string;
  redes: string[];
  titulo: string;
  legenda: string;
  hashtags: string[];
  midias: string[];
  dataPlanejada?: string;
  status: string;
  feedback?: string;
  revisao: number;
  campanha?: { plataforma?: string; orcamento?: number; objetivo?: string; publico?: string; inicio?: string; fim?: string };
  origem: string;
  observacao?: string;
  links: Record<string, string>;
  erro?: string;
  metricas?: Record<string, number>;
  detalhes?: Record<string, string>;
  impulso?: { status: string; orcamentoDia?: number; dias?: number; inicio?: string; objetivo?: string; publico?: string; local?: string; idade?: string; destino?: string; notas?: string; resultados?: Record<string, number>; aprovadoEm?: string };
  publicadoEm?: string;
  automatico: string[];
  manual: string[];
  criadoEm: string;
};
export type Detalhe = Conteudo & { historico: { acao: string; texto?: string; autor: string; em: string }[] };
type Agregado = { gasto: number; orcamento?: number; usadoPct?: number; estourou: boolean; cliques: number; impressoes: number; conversoes: number; cpc?: number; ctr?: number; custoPorConversao?: number };

export async function exigirMarketing() {
  const a = await me();
  if (!a.permissions.includes("marketing")) redirect("/");
  return a;
}

export const mkt = {
  resumo: () => hubFetch<{ aguardando: number; aprovados: number; ajustes: number; erros: number; proximos: Conteudo[]; instagram: boolean; facebook: boolean }>("/hub/marketing/resumo"),
  listar: (qs = "") => hubFetch<Conteudo[]>(`/hub/marketing/conteudos${qs}`),
  detalhe: (id: string) => hubFetch<Detalhe>(`/hub/marketing/conteudos/${encodeURIComponent(id)}`),
  calendario: (mes: string) => hubFetch<{ mes: string; semanas: { dia: string; doMes: boolean; itens: Conteudo[] }[][]; semData: Conteudo[] }>(`/hub/marketing/calendario/${mes}`),
  gastos: (mes: string) =>
    hubFetch<{
      mes: string;
      windsor: boolean;
      periodoDisponivel: boolean;
      conexoes: Record<string, string>;
      orcamentos: Record<string, number>;
      porPlataforma: (Agregado & { plataforma: string })[];
      porCampanha: (Agregado & { plataforma: string; campanha: string })[];
      total: Agregado;
      cadastros: number;
      assinaturas: number;
      custo: { porCadastro?: number; porAssinatura?: number };
    }>(`/hub/marketing/gastos/${mes}`),
  estrategias: () => hubFetch<Estrategia[]>("/hub/marketing/estrategias"),
  impulso: () => hubFetch<{ regras: RegrasImpulso; lista: Conteudo[] }>("/hub/marketing/impulso"),
  analises: () =>
    hubFetch<{
      windsor: boolean;
      instagram?: { data: string; tipo: string; legenda: string; curtidas: number; comentarios: number; alcance: number; link?: string }[];
      origens?: { fonte: string; meio: string; sessoes: number; usuarios: number }[];
      erros: string[];
      publicados: Conteudo[];
    }>("/hub/marketing/analises"),
};

// Imagens ficam na API (/uploads/...): o navegador busca no endereço público.
export const midiaUrl = (u: string) => (u.startsWith("http") ? u : `${(process.env.PUBLIC_API_URL ?? process.env.API_URL ?? "http://localhost:4000").replace(/\/$/, "")}${u}`);
export const ehImagem = (u: string) => /\.(jpe?g|png|webp)(\?|$)/i.test(u);
export const ehVideo = (u: string) => /\.(mp4|mov|webm)(\?|$)/i.test(u);
export type Estrategia = { plataforma: string; status?: string; objetivo?: string; publico?: string; frequencia?: string; formatos?: string; horario?: string; tom?: string; notas?: string; atualizadoEm?: string };
export type RegrasImpulso = { objetivo?: string; criterios?: string; publicos?: string; orcamento?: string; execucao?: string; regras?: string; limiteDia?: number };
export const COR_STATUS: Record<string, string> = {
  em_aprovacao: "bg-orange/15 text-danger",
  ajuste: "bg-orange/15 text-orange",
  aprovado: "bg-blue/10 text-blue",
  publicando: "bg-blue/10 text-blue",
  publicado: "bg-green/15 text-green",
  erro: "bg-orange/25 text-danger",
  cancelado: "bg-line text-muted",
  rascunho: "bg-line text-navy",
};

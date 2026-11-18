import type { ProspeccaoInscricao, ProspeccaoPainel, ProspeccaoSequencia } from "@novoseminovo/shared-types";
import { hubFetch } from "./api";

export const painelProspeccao = () => hubFetch<ProspeccaoPainel>("/hub/prospeccao/sequencias");
export const sequenciaProspeccao = (id: string) =>
  hubFetch<{ sequencia: ProspeccaoSequencia; inscricoes: ProspeccaoInscricao[]; previa: { assunto: string; texto: string; html: string }[]; exemplo: string }>(`/hub/prospeccao/sequencias/${encodeURIComponent(id)}`);
export const etiquetasProspeccao = () => hubFetch<{ etiqueta: string; total: number }[]>("/hub/prospeccao/etiquetas");
export const STATUS_SEQUENCIA = { rascunho: ["Rascunho (não envia)", "bg-line text-navy"], ativa: ["Ativa", "bg-green/15 text-green"], pausada: ["Pausada", "bg-orange/15 text-danger"] } as const;

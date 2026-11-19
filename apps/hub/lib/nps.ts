import { NPS_PERIODOS, NPS_TIPOS, type NpsDashboard, type NpsEmailConfig } from "@novoseminovo/shared-types";
import { hubFetch } from "./api";

// Filtros do painel do NPS só por lista fixa (o resto vira o padrão).
export function filtrosNps(sp: { periodo?: string; tipo?: string }) {
  const periodo = sp.periodo && sp.periodo in NPS_PERIODOS ? (sp.periodo as keyof typeof NPS_PERIODOS) : "180";
  const tipo = sp.tipo && sp.tipo in NPS_TIPOS ? sp.tipo : "todos";
  return { periodo, tipo };
}

export const painelNps = (f: { periodo: string; tipo: string }) => hubFetch<NpsDashboard>(`/hub/nps?periodo=${encodeURIComponent(f.periodo)}&tipo=${encodeURIComponent(f.tipo)}`);
export const envioNps = () => hubFetch<NpsEmailConfig>("/hub/nps/envio");

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CrmRevenue, HubAccess, HubGoal, HubMark, HubTask } from "@novoseminovo/shared-types";
// Mesmas regras do CRM no computador (crm-pacote/scripts, com testes):
// avisos, visão geral, agenda, botões de ação e as regras novas do Hub.
import { buildAlerts } from "../../../crm-pacote/scripts/avisos-regras.mjs";
import { agenda, visaoGeral, ETAPAS } from "../../../crm-pacote/scripts/painel-dados.mjs";
import { npsPendentes, regua, ritmoMeta, semProximoPasso } from "../../../crm-pacote/scripts/hub-regras.mjs";
import { hubFetch } from "./api";
import type { CrmEmpresa, CrmFeed, CrmProspeccao } from "./types";

export { ETAPAS };

// Hoje no fuso de Brasília, à meia-noite UTC (mesma convenção do CRM).
export function hoje(now = new Date()) {
  const br = new Date(now.getTime() - 3 * 3_600_000);
  return new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate()));
}

export function datasDoSetor(): { data: string; nome: string; publico: string; ideia: string }[] {
  try {
    const file = join(process.cwd(), "..", "..", "crm-pacote", "docs", "datas-do-setor.csv");
    return readFileSync(file, "utf8")
      .split(/\r?\n/)
      .slice(1)
      .filter(Boolean)
      .map((line) => {
        const [data, nome, publico, ideia] = line.split(";");
        return { data: data ?? "", nome: nome ?? "", publico: publico ?? "", ideia: ideia ?? "" };
      });
  } catch {
    return [];
  }
}

export const me = () => hubFetch<HubAccess>("/hub/me");
export const feed = () => hubFetch<CrmFeed>("/hub/crm");
export const marcacoes = () => hubFetch<Record<string, HubMark>>("/hub/marcacoes");
export const tarefas = (status: "abertas" | "concluidas" = "abertas", empresa?: string) =>
  hubFetch<HubTask[]>(`/hub/tarefas?status=${status}${empresa ? `&empresa=${encodeURIComponent(empresa)}` : ""}`);
export const meta = async (mes: string) => (await hubFetch<{ meta: HubGoal | null }>(`/hub/meta/${mes}`)).meta;
export const receitas = () => hubFetch<CrmRevenue>("/hub/receitas");

export type Ficha = { chave: string; empresa?: CrmEmpresa; card?: CrmProspeccao; nome: string; cardId?: string; empresaId?: string };

// Uma empresa pode ser só um card de prospecção (ainda não se cadastrou) ou
// uma empresa cadastrada no site (com ou sem card no Comercial).
export function acharFicha(f: CrmFeed, chave: string): Ficha | undefined {
  const empresa = f.empresas.find((e) => e.cardId === chave || e.id === chave);
  if (empresa) return { chave, empresa, nome: empresa.nome, cardId: empresa.cardId, empresaId: empresa.id };
  const card = f.prospeccao.find((p) => p.cardId === chave);
  if (card) return { chave, card, nome: card.nome, cardId: card.cardId };
  return undefined;
}

export const chaveDe = (x: { cardId?: string; id?: string; empresaId?: string }) => x.cardId ?? x.empresaId ?? x.id ?? "";

export const calc = { buildAlerts, visaoGeral, agenda, regua, ritmoMeta, semProximoPasso, npsPendentes };

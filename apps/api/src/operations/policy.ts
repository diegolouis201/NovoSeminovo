import { createHash } from "node:crypto";
import type { z } from "zod";

// Cor de cada ferramenta, gravada no código (não no prompt do agente):
// verde executa e registra; amarela vira pedido de aprovação e para ali;
// vermelha nunca é executada por agente (só uma pessoa, pela tela do admin).
export type ToolColor = "green" | "yellow" | "red";

// approvedBy = admin que aprovou (só existe quando uma ação amarela roda depois da aprovação).
export type OpsToolContext = { agent: string; taskId?: string; approvedBy?: string };

export type OpsTool<Input = unknown> = {
  name: string;
  color: ToolColor;
  description: string;
  input: z.ZodType<Input>;
  // JSON Schema mandado ao modelo (o zod confere de novo o que ele devolver).
  schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  // Texto curto do pedido de aprovação ("Suspender o anúncio X — motivo Y").
  summarize?: (input: Input) => string;
  impact?: (input: Input) => string | undefined;
  run: (input: Input, context: OpsToolContext) => Promise<unknown>;
};

// Ferramentas que cada agente pode chamar. Agente fora da lista ou ferramenta
// fora da lista dele = bloqueado, mesmo que a ferramenta exista.
export const AGENT_TOOL_ALLOWLIST: Record<string, readonly string[]> = {
  diretor: ["ler_painel", "ler_metas", "ler_trafego_site", "ler_instagram", "ler_resultados_marketing", "ler_financeiro", "criar_tarefa", "registrar_resumo_diario"],
  operacoes: ["ler_painel", "listar_anuncios_com_problema", "avisar_dono_anuncio", "suspender_anuncio", "criar_tarefa"],
  comercial: ["ler_painel", "ler_metas", "listar_leads_parados", "listar_lojas_em_teste_sem_anuncio", "lembrar_parceiro", "criar_tarefa"],
  // As ferramentas de post/campanha/sequência só criam rascunhos: nada é
  // publicado ou enviado sem o dono aprovar na tela /admin/marketing.
  // Financeiro só lê e relata: pagar, estornar ou mudar preço é vermelho (ninguém tem a ferramenta).
  financeiro: ["ler_painel", "ler_metas", "ler_financeiro", "criar_tarefa", "registrar_relatorio_financeiro"],
  // Atendimento: ninguém fica sem resposta. Só lembra vendedores e avisa o dono.
  atendimento: ["ler_painel", "listar_conversas_sem_resposta", "lembrar_resposta", "listar_pendencias_atendimento", "avisar_dono_atendimento", "criar_tarefa"],
  marketing: [
    "ler_painel",
    "ler_metas",
    "ler_trafego_site",
    "ler_instagram",
    "ler_resultados_marketing",
    "listar_anuncios_para_post",
    "registrar_sugestao_marketing",
    "criar_post_instagram",
    "revisar_post_instagram",
    "criar_campanha_email",
    "revisar_campanha_email",
    "propor_sequencia",
  ],
};

export const APPROVAL_TTL_MS = 72 * 60 * 60 * 1000;

// JSON com chaves em ordem: o mesmo pedido gera sempre a mesma assinatura.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

// Assinatura da ação exata: ferramenta + parâmetros. A aprovação guarda este
// valor e a execução confere de novo antes de rodar.
export function actionHash(tool: string, params: unknown): string {
  return createHash("sha256").update(`${tool}\n${canonicalJson(params)}`).digest("hex");
}

export type PolicyDecision =
  | { kind: "run" }
  | { kind: "approval" }
  | { kind: "blocked"; reason: string };

// Decide o que fazer com um pedido de ferramenta de um agente, antes de
// qualquer efeito. Função pura: os testes conferem cada caminho.
export function decide(agent: string, tool: Pick<OpsTool, "name" | "color"> | undefined, toolName: string): PolicyDecision {
  if (!tool) return { kind: "blocked", reason: `Ferramenta desconhecida: ${toolName}` };
  const allowed = AGENT_TOOL_ALLOWLIST[agent];
  if (!allowed) return { kind: "blocked", reason: `Agente sem permissão cadastrada: ${agent}` };
  if (!allowed.includes(tool.name)) return { kind: "blocked", reason: `O agente ${agent} não pode usar ${tool.name}` };
  if (tool.color === "red") return { kind: "blocked", reason: `${tool.name} é uma ação que só uma pessoa pode fazer` };
  if (tool.color === "yellow") return { kind: "approval" };
  return { kind: "run" };
}

// Texto que veio de terceiros (descrição de anúncio, mensagem de cliente) vai
// para o modelo marcado como dado, nunca como instrução.
export function untrusted(label: string, text: string): string {
  const clean = text.replace(/<\/?dado_de_terceiro[^>]*>/gi, "");
  return `<dado_de_terceiro origem="${label}">\n${clean}\n</dado_de_terceiro>`;
}

import { AsyncLocalStorage } from "node:async_hooks";
import Anthropic from "@anthropic-ai/sdk";

// Preço por milhão de tokens (US$), tabela da Anthropic de out/2026. Gravação
// em cache custa 1,25× a entrada. Modelo fora da tabela usa o preço do Opus
// (o mais caro em uso aqui), pra nunca subestimar o gasto.
const PRICES_USD_PER_MTOK: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};
const FALLBACK_PRICE = PRICES_USD_PER_MTOK["claude-opus-5-5"]!;

// Cotação usada pra converter o custo em R$ (o teto diário é em reais).
// Ajustável por AI_USD_BRL no .env; o painel mostra qual valor está em uso.
export function usdToBrlRate(): number {
  const rate = Number(process.env.AI_USD_BRL);
  return Number.isFinite(rate) && rate > 0 ? rate : 5.5;
}

export type AiUsage = { input: number; output: number; cacheRead: number; cacheWrite: number };

export function costUsd(model: string, usage: AiUsage): number {
  const price = PRICES_USD_PER_MTOK[model] ?? FALLBACK_PRICE;
  return (
    (usage.input * price.input + usage.output * price.output + usage.cacheRead * price.cacheRead + usage.cacheWrite * price.input * 1.25) /
    1_000_000
  );
}

// Quem está chamando o modelo agora. Os agentes da operação rodam dentro de
// aiContext.run({ feature: "agente:comercial", taskId }) e cada chamada fica
// ligada à tarefa; o resto usa o nome do cliente (ex.: "assistentes").
export type AiCallContext = { feature: string; taskId?: string };
export const aiContext = new AsyncLocalStorage<AiCallContext>();

export type AiRunRecord = AiCallContext & { model: string; usage: AiUsage; durationMs: number; error?: string };
type Sink = (record: AiRunRecord) => Promise<void>;
let sink: Sink | undefined;

// O OperationsModule liga o destino (tabela agent_runs) quando a API sobe.
export function setAiUsageSink(next: Sink | undefined): void {
  sink = next;
}

type UsageBody = {
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
};

function isMessagesCall(input: unknown): boolean {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as { url?: string })?.url;
  return Boolean(url && /\/v1\/messages(\?|$)/.test(url));
}

// Cliente da Anthropic que registra tokens e custo de cada resposta, sem mudar
// nada do jeito de chamar: lê a cópia do corpo da resposta depois que ela
// chega. Falha ao registrar nunca derruba a chamada.
export function trackedAnthropic(feature: string, apiKey?: string): Anthropic {
  const tracking = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const started = Date.now();
    const response = await fetch(input, init);
    if (sink && isMessagesCall(input)) {
      const context = aiContext.getStore() ?? { feature };
      void response
        .clone()
        .json()
        .then((body: UsageBody) => {
          if (!body?.usage || !body.model || !sink) return;
          return sink({
            ...context,
            model: body.model,
            durationMs: Date.now() - started,
            usage: {
              input: body.usage.input_tokens ?? 0,
              output: body.usage.output_tokens ?? 0,
              cacheRead: body.usage.cache_read_input_tokens ?? 0,
              cacheWrite: body.usage.cache_creation_input_tokens ?? 0,
            },
          });
        })
        .catch(() => undefined);
    }
    return response;
  };
  return new Anthropic({ apiKey, fetch: tracking as typeof fetch });
}

// API da Creditas para afiliados — produto Autofin C2C (financiamento de
// veículo comprado de loja ou de pessoa física). Só veículo.
//
// Credenciais (chaves que a Creditas entrega, não geradas por nós) ficam em
// ARQUIVO no servidor, como as outras chaves secretas (ver auth/secret-file.ts):
//   secrets/creditas_consumer_key     → /run/secrets/creditas_consumer_key
//   secrets/creditas_consumer_secret  → /run/secrets/creditas_consumer_secret
// Na máquina de desenvolvimento e nos testes, CREDITAS_CONSUMER_KEY e
// CREDITAS_CONSUMER_SECRET (variáveis de ambiente) também servem.
//
// CREDITAS_AUTH_URL  https://auth-staging.creditas.com.br (padrão, homologação)
// CREDITAS_API_URL   https://stg-api.creditas.io (padrão, homologação)
// Em testes, as duas apontam para http://127.0.0.1:porta (servidor falso).
//
// As chaves e o token só vão nos cabeçalhos/corpo das chamadas — nunca em
// log, mensagem de erro, card ou notificação (scrub() garante isso mesmo se
// a Creditas devolver algo que não devia).

import { readSecret } from "../auth/secret-file";

const TIMEOUT_MS = 30_000;
const DEFAULT_AUTH_URL = "https://auth-staging.creditas.com.br";
const DEFAULT_API_URL = "https://stg-api.creditas.io";
const SECRET_OPTIONS = { minLength: 8, howTo: "salve a chave que a Creditas enviou em secrets/ (ver DEPLOY.md, \"Creditas\")" };

function authUrl(): string {
  return (process.env.CREDITAS_AUTH_URL || DEFAULT_AUTH_URL).replace(/\/+$/, "");
}

function apiUrl(): string {
  return (process.env.CREDITAS_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");
}

function credentials(): { key: string; secret: string } | undefined {
  try {
    return {
      key: readSecret("CREDITAS_CONSUMER_KEY", process.env, undefined, SECRET_OPTIONS),
      secret: readSecret("CREDITAS_CONSUMER_SECRET", process.env, undefined, SECRET_OPTIONS),
    };
  } catch {
    return undefined;
  }
}

export function creditasEnabled(): boolean {
  return credentials() !== undefined;
}

export class CreditasError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

// Token guardado em memória até 5 minutos antes de vencer (a Creditas dá 2 horas).
let cached: { token: string; expiresAt: number; url: string; key: string } | undefined;

export function resetCreditasToken(): void {
  cached = undefined;
}

// Tira do texto qualquer pedaço das credenciais ou do token, e mascara
// números longos (CPF, telefone) — o texto vai para o card e o log.
function scrub(text: string): string {
  const creds = credentials();
  let clean = text;
  for (const secret of [creds?.key, creds?.secret, cached?.token]) {
    if (secret && secret.length >= 4) clean = clean.split(secret).join("***");
  }
  return clean
    .replace(/Bearer\s+[^\s"',;]+/gi, "Bearer ***")
    .replace(/\d{8,}/g, (digits) => `${"*".repeat(digits.length - 2)}${digits.slice(-2)}`);
}

async function send(
  url: string,
  init: { body: unknown; headers: Record<string, string> },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: "application/json", "Content-Type": "application/json", ...init.headers },
    body: JSON.stringify(init.body),
  }).catch((error: Error) => {
    throw new CreditasError(scrub(`Creditas fora do ar: ${error.message}`));
  });
  const rawText = await res.text().catch(() => "");
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = rawText ? JSON.parse(rawText) : {};
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : { raw: parsed };
  } catch {
    body = { raw: rawText.slice(0, 400) };
  }
  return { status: res.status, body };
}

async function token(): Promise<string> {
  const creds = credentials();
  if (!creds) throw new CreditasError("Creditas não configurada (secrets/creditas_consumer_key e secrets/creditas_consumer_secret).");
  if (cached && cached.url === authUrl() && cached.key === creds.key && cached.expiresAt > Date.now()) return cached.token;
  const { status, body } = await send(`${authUrl()}/api/affiliate_clients/tokens`, {
    headers: { "Accept-Version": "v1" },
    body: { consumer_key: creds.key, consumer_secret: creds.secret },
  });
  // Nunca repassa o corpo da resposta do login (poderia ecoar a chave).
  if (status === 400 || status === 401 || status === 403) {
    throw new CreditasError("Autenticação da Creditas recusada — confira a consumer key e o consumer secret no servidor.", status);
  }
  const accessToken = typeof body.access_token === "string" ? body.access_token : "";
  if (status < 200 || status >= 300 || !accessToken) throw new CreditasError(`Autenticação da Creditas falhou (HTTP ${status}).`, status);
  const expiresIn = typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : 7200;
  cached = { token: accessToken, expiresAt: Date.now() + Math.max(60, expiresIn - 5 * 60) * 1000, url: authUrl(), key: creds.key };
  return accessToken;
}

// Erros de validação podem vir em formatos diferentes; junta as mensagens.
function errorMessage(body: Record<string, unknown>): string | undefined {
  const parts: string[] = [];
  const collect = (value: unknown) => {
    if (typeof value === "string" && value.trim()) parts.push(value.trim());
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") {
      const item = value as Record<string, unknown>;
      collect(item.message ?? item.msg ?? item.description ?? item.error ?? item.detail);
      if (typeof item.field === "string" || typeof item.path === "string") parts.push(`campo ${String(item.field ?? item.path)}`);
    }
  };
  for (const key of ["message", "error", "errors", "description", "detail", "details", "raw"]) collect(body[key]);
  const text = parts.length ? [...new Set(parts)].join(" · ") : Object.keys(body).length ? JSON.stringify(body) : "";
  const clean = scrub(text).trim();
  return clean ? clean.slice(0, 400) : undefined;
}

export const CREDITAS_PURCHASE_PHASES = ["CONTACT_STORE", "CONTACT_SELLER", "SEARCHING_ADS", "SEARCH_BY_BUDGET"] as const;
export type CreditasPurchasePhase = (typeof CREDITAS_PURCHASE_PHASES)[number];

// Corpo do POST /b2b/autofin-c2c/leads, nos nomes da documentação.
export type CreditasLeadRequest = {
  lead: { name: string; cpf: string; birthDate: string; phone: string; email: string };
  vehicle: {
    brand: string;
    model: string;
    modelVersion?: string;
    modelYear: number;
    manufacturingYear: number;
    molicarCode?: string;
    fipeCode?: string;
  };
  simulationParameters: {
    financingValue: number;
    downValue?: number;
    purchasePhase: CreditasPurchasePhase;
    timeToPurchase: "ONE_WEEK" | "ONE_MONTH" | "SIX_MONTHS" | "JUST_RESEARCHING";
  };
  bacenAuthorization: { userIp: string; userAgent: string; authorizationTerm: string };
};

// Cria o lead na Creditas; devolve o id (uuid) dele lá. Se o token caiu
// (401), autentica de novo uma vez.
export async function createCreditasLead(request: CreditasLeadRequest): Promise<{ id: string }> {
  const post = async () =>
    send(`${apiUrl()}/b2b/autofin-c2c/leads`, { headers: { Authorization: `Bearer ${await token()}` }, body: request });
  let result = await post();
  if (result.status === 401) {
    cached = undefined;
    result = await post();
  }
  const { status, body } = result;
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (status >= 200 && status < 300 && id) return { id: id.slice(0, 100) };
  const detail = errorMessage(body);
  throw new CreditasError(detail ? `A Creditas recusou o envio (HTTP ${status}): ${detail}` : `A Creditas recusou o envio (HTTP ${status}).`, status);
}

// API de parceiros da Credihome (financiamento imobiliário). Só imóvel — a
// Credihome não faz crédito de veículo. Documentação: doc.yaml enviado pela
// Credihome (OpenAPI "api-partner").
//
// CREDIHOME_LOGIN       e-mail do usuário parceiro
// CREDIHOME_PASSWORD    senha
// CREDIHOME_PARTNER_ID  id do parceiro (chave relatedId do token do login)
// CREDIHOME_API_URL     https://api-partner.credihome.com.br/v1/production (padrão)
//                       ou .../staging — o usuário do NovoSeminovo só existe em produção.
// Em testes, CREDIHOME_API_URL pode ser http://127.0.0.1:porta.

const TIMEOUT_MS = 30_000;
const DEFAULT_URL = "https://api-partner.credihome.com.br/v1/production";

export function credihomeEnabled(): boolean {
  return Boolean(process.env.CREDIHOME_LOGIN && process.env.CREDIHOME_PASSWORD && process.env.CREDIHOME_PARTNER_ID);
}

function baseUrl(): string {
  return (process.env.CREDIHOME_API_URL || DEFAULT_URL).replace(/\/+$/, "");
}

export class CredihomeError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

// Token do login guardado em memória até 5 minutos antes de vencer.
let cached: { token: string; expiresAt: number; url: string } | undefined;

export function resetCredihomeToken(): void {
  cached = undefined;
}

function tokenExpiry(token: string): number {
  try {
    const payload = token.split(".")[1] ?? "";
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: number };
    if (typeof claims.exp === "number") return claims.exp * 1000 - 5 * 60 * 1000;
  } catch {
    // token sem exp legível: vale por 30 minutos
  }
  return Date.now() + 30 * 60 * 1000;
}

async function send(path: string, init: { method: "GET" | "POST"; body?: unknown; token?: string }): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: init.method,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      Accept: "application/json",
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  }).catch((error: Error) => {
    throw new CredihomeError(`Credihome fora do ar: ${error.message}`);
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

// Login e senha só vão no corpo do /login — nunca em log ou mensagem de erro.
async function login(): Promise<string> {
  if (!credihomeEnabled()) {
    throw new CredihomeError("Credihome não configurada (CREDIHOME_LOGIN, CREDIHOME_PASSWORD e CREDIHOME_PARTNER_ID).");
  }
  if (cached && cached.url === baseUrl() && cached.expiresAt > Date.now()) return cached.token;
  const { status, body } = await send("/login", {
    method: "POST",
    body: { login: process.env.CREDIHOME_LOGIN, password: process.env.CREDIHOME_PASSWORD },
  });
  if (status === 401 || status === 404) throw new CredihomeError("Login da Credihome recusado — confira usuário e senha no servidor.", status);
  const token = typeof body.token === "string" ? body.token : "";
  if (status !== 200 || !token) throw new CredihomeError(`Login da Credihome falhou (HTTP ${status}).`, status);
  cached = { token, expiresAt: tokenExpiry(token), url: baseUrl() };
  return token;
}

// Chamada autenticada; se o token caiu (401), faz login de novo uma vez.
async function authed(path: string, method: "GET" | "POST", body?: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  let result = await send(path, { method, body, token: await login() });
  if (result.status === 401) {
    cached = undefined;
    result = await send(path, { method, body, token: await login() });
  }
  return result;
}

// A Credihome nem sempre responde no formato da documentação
// ({message, description}): erros de validação vêm em outros campos ou
// como texto. Sem achar a mensagem, devolve o corpo inteiro — com números
// longos (CPF, telefone) mascarados, porque isso vai para o card e o log.
function errorMessage(body: Record<string, unknown>): string | undefined {
  const parts: string[] = [];
  const collect = (value: unknown) => {
    if (typeof value === "string" && value.trim()) parts.push(value.trim());
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") {
      const item = value as Record<string, unknown>;
      collect(item.message ?? item.msg ?? item.description ?? item.error);
      if (typeof item.field === "string" || typeof item.path === "string") parts.push(`campo ${String(item.field ?? item.path)}`);
    }
  };
  for (const key of ["description", "message", "error", "errors", "erro", "erros", "detail", "details", "raw"]) collect(body[key]);
  const text = parts.length ? [...new Set(parts)].join(" · ") : Object.keys(body).length ? JSON.stringify(body) : "";
  const masked = text.replace(/\d{8,}/g, (digits) => `${"*".repeat(digits.length - 2)}${digits.slice(-2)}`);
  return masked.trim() ? masked.trim().slice(0, 400) : undefined;
}

export type CredihomeLeadRequest = {
  name: string;
  cpf: string;
  dateOfBirth: string;
  phone: string;
  email: string;
  useFgts: boolean;
  realtyPrice: number;
  mortgageValue: number;
  months?: number;
  sourceUrl?: string;
};

export type CredihomeLeadResult = {
  leadId: string;
  // Já existia um lead com o mesmo CPF ou e-mail nos últimos 7 dias — a
  // Credihome devolve o id dele em vez de criar outro.
  alreadyExisted: boolean;
  firstPayment?: number;
};

// POST /simulations: cria a simulação e o lead, atribuído ao parceiro.
export async function createCredihomeLead(input: CredihomeLeadRequest): Promise<CredihomeLeadResult> {
  const partnerId = Number(process.env.CREDIHOME_PARTNER_ID);
  if (!Number.isFinite(partnerId)) throw new CredihomeError("CREDIHOME_PARTNER_ID precisa ser um número.");
  const { status, body } = await authed("/simulations", "POST", {
    type: "mortgage",
    partnerId,
    realtyPrice: input.realtyPrice,
    mortgageValue: input.mortgageValue,
    downPayment: Math.round((input.realtyPrice - input.mortgageValue) * 100) / 100,
    ...(input.months ? { duration: input.months } : {}),
    source: "novoseminovo",
    userRequestedContact: true,
    mailingAllowed: false,
    ...(input.sourceUrl ? { utm: { source_url: input.sourceUrl } } : {}),
    user: {
      name: input.name,
      cpf: input.cpf.replace(/\D/g, ""),
      dateOfBirth: input.dateOfBirth,
      phone: input.phone,
      email: input.email,
      useFgts: input.useFgts,
    },
  });
  const leadId = typeof body.leadId === "string" ? body.leadId : "";
  if (status === 409 && leadId) return { leadId, alreadyExisted: true };
  if (status >= 200 && status < 300 && leadId) {
    return { leadId, alreadyExisted: false, firstPayment: typeof body.firstPayment === "number" ? body.firstPayment : undefined };
  }
  throw new CredihomeError(errorMessage(body) ?? `A Credihome recusou o envio (HTTP ${status}).`, status);
}

// GET /leads/{id}/journey: fase do lead na Credihome.
export async function fetchCredihomePhase(leadId: string): Promise<{ phase: string; updatedAt?: string }> {
  const { status, body } = await authed(`/leads/${encodeURIComponent(leadId)}/journey`, "GET");
  if (status === 200 && typeof body.phase === "string") {
    return { phase: body.phase, updatedAt: typeof body.updatedAt === "string" ? body.updatedAt : undefined };
  }
  throw new CredihomeError(errorMessage(body) ?? `Não foi possível ler a fase na Credihome (HTTP ${status}).`, status);
}

export type CredihomeSimulation = {
  results: Array<{ bank: string; firstPayment: number; annualRate?: number; minimumIncome?: number; table?: string }>;
  maxFinancing?: number;
  warnings: string[];
};

const MAX_BANKS = 4;

const num = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

// POST /simulador: parcelas de cada banco, sem criar lead.
export async function simulateCredihome(input: {
  realtyPrice: number;
  mortgageValue: number;
  months: number;
  dateOfBirth: string; // AAAA-MM-DD
}): Promise<CredihomeSimulation> {
  const [year, month, day] = input.dateOfBirth.split("-");
  const { status, body } = await authed("/simulador", "POST", {
    valorImovel: Math.round(input.realtyPrice),
    valorFinanciado: Math.round(input.mortgageValue),
    prazo: input.months,
    produto: "mortgage",
    dataNascimento: `${day}/${month}/${year}`,
    calcularOutrosOperadores: true,
    exibirNomesOperadores: true,
    esconderParcelas: true,
  });
  if (status < 200 || status >= 300) {
    throw new CredihomeError(errorMessage(body) ?? `A simulação falhou (HTTP ${status}).`, status);
  }
  const rows = Array.isArray(body.resultados) ? (body.resultados as Array<Record<string, unknown>>) : [];
  const results = rows
    .map((row) => ({
      bank: typeof row.operador === "string" ? row.operador : "Banco",
      firstPayment: num(row.prestacaoFinal) ?? num(row.prestacao) ?? 0,
      annualRate: num(row.taxaJurosAnual),
      minimumIncome: num(row.rendaMinima),
      table: typeof row.tabela === "string" ? row.tabela : undefined,
    }))
    .filter((row) => row.firstPayment > 0)
    .sort((a, b) => a.firstPayment - b.firstPayment)
    // Um resultado por banco (a menor parcela dele) e no máximo 4 — a
    // Credihome devolve várias linhas por banco (SAC, PRICE, repetidas), e a
    // ideia é só mostrar que comparamos vários bancos.
    .filter((row, index, all) => all.findIndex((other) => other.bank.toLowerCase() === row.bank.toLowerCase()) === index)
    .slice(0, MAX_BANKS);
  const warnings = Array.isArray(body.errorMessage)
    ? (body.errorMessage as unknown[]).filter((text): text is string => typeof text === "string" && text.trim() !== "")
    : [];
  return { results, maxFinancing: num(body.financiamentoMaximo), warnings };
}

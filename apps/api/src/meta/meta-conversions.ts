// API de Conversões da Meta (Etapa 2a de marketing): o servidor conta à Meta
// os leads e cadastros que vieram dos anúncios, com o MESMO id de evento que
// o pixel do navegador usa — a Meta junta os dois e conta uma vez só.
//
// Fica desligada até existirem:
//   META_PIXEL_ID (ou NEXT_PUBLIC_META_PIXEL_ID, o mesmo do site) — só números;
//   secrets/meta_capi_token → /run/secrets/meta_capi_token (token do conjunto
//     de dados, gerado no Events Manager; nunca no .env, no código nem no log).
// META_TEST_EVENT_CODE (opcional): código da aba "Testar eventos".
// META_GRAPH_URL / META_GRAPH_VERSION: só para teste (servidor falso).
//
// Só vai evento de quem clicou em "Aceitar" no aviso de cookies: sem o
// cabeçalho de aceite, metaContextFrom devolve undefined e nada é enviado.
// E-mail e telefone saem só como SHA-256.

import { createHash, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import type { Request } from "express";
import {
  META_HEADERS,
  cleanFbc,
  cleanFbp,
  cleanMetaEventId,
  isMetaPixelId,
  type MetaContentCategory,
  type MetaEventName,
} from "@novoseminovo/shared-types";
import { readSecret } from "../auth/secret-file";
import { acquisitionFrom } from "../common/acquisition";

type Env = Record<string, string | undefined>;
type Reader = (path: string) => string;

const DEFAULT_GRAPH_URL = "https://graph.facebook.com";
// Versão fixa da Graph API (atualizar quando a Meta avisar do fim dela).
const DEFAULT_GRAPH_VERSION = "v23.0";
const TOKEN_OPTIONS = { minLength: 20, howTo: 'salve o token da API de Conversões em secrets/meta_capi_token (ver DEPLOY.md, "Meta Pixel e API de Conversões")' };

export type MetaEventContext = {
  eventId: string;
  fbp?: string;
  fbc?: string;
  clientIp?: string;
  userAgent?: string;
  sourceUrl?: string;
};

export type MetaConfig = {
  pixelId: string;
  token: string;
  testEventCode?: string;
  graphUrl: string;
  graphVersion: string;
  timeoutMs: number;
};

export function metaConfig(env: Env = process.env, reader?: Reader): MetaConfig | undefined {
  const pixelId = env.META_PIXEL_ID?.trim() || env.NEXT_PUBLIC_META_PIXEL_ID?.trim();
  if (!pixelId || !isMetaPixelId(pixelId)) return undefined;
  let token: string;
  try {
    token = readSecret("META_CAPI_TOKEN", env, reader, TOKEN_OPTIONS);
  } catch {
    return undefined;
  }
  const testEventCode = env.META_TEST_EVENT_CODE?.trim();
  const version = env.META_GRAPH_VERSION?.trim();
  const timeout = Number(env.META_CAPI_TIMEOUT_MS);
  return {
    pixelId,
    token,
    testEventCode: testEventCode && /^[A-Za-z0-9_-]{1,40}$/.test(testEventCode) ? testEventCode : undefined,
    graphUrl: (env.META_GRAPH_URL || DEFAULT_GRAPH_URL).replace(/\/+$/, ""),
    graphVersion: version && /^v\d{1,3}\.\d{1,2}$/.test(version) ? version : DEFAULT_GRAPH_VERSION,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? Math.min(timeout, 10_000) : 4_000,
  };
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

export function hashEmail(email: string | null | undefined): string | undefined {
  const clean = (email ?? "").trim().toLowerCase();
  return clean.includes("@") ? sha256(clean) : undefined;
}

// Só números, com o 55 do Brasil (a Meta pede o código do país).
export function hashPhone(phone: string | null | undefined): string | undefined {
  let digits = (phone ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (!/^55\d{10,11}$/.test(digits)) return undefined;
  return sha256(digits);
}

// fbc = fb.1.<ms>.<fbclid> quando o navegador não tem o cookie _fbc.
export function buildFbc(clickId: string | undefined, nowMs: number): string | undefined {
  return clickId ? cleanFbc(`fb.1.${nowMs}.${clickId}`) : undefined;
}

function header(request: Request, name: string): string | undefined {
  const raw = request.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim() : undefined;
}

// Página do evento: só do próprio site, sem a query (pode ter e-mail, utm…).
function cleanSourceUrl(raw: string | undefined, env: Env): string | undefined {
  if (!raw || raw.length > 1000) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  const origin = env.WEB_ORIGIN?.replace(/\/+$/, "");
  if (origin && url.origin !== origin) return undefined;
  return `${url.origin}${url.pathname}`;
}

// Lê os cabeçalhos que o site manda nas server actions (lib/meta-server.ts).
export function metaContextFrom(request: Request, env: Env = process.env, nowMs = Date.now()): MetaEventContext | undefined {
  if (header(request, META_HEADERS.consent) !== "granted") return undefined;
  const ip = header(request, "x-client-ip")?.split(",")[0]?.trim();
  const userAgent = header(request, "x-client-user-agent")?.slice(0, 500);
  const context: MetaEventContext = {
    eventId: cleanMetaEventId(header(request, META_HEADERS.eventId)) ?? randomUUID(),
    fbp: cleanFbp(header(request, META_HEADERS.fbp)),
    fbc: cleanFbc(header(request, META_HEADERS.fbc)) ?? buildFbc(acquisitionFrom(request)?.clickId, nowMs),
    clientIp: ip && isIP(ip) ? ip : undefined,
    userAgent: userAgent || undefined,
    sourceUrl: cleanSourceUrl(header(request, META_HEADERS.pageUrl), env),
  };
  return Object.fromEntries(Object.entries(context).filter(([, v]) => v !== undefined)) as MetaEventContext;
}

export function buildMetaEvent(
  name: MetaEventName,
  context: MetaEventContext,
  person: { email?: string | null; phone?: string | null },
  category: MetaContentCategory | undefined,
  nowMs = Date.now(),
): Record<string, unknown> {
  const em = hashEmail(person.email);
  const ph = hashPhone(person.phone);
  const userData: Record<string, unknown> = {
    ...(em ? { em: [em] } : {}),
    ...(ph ? { ph: [ph] } : {}),
    ...(context.clientIp ? { client_ip_address: context.clientIp } : {}),
    ...(context.userAgent ? { client_user_agent: context.userAgent } : {}),
    ...(context.fbc ? { fbc: context.fbc } : {}),
    ...(context.fbp ? { fbp: context.fbp } : {}),
  };
  return {
    event_name: name,
    event_time: Math.floor(nowMs / 1000),
    event_id: context.eventId,
    action_source: "website",
    ...(context.sourceUrl ? { event_source_url: context.sourceUrl } : {}),
    user_data: userData,
    ...(category ? { custom_data: { content_category: category } } : {}),
  };
}

// Texto que vai para o log: sem o token e sem nada que pareça dado pessoal.
export function scrubMetaText(text: string, token: string | undefined): string {
  let clean = text;
  if (token && token.length >= 4) clean = clean.split(token).join("***");
  return clean
    .replace(/access_token=[^&\s"']+/gi, "access_token=***")
    .replace(/EAA[A-Za-z0-9]{10,}/g, "***")
    .replace(/[^\s"'<>@]+@[^\s"'<>@]+/g, "***@***")
    .replace(/\d{8,}/g, "***")
    .slice(0, 300);
}

export async function sendMetaEvent(config: MetaConfig, event: Record<string, unknown>): Promise<{ ok: true } | { ok: false; reason: string }> {
  // Token no corpo (não na URL, que costuma ir para log de proxy).
  const body = { data: [event], access_token: config.token, ...(config.testEventCode ? { test_event_code: config.testEventCode } : {}) };
  let res: Response;
  try {
    res = await fetch(`${config.graphUrl}/${config.graphVersion}/${config.pixelId}/events`, {
      method: "POST",
      signal: AbortSignal.timeout(config.timeoutMs),
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const name = (error as Error).name;
    const reason = name === "TimeoutError" || name === "AbortError" ? "tempo esgotado" : `sem conexão (${(error as Error).message})`;
    return { ok: false, reason: scrubMetaText(reason, config.token) };
  }
  if (res.ok) {
    await res.body?.cancel().catch(() => undefined);
    return { ok: true };
  }
  const raw = await res.text().catch(() => "");
  let detail = "";
  try {
    const parsed = JSON.parse(raw) as { error?: { type?: unknown; code?: unknown; error_subcode?: unknown } };
    const error = parsed.error ?? {};
    detail = [error.type, error.code, error.error_subcode].filter((v) => typeof v === "string" || typeof v === "number").join(" ");
  } catch {
    detail = "";
  }
  return { ok: false, reason: scrubMetaText(`HTTP ${res.status}${detail ? ` (${detail})` : ""}`, config.token) };
}

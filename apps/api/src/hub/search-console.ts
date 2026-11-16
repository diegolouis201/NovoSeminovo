import { createSign } from "node:crypto";
import { SEO_OPORTUNIDADE, type SeoDias, type SeoLinha, type SeoMetricas, type SeoOportunidade, type SeoPeriodo, type SeoVariacao } from "@novoseminovo/shared-types";
import { z } from "zod";
import { readSecret } from "../auth/secret-file";

// Google Search Console (SEO no Hub) com a conta de serviço do Google.
// Configuração (DEPLOY.md, "Search Console no Hub"):
//   - chave: arquivo JSON da conta de serviço em secrets/gsc_service_account
//     (readSecret; nunca no .env). A chave assina um JWT (RS256) que o Google
//     troca por um token de acesso de 1 hora, só leitura (webmasters.readonly).
//   - propriedade: GSC_SITE no .env (ex.: sc-domain:novoseminovo.com.br).
//   - a conta de serviço precisa ser usuária (Restrita) da propriedade e a
//     "Google Search Console API" ligada no projeto do Google Cloud.
// Chave e token nunca vão para log nem para URL (token só no Authorization).

type Env = Record<string, string | undefined>;
export type ContaServico = { client_email: string; private_key: string; token_uri: string };
export type GscConfig = { site: string; conta: ContaServico; apiUrl: string; timeoutMs: number };

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const TOKEN_URI = "https://oauth2.googleapis.com/token";

const ContaSchema = z.object({
  client_email: z.string().email().max(300),
  private_key: z.string().min(100).max(10_000).includes("PRIVATE KEY"),
  token_uri: z.string().url().max(300).regex(/^https?:\/\//).default(TOKEN_URI),
});

// Propriedade de domínio (sc-domain:dominio) ou de prefixo de URL.
const SITE = /^(sc-domain:[a-z0-9-]+(\.[a-z0-9-]+)+|https?:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+(:\d{1,5})?\/)$/i;

export function gscConfig(env: Env = process.env): { ok: true; config: GscConfig } | { ok: false; falta: string } {
  const site = (env.GSC_SITE ?? "").trim();
  if (!site) return { ok: false, falta: "Falta a propriedade do Search Console: GSC_SITE no .env do servidor (ex.: sc-domain:novoseminovo.com.br)." };
  if (!SITE.test(site)) return { ok: false, falta: "GSC_SITE inválido: use sc-domain:novoseminovo.com.br (propriedade de domínio) ou o endereço com https:// e / no fim." };
  let bruto: string;
  try {
    bruto = readSecret("GSC_SERVICE_ACCOUNT", env, undefined, { minLength: 100, howTo: "baixe a chave JSON da conta de serviço no Google Cloud (DEPLOY.md, \"Search Console no Hub\")" });
  } catch (erro) {
    // A mensagem do readSecret só traz caminho e instrução, nunca o conteúdo.
    return { ok: false, falta: `Falta a chave da conta de serviço do Google (arquivo secrets/gsc_service_account): ${(erro as Error).message}` };
  }
  let json: unknown;
  try {
    json = JSON.parse(bruto);
  } catch {
    // Não repassa a mensagem do JSON.parse: ela pode citar trechos do arquivo.
    return { ok: false, falta: "O arquivo secrets/gsc_service_account não é um JSON válido: copie de novo o arquivo baixado do Google Cloud." };
  }
  const conta = ContaSchema.safeParse(json);
  if (!conta.success) {
    const campos = [...new Set(conta.error.issues.map((i) => String(i.path[0] ?? "")))].filter((c) => /^[a-z_]{1,30}$/.test(c));
    return { ok: false, falta: `O arquivo secrets/gsc_service_account não parece a chave de uma conta de serviço (confira ${campos.join(", ") || "o conteúdo"}).` };
  }
  const tokenUrl = (env.GSC_TOKEN_URL || "").trim();
  const apiUrl = (env.GSC_API_URL || "https://www.googleapis.com/webmasters/v3").replace(/\/+$/, "");
  return { ok: true, config: { site, conta: { ...conta.data, token_uri: tokenUrl || conta.data.token_uri }, apiUrl, timeoutMs: 20_000 } };
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

// JWT da conta de serviço (RFC 7523): o Google confere a assinatura com a
// chave pública da conta e devolve um token de acesso.
export function assinarJwt(conta: ContaServico, agoraSeg = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: conta.client_email, scope: SCOPE, aud: conta.token_uri, iat: agoraSeg, exp: agoraSeg + 3600 }));
  const assinatura = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(conta.private_key);
  return `${header}.${claims}.${b64url(assinatura)}`;
}

// Token em memória até 5 minutos antes de vencer (um por conta + endereço).
const tokens = new Map<string, { token: string; ate: number }>();
const pedindo = new Map<string, Promise<string>>();
const MARGEM_MS = 5 * 60 * 1000;
export function limparCacheTokenGsc(): void {
  tokens.clear();
  pedindo.clear();
}

// Tira do texto qualquer pedaço de segredo (chave, assinatura, token).
function esconder(texto: string, segredos: string[]): string {
  let t = texto;
  for (const s of segredos) if (s && s.length >= 8) t = t.split(s).join("***");
  return t.replace(/-----BEGIN[^-]*-----[\s\S]*?-----END[^-]*-----/g, "***");
}

const curto = (v: unknown) => (typeof v === "string" && /^[\w.-]{1,60}$/.test(v) ? v : "");

async function pedir(url: string, init: RequestInit, timeoutMs: number, segredos: string[]): Promise<{ status: number; ok: boolean; body: unknown }> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (erro) {
    const nome = (erro as Error).name;
    throw new Error(nome === "TimeoutError" || nome === "AbortError" ? "tempo esgotado" : esconder(`sem conexão (${(erro as Error).message})`, segredos));
  }
  const raw = await res.text().catch(() => "");
  if (raw.length > 5_000_000) throw new Error("resposta grande demais");
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  return { status: res.status, ok: res.ok, body };
}

// Consultas em paralelo dividem o mesmo pedido de token.
export function tokenGsc(config: GscConfig): Promise<string> {
  const chave = `${config.conta.token_uri}|${config.conta.client_email}`;
  const guardado = tokens.get(chave);
  if (guardado && guardado.ate - MARGEM_MS > Date.now()) return Promise.resolve(guardado.token);
  let p = pedindo.get(chave);
  if (!p) {
    p = novoToken(config, chave).finally(() => pedindo.delete(chave));
    pedindo.set(chave, p);
  }
  return p;
}

async function novoToken(config: GscConfig, chave: string): Promise<string> {
  const assertion = assinarJwt(config.conta);
  const form = new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion });
  const r = await pedir(config.conta.token_uri, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: form.toString() }, config.timeoutMs, [assertion, config.conta.private_key]);
  const body = (r.body ?? {}) as { access_token?: unknown; expires_in?: unknown; error?: unknown };
  if (!r.ok || typeof body.access_token !== "string" || !body.access_token) {
    // Só o código curto do Google (ex.: invalid_grant); a descrição pode ecoar a assinatura.
    const motivo = curto(body.error);
    throw new Error(`token do Google recusado: HTTP ${r.status}${motivo ? ` (${motivo})` : ""}`);
  }
  const segundos = typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : 3600;
  tokens.set(chave, { token: body.access_token, ate: Date.now() + segundos * 1000 });
  return body.access_token;
}

export type GscCorpo = {
  startDate: string;
  endDate: string;
  type: "web";
  dimensions?: Array<"date" | "query" | "page">;
  rowLimit: number;
  dimensionFilterGroups?: Array<{ filters: Array<{ dimension: "page"; operator: "contains"; expression: string }> }>;
};

export async function consultarGsc(config: GscConfig, corpo: GscCorpo): Promise<unknown> {
  const token = await tokenGsc(config);
  const url = `${config.apiUrl}/sites/${encodeURIComponent(config.site)}/searchAnalytics/query`;
  const r = await pedir(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(corpo) }, config.timeoutMs, [token]);
  if (!r.ok) {
    if (r.status === 401) tokens.clear();
    const e = (r.body as { error?: { status?: unknown; errors?: Array<{ reason?: unknown }> } } | null)?.error;
    const motivo = [curto(e?.status), curto(e?.errors?.[0]?.reason)].filter(Boolean).join(" ");
    const dica = r.status === 403 ? " — a conta de serviço precisa ser usuária (Restrita) da propriedade no Search Console e a Google Search Console API precisa estar ativada no Google Cloud" : "";
    throw new Error(`Search Console: HTTP ${r.status}${motivo ? ` (${motivo})` : ""}${dica}`);
  }
  return r.body;
}

// ---------- Regras puras (testadas em seo.spec.ts) ----------

const DIA_MS = 86_400_000;
const diaBrasil = (d: Date) => new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
const somarDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);

// O Google leva 2 a 3 dias para fechar os números: o período termina 3 dias
// antes de hoje (Brasília) e é comparado com o período anterior de mesmo tamanho.
export function periodosSeo(dias: SeoDias, hoje: Date): { periodo: SeoPeriodo; anterior: SeoPeriodo } {
  const fim = somarDias(diaBrasil(hoje), -3);
  const inicio = somarDias(fim, -(dias - 1));
  const fimAnterior = somarDias(inicio, -1);
  return { periodo: { inicio, fim }, anterior: { inicio: somarDias(fimAnterior, -(dias - 1)), fim: fimAnterior } };
}

const arred = (n: number, casas: number) => Math.round(n * 10 ** casas) / 10 ** casas;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

export function variacaoSeo(atual: number, anterior: number): SeoVariacao {
  return { atual, anterior, variacao: arred(atual - anterior, 4), variacaoPct: anterior > 0 ? arred(((atual - anterior) / anterior) * 100, 2) : null };
}

const metricas = (r: Record<string, unknown>): SeoMetricas => ({ cliques: num(r.clicks), impressoes: num(r.impressions), ctr: arred(num(r.ctr), 4), posicao: arred(num(r.position), 2) });
const rowsDe = (body: unknown): Array<Record<string, unknown>> => {
  const rows = (body as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? rows.filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null) : [];
};
const chaves = (r: Record<string, unknown>): string[] => (Array.isArray(r.keys) ? r.keys.filter((k): k is string => typeof k === "string" && k.length > 0).map((k) => k.slice(0, 500)) : []);

export function totaisSeo(body: unknown): SeoMetricas {
  const r = rowsDe(body)[0];
  return r ? metricas(r) : { cliques: 0, impressoes: 0, ctr: 0, posicao: 0 };
}

export function linhasSeo(body: unknown): SeoLinha[] {
  return rowsDe(body).flatMap((r) => {
    const [chave] = chaves(r);
    return chave ? [{ chave, ...metricas(r) }] : [];
  });
}

// Consultas quase na página 1. Uma linha por consulta: a página dela com mais
// impressões. Ordem: mais impressões primeiro.
export function oportunidadesSeo(body: unknown, regra: { posicaoMin: number; posicaoMax: number; impressoesMin: number } = SEO_OPORTUNIDADE): SeoOportunidade[] {
  const porConsulta = new Map<string, SeoOportunidade>();
  for (const r of rowsDe(body)) {
    const [consulta, pagina] = chaves(r);
    if (!consulta || !pagina) continue;
    const m = metricas(r);
    if (m.posicao < regra.posicaoMin || m.posicao > regra.posicaoMax || m.impressoes < regra.impressoesMin) continue;
    const atual = porConsulta.get(consulta);
    if (!atual || m.impressoes > atual.impressoes) porConsulta.set(consulta, { consulta, pagina, ...m });
  }
  return [...porConsulta.values()].sort((a, b) => b.impressoes - a.impressoes || a.posicao - b.posicao).slice(0, 50);
}

// Páginas da seção de guias (/guia/...) — confere o caminho, não a query.
export function filtrarGuias(linhas: SeoLinha[]): SeoLinha[] {
  return linhas.filter((l) => {
    try {
      return new URL(l.chave).pathname.startsWith("/guia/");
    } catch {
      return false;
    }
  });
}

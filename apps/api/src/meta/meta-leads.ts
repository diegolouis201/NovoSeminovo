// Lead Ads da Meta (Etapa 2b de marketing): quem preenche um formulário de
// anúncio no Instagram/Facebook cai no CRM — loja/imobiliária/corretor vira
// card de campanha no funil; comprador vira contato em "Leads de compradores".
//
// Fica desligado até existirem os arquivos (nunca no .env, no código ou no log):
//   secrets/meta_app_secret           → confere a assinatura X-Hub-Signature-256;
//   secrets/meta_webhook_verify_token → a Meta manda no GET de verificação;
//   secrets/meta_page_token           → lê os dados do lead na Graph API.
// META_PAGE_ID (só números, não é segredo): página dos formulários; a rotina
// de segurança lista os formulários dela. META_LEADS_SYNC_DISABLED=1 desliga a
// rotina. META_LEADS_B2B_WORDS (opcional): palavras que marcam formulário B2B.
// META_GRAPH_URL / META_GRAPH_VERSION: só para teste (servidor falso).
//
// Tudo que vem da Meta (webhook ou Graph) é tratado como suspeito: validado
// com zod, cortado no tamanho máximo e sem < >.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { BRAZIL_UFS, CAMPAIGN_BUSINESS_TYPES, isValidCnpj, type MarketingInterest } from "@novoseminovo/shared-types";
import { readSecret } from "../auth/secret-file";
import { scrubMetaText } from "./meta-conversions";

type Env = Record<string, string | undefined>;
type Reader = (path: string) => string;
type BusinessType = keyof typeof CAMPAIGN_BUSINESS_TYPES;

const DEFAULT_GRAPH_URL = "https://graph.facebook.com";
// Mesma versão fixa da API de Conversões (atualizar quando a Meta avisar).
const DEFAULT_GRAPH_VERSION = "v23.0";
export const DEFAULT_B2B_WORDS = ["loja", "imobili", "corretor", "parceiro", "b2b"];
const HOW_TO = 'ver DEPLOY.md, "Lead Ads da Meta (formulários do Instagram e Facebook)"';

export type MetaLeadsConfig = {
  appSecret?: string;
  verifyToken?: string;
  pageToken?: string;
  pageId?: string;
  graphUrl: string;
  graphVersion: string;
  timeoutMs: number;
  b2bWords: string[];
  syncDisabled: boolean;
};

function optionalSecret(name: string, env: Env, reader: Reader | undefined, minLength: number): string | undefined {
  try {
    return readSecret(name, env, reader, { minLength, howTo: HOW_TO });
  } catch {
    return undefined;
  }
}

// Sem acento, minúsculas (para comparar nomes de formulário e chaves).
export function plainLower(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function metaLeadsConfig(env: Env = process.env, reader?: Reader): MetaLeadsConfig {
  const pageId = env.META_PAGE_ID?.trim();
  const version = env.META_GRAPH_VERSION?.trim();
  const timeout = Number(env.META_LEADS_TIMEOUT_MS);
  const words = (env.META_LEADS_B2B_WORDS ?? "")
    .split(",")
    .map((w) => plainLower(w.trim()))
    .filter((w) => /^[a-z0-9 _-]{2,30}$/.test(w))
    .slice(0, 20);
  return {
    appSecret: optionalSecret("META_APP_SECRET", env, reader, 16),
    verifyToken: optionalSecret("META_WEBHOOK_VERIFY_TOKEN", env, reader, 16),
    pageToken: optionalSecret("META_PAGE_TOKEN", env, reader, 20),
    pageId: pageId && /^\d{5,30}$/.test(pageId) ? pageId : undefined,
    graphUrl: (env.META_GRAPH_URL || DEFAULT_GRAPH_URL).replace(/\/+$/, ""),
    graphVersion: version && /^v\d{1,3}\.\d{1,2}$/.test(version) ? version : DEFAULT_GRAPH_VERSION,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? Math.min(timeout, 20_000) : 8_000,
    b2bWords: words.length ? words : DEFAULT_B2B_WORDS,
    syncDisabled: env.META_LEADS_SYNC_DISABLED === "1",
  };
}

// Comparação em tempo constante (o tamanho também não vaza: compara hashes).
function sameSecret(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

// X-Hub-Signature-256 = "sha256=" + HMAC-SHA256 do corpo CRU com o segredo do app.
export function verifyMetaSignature(rawBody: Buffer | undefined, header: string | undefined, appSecret: string): boolean {
  if (!rawBody || typeof header !== "string") return false;
  const match = /^sha256=([0-9a-f]{64})$/i.exec(header.trim());
  if (!match) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(match[1]!, "hex"));
}

// GET de verificação: devolve o challenge só com modo e token certos.
export function checkSubscription(query: Record<string, unknown>, verifyToken: string): string | undefined {
  const mode = query["hub.mode"];
  const token = query["hub.verify_token"];
  const challenge = query["hub.challenge"];
  if (mode !== "subscribe" || typeof token !== "string" || typeof challenge !== "string") return undefined;
  if (token.length > 200 || !sameSecret(token, verifyToken)) return undefined;
  return /^\d{1,32}$/.test(challenge) ? challenge : undefined;
}

// ---------------- Corpo do webhook ----------------

const MetaId = z
  .union([z.string(), z.number().int().nonnegative()])
  .transform(String)
  .pipe(z.string().regex(/^\d{1,30}$/));

const LeadgenValueSchema = z.object({
  leadgen_id: MetaId,
  page_id: MetaId,
  form_id: MetaId,
  ad_id: MetaId.optional(),
  adgroup_id: MetaId.optional(),
  created_time: z.number().int().nonnegative(),
});

export const MetaLeadgenWebhookSchema = z.object({
  object: z.literal("page"),
  entry: z
    .array(
      z.object({
        id: z.union([z.string(), z.number()]).optional(),
        time: z.number().optional(),
        changes: z.array(z.object({ field: z.string().max(60), value: z.unknown() })).max(200).default([]),
      }),
    )
    .max(100),
});

export type LeadgenChange = { leadgenId: string; pageId: string; formId: string; adId?: string; adgroupId?: string; createdTime: number };

// undefined = corpo fora do formato; [] = nada de leadgen (outro campo).
export function leadgenChangesOf(body: unknown): LeadgenChange[] | undefined {
  const parsed = MetaLeadgenWebhookSchema.safeParse(body);
  if (!parsed.success) return undefined;
  const out: LeadgenChange[] = [];
  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      if (change.field !== "leadgen") continue;
      const value = LeadgenValueSchema.safeParse(change.value);
      if (!value.success) continue;
      const v = value.data;
      out.push({
        leadgenId: v.leadgen_id,
        pageId: v.page_id,
        formId: v.form_id,
        ...(v.ad_id ? { adId: v.ad_id } : {}),
        ...(v.adgroup_id ? { adgroupId: v.adgroup_id } : {}),
        createdTime: v.created_time,
      });
    }
  }
  return out.slice(0, 500);
}

// ---------------- Campos do formulário ----------------

export type MappedLead = {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  city?: string;
  state?: string;
  jobTitle?: string;
  businessType?: BusinessType;
  cnpj?: string;
};

export function normalizeFieldKey(key: string): string {
  return plainLower(key)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

// Texto livre de terceiros: sem < >, sem caracteres de controle, espaços simples.
export function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
  return text || undefined;
}

const UF_BY_NAME: Record<string, string> = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE", distrito_federal: "DF", espirito_santo: "ES", goias: "GO",
  maranhao: "MA", mato_grosso: "MT", mato_grosso_do_sul: "MS", minas_gerais: "MG", para: "PA", paraiba: "PB", parana: "PR", pernambuco: "PE",
  piaui: "PI", rio_de_janeiro: "RJ", rio_grande_do_norte: "RN", rio_grande_do_sul: "RS", rondonia: "RO", roraima: "RR", santa_catarina: "SC",
  sao_paulo: "SP", sergipe: "SE", tocantins: "TO",
};

function toUf(value: string): string | undefined {
  const upper = value.trim().toUpperCase();
  if ((BRAZIL_UFS as readonly string[]).includes(upper)) return upper;
  return UF_BY_NAME[normalizeFieldKey(value)];
}

function toEmail(value: string): string | undefined {
  const email = value.trim().toLowerCase();
  return email.length <= 160 && /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(email) ? email : undefined;
}

function toPhone(value: string): string | undefined {
  let digits = value.replace(/\D/g, "").replace(/^0+/, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
  return /^\d{10,11}$/.test(digits) ? digits : undefined;
}

export function businessTypeOf(value: string | undefined): BusinessType | undefined {
  if (!value) return undefined;
  const text = plainLower(value);
  if (text.includes("imobili")) return "imobiliaria";
  if (text.includes("corretor")) return "corretor";
  if (/(loja|concession|revenda|garagem|multimarca)/.test(text)) return "loja";
  return undefined;
}

type Target = keyof MappedLead | "firstName" | "lastName";
// Ordem importa: "tipo_de_empresa" é tipo (não empresa); "nome_da_empresa" é empresa (não nome).
const RULES: Array<[Target, (k: string) => boolean]> = [
  ["email", (k) => k === "email" || k.includes("email") || k.includes("e_mail")],
  ["phone", (k) => /(phone|telefone|celular|whatsapp|^fone$)/.test(k)],
  ["cnpj", (k) => k.includes("cnpj")],
  ["businessType", (k) => k === "tipo" || k.startsWith("tipo_") || k.includes("_tipo_") || k.includes("segmento") || k.includes("voce_e") || k.includes("ramo")],
  ["company", (k) => /(empresa|company|razao_social|nome_da_loja|nome_da_imobiliaria|nome_fantasia)/.test(k)],
  ["firstName", (k) => k === "first_name" || k === "primeiro_nome"],
  ["lastName", (k) => k === "last_name" || k === "sobrenome" || k === "ultimo_nome"],
  ["name", (k) => k === "full_name" || k === "name" || k.includes("nome")],
  ["city", (k) => k === "city" || k.includes("cidade") || k.includes("municipio")],
  ["state", (k) => k === "state" || k === "uf" || k.endsWith("_uf") || k.includes("estado") || k === "province"],
  ["jobTitle", (k) => k === "job_title" || k.includes("cargo") || k.includes("funcao")],
];

const FieldEntrySchema = z.object({ name: z.string().max(200), values: z.array(z.string().max(2000)).max(20) });

export function mapLeadFields(fieldData: unknown): MappedLead {
  if (!Array.isArray(fieldData) || fieldData.length > 100) return {};
  const raw: Partial<Record<Target, string>> = {};
  for (const item of fieldData) {
    const entry = FieldEntrySchema.safeParse(item);
    if (!entry.success) continue;
    const value = entry.data.values.find((v) => v.trim());
    if (!value) continue;
    const key = normalizeFieldKey(entry.data.name);
    const target = RULES.find(([, test]) => test(key))?.[0];
    if (target && raw[target] === undefined) raw[target] = value;
  }
  const out: MappedLead = {};
  const name = cleanText(raw.name, 120) ?? cleanText([raw.firstName, raw.lastName].filter(Boolean).join(" "), 120);
  if (name) out.name = name;
  const email = raw.email && toEmail(raw.email);
  if (email) out.email = email;
  const phone = raw.phone && toPhone(raw.phone);
  if (phone) out.phone = phone;
  const company = cleanText(raw.company, 160);
  if (company) out.company = company;
  const city = cleanText(raw.city, 80);
  if (city) out.city = city;
  const state = raw.state && toUf(raw.state);
  if (state) out.state = state;
  const jobTitle = cleanText(raw.jobTitle, 80);
  if (jobTitle) out.jobTitle = jobTitle;
  const businessType = businessTypeOf(raw.businessType);
  if (businessType) out.businessType = businessType;
  const cnpj = raw.cnpj?.replace(/\D/g, "");
  if (cnpj && cnpj.length === 14 && isValidCnpj(cnpj)) out.cnpj = cnpj;
  return out;
}

// B2B (loja, imobiliária, corretor): nome do formulário ou da campanha com
// uma das palavras, ou o formulário perguntou o nome da empresa.
export function isB2BLead(input: { formName?: string; campaignName?: string; fields?: MappedLead }, words: string[]): boolean {
  if (input.fields?.company) return true;
  const text = plainLower(`${input.formName ?? ""} ${input.campaignName ?? ""}`);
  return words.some((w) => text.includes(w));
}

export function guessInterest(text: string): MarketingInterest {
  const t = plainLower(text);
  if (/(imove|imovel|apartament|casa|terreno|alug|lote|imobili)/.test(t)) return "comprar_imovel";
  if (/(carro|veicul|seminov|suv|moto|automo|picape|caminhonete)/.test(t)) return "comprar_carro";
  return "geral";
}

// ---------------- Graph API ----------------

export const LEAD_FIELDS = "created_time,field_data,ad_id,ad_name,adset_name,campaign_name,form_id,platform,is_organic";

const optionalText = (max: number) =>
  z
    .unknown()
    .optional()
    .transform((v) => cleanText(v, max));

export const GraphLeadSchema = z.object({
  id: MetaId,
  created_time: z.string().max(40).optional(),
  field_data: z.unknown().optional(),
  ad_id: MetaId.optional().catch(undefined),
  ad_name: optionalText(200),
  adset_name: optionalText(200),
  campaign_name: optionalText(200),
  form_id: MetaId.optional().catch(undefined),
  platform: optionalText(20),
  is_organic: z.boolean().optional().catch(undefined),
});
export type GraphLead = z.infer<typeof GraphLeadSchema>;

export class MetaGraphError extends Error {}

export type GraphConfig = Pick<MetaLeadsConfig, "graphUrl" | "graphVersion" | "timeoutMs"> & { pageToken: string };

// Token no cabeçalho Authorization (nunca na URL, que costuma ir para log).
async function graphGet(config: GraphConfig, path: string, params: Record<string, string>): Promise<unknown> {
  const url = `${config.graphUrl}/${config.graphVersion}/${path}?${new URLSearchParams(params).toString()}`;
  let res: Response;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(config.timeoutMs),
      headers: { Authorization: `Bearer ${config.pageToken}`, Accept: "application/json" },
    });
  } catch (error) {
    const name = (error as Error).name;
    const reason = name === "TimeoutError" || name === "AbortError" ? "tempo esgotado" : `sem conexão (${(error as Error).message})`;
    throw new MetaGraphError(scrubMetaText(reason, config.pageToken));
  }
  const raw = await res.text().catch(() => "");
  if (raw.length > 2_000_000) throw new MetaGraphError("resposta grande demais");
  if (!res.ok) {
    let detail = "";
    try {
      const error = (JSON.parse(raw) as { error?: { type?: unknown; code?: unknown; error_subcode?: unknown } }).error ?? {};
      detail = [error.type, error.code, error.error_subcode].filter((v) => typeof v === "string" || typeof v === "number").join(" ");
    } catch {
      detail = "";
    }
    throw new MetaGraphError(scrubMetaText(`HTTP ${res.status}${detail ? ` (${detail})` : ""}`, config.pageToken));
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new MetaGraphError("resposta inválida");
  }
}

// O arquivo secrets/meta_page_token costuma guardar o token do usuário do
// sistema (não expira); formulários e leads só saem com o token da própria
// página, que a Graph devolve para quem tem acesso a ela. Se o salvo já for o
// da página (ou a troca falhar), devolve undefined e quem chama usa o salvo.
export async function fetchPageAccessToken(config: GraphConfig, pageId: string): Promise<string | undefined> {
  if (!/^\d{1,30}$/.test(pageId)) return undefined;
  try {
    const body = (await graphGet(config, pageId, { fields: "access_token" })) as { access_token?: unknown };
    const token = typeof body.access_token === "string" ? body.access_token.trim() : "";
    return token.length >= 20 && token.length <= 2000 && !/\s/.test(token) ? token : undefined;
  } catch {
    return undefined;
  }
}

// Seguidores da página (Jornada do Hub): followers_count, ou fan_count
// (curtidas) quando a Graph não devolve o primeiro. undefined = sem número.
export async function fetchPageFollowers(config: GraphConfig, pageId: string): Promise<number | undefined> {
  if (!/^\d{1,30}$/.test(pageId)) throw new MetaGraphError("id de página inválido");
  const body = (await graphGet(config, pageId, { fields: "followers_count,fan_count" })) as { followers_count?: unknown; fan_count?: unknown };
  for (const v of [body?.followers_count, body?.fan_count]) {
    if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) return v;
  }
  return undefined;
}

// Seguidores do Instagram profissional ligado à página (Jornada do Hub).
// Precisa das permissões instagram_basic (+ pages_read_engagement) no token;
// sem elas a Graph responde OAuthException. undefined = página sem Instagram
// ligado ou número ausente.
export async function fetchInstagramFollowers(config: GraphConfig, pageId: string): Promise<number | undefined> {
  if (!/^\d{1,30}$/.test(pageId)) throw new MetaGraphError("id de página inválido");
  const body = (await graphGet(config, pageId, { fields: "instagram_business_account{followers_count,username}" })) as { instagram_business_account?: { followers_count?: unknown } };
  const v = body?.instagram_business_account?.followers_count;
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : undefined;
}

export async function fetchLead(config: GraphConfig, leadgenId: string): Promise<GraphLead> {
  if (!/^\d{1,30}$/.test(leadgenId)) throw new MetaGraphError("id de lead inválido");
  const parsed = GraphLeadSchema.safeParse(await graphGet(config, leadgenId, { fields: LEAD_FIELDS }));
  if (!parsed.success) throw new MetaGraphError("lead em formato inesperado");
  return parsed.data;
}

const formNames = new Map<string, { name?: string; at: number }>();
const FORM_CACHE_MS = 6 * 3_600_000;

export async function fetchFormName(config: GraphConfig, formId: string | undefined): Promise<string | undefined> {
  if (!formId || !/^\d{1,30}$/.test(formId)) return undefined;
  const hit = formNames.get(formId);
  if (hit && Date.now() - hit.at < FORM_CACHE_MS) return hit.name;
  let name: string | undefined;
  try {
    const body = (await graphGet(config, formId, { fields: "name" })) as { name?: unknown };
    name = cleanText(body?.name, 160);
  } catch {
    return undefined; // sem o nome do formulário, segue com o da campanha
  }
  if (formNames.size > 500) formNames.clear();
  formNames.set(formId, { name, at: Date.now() });
  return name;
}

export function rememberFormName(formId: string, name: string | undefined): void {
  if (!/^\d{1,30}$/.test(formId)) return;
  if (formNames.size > 500) formNames.clear();
  formNames.set(formId, { name: cleanText(name, 160), at: Date.now() });
}

const PageSchema = z.object({
  data: z.array(z.unknown()).max(1000).default([]),
  paging: z.object({ cursors: z.object({ after: z.string().optional() }).optional(), next: z.string().optional() }).optional(),
});

// Paginação pelo cursor "after" (o link "next" da resposta não é seguido:
// a URL vem de fora). No máximo 10 páginas.
async function graphList(config: GraphConfig, path: string, params: Record<string, string>): Promise<unknown[]> {
  const out: unknown[] = [];
  let after: string | undefined;
  for (let page = 0; page < 10; page++) {
    const parsed = PageSchema.safeParse(await graphGet(config, path, { ...params, limit: "100", ...(after ? { after } : {}) }));
    if (!parsed.success) throw new MetaGraphError("lista em formato inesperado");
    out.push(...parsed.data.data);
    const cursor = parsed.data.paging?.cursors?.after;
    if (!parsed.data.paging?.next || !cursor || !/^[A-Za-z0-9_=-]{1,500}$/.test(cursor)) break;
    after = cursor;
  }
  return out;
}

export async function listPageForms(config: GraphConfig, pageId: string): Promise<Array<{ id: string; name?: string }>> {
  const items = await graphList(config, `${pageId}/leadgen_forms`, { fields: "id,name" });
  const out: Array<{ id: string; name?: string }> = [];
  for (const item of items) {
    const parsed = z.object({ id: MetaId, name: optionalText(160) }).safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export async function listFormLeads(config: GraphConfig, formId: string, sinceSec: number): Promise<GraphLead[]> {
  const filtering = JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: Math.floor(sinceSec) }]);
  const items = await graphList(config, `${formId}/leads`, { fields: LEAD_FIELDS, filtering });
  const out: GraphLead[] = [];
  for (const item of items) {
    const parsed = GraphLeadSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

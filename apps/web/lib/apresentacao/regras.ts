import {
  ACQUISITION_COOKIE,
  ACQUISITION_MAX_AGE,
  APRESENTACAO_PDF_PATH,
  classifyAcquisition,
  serializeAcquisition,
  type CampaignUtm,
} from "@novoseminovo/shared-types";

// Regras puras do PDF de apresentação para empresas (sem Next, sem disco):
// usadas pelas rotas app/apresentacao-empresas.pdf e app/apresentacao-empresas.

export const APRESENTACAO_ARQUIVO = "apresentacao-empresas.pdf";
export const APRESENTACAO_NOME_DOWNLOAD = "NovoSeminovo-para-empresas.pdf";
export const APRESENTACAO_MAX_BYTES = 20 * 1024 * 1024;
const NAO_INDEXAR = "noindex, nofollow";

// Tipo decidido pelos bytes (regra do projeto): todo PDF começa com "%PDF-".
export function ehPdf(bytes: Uint8Array): boolean {
  const assinatura = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  return bytes.length >= assinatura.length && assinatura.every((b, i) => bytes[i] === b);
}

export function etagDe(size: number, mtime: Date): string {
  return `"${size.toString(16)}-${Math.floor(mtime.getTime() / 1000).toString(16)}"`;
}

export function cabecalhosPdf(info: { size: number; mtime: Date }): Record<string, string> {
  return {
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="${APRESENTACAO_NOME_DOWNLOAD}"`,
    "Content-Length": String(info.size),
    // 5 min: o Diego troca o arquivo e em poucos minutos todo mundo vê o novo.
    "Cache-Control": "public, max-age=300",
    ETag: etagDe(info.size, info.mtime),
    "Last-Modified": info.mtime.toUTCString(),
    "X-Robots-Tag": NAO_INDEXAR,
    "X-Content-Type-Options": "nosniff",
  };
}

// O navegador já tem esta versão? (If-None-Match vence If-Modified-Since.)
export function naoModificado(headers: Headers, etag: string, mtime: Date): boolean {
  const inm = headers.get("if-none-match");
  if (inm) return inm.split(",").some((v) => v.trim().replace(/^W\//, "") === etag || v.trim() === "*");
  const ims = headers.get("if-modified-since");
  if (!ims) return false;
  const desde = Date.parse(ims);
  return Number.isFinite(desde) && Math.floor(mtime.getTime() / 1000) * 1000 <= desde;
}

// Destino fixo (nunca vem da URL: sem open redirect). Sem cache, para cada
// clique passar pelo servidor e ser contado.
export function cabecalhosRedirect(): Record<string, string> {
  return { Location: APRESENTACAO_PDF_PATH, "Cache-Control": "no-store", "X-Robots-Tag": NAO_INDEXAR, "Referrer-Policy": "strict-origin-when-cross-origin" };
}

// Mesmo cookie e mesma regra do AttributionCapture: vale a última origem que
// não foi "direto"; sem utm, não apaga a origem que a pessoa já tinha.
export function cookieDeOrigem(utm: CampaignUtm, opts: { hasCookie: boolean; secure: boolean }): string | undefined {
  const origin = classifyAcquisition({ utmSource: utm.source, utmMedium: utm.medium, utmCampaign: utm.campaign, utmContent: utm.content, utmTerm: utm.term });
  if (origin.source === "direto" && opts.hasCookie) return undefined;
  return `${ACQUISITION_COOKIE}=${encodeURIComponent(serializeAcquisition(origin))}; Max-Age=${ACQUISITION_MAX_AGE}; Path=/; SameSite=Lax${opts.secure ? "; Secure" : ""}`;
}

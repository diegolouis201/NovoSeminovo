import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { sanitizeUpload } from "../common/image-safety";
import { assertPublicHttpUrl, safeFetch } from "../common/safe-fetch";
import { getPhotoStorage } from "../common/storage";
import type { PrismaService } from "../prisma/prisma.service";

// Logo da empresa vinda da integração com o CRM (pedido do Diego, 20/11/2026).
// - VRSync (ZAP/VivaReal): <Header><Logo> do feed; sem ele, <ContactInfo><Logo>
//   do primeiro anúncio que tiver.
// - JSON NovoSeminovo: campo opcional de topo "logoUrl".
// - Catálogo Meta de veículos: o padrão não tem campo de logo da loja.
// Só preenche Partner.logoUrl quando a empresa ainda não tem logo (nunca troca
// a que o dono enviou, nem quando a URL do feed muda). A imagem é baixada com
// as travas de sempre, conferida pelos bytes, redesenhada e guardada no nosso
// armazenamento; a URL externa nunca é usada direto.

const LOGO_MAX_BYTES = 5_000_000;
const LOGO_TIMEOUT_MS = 15_000;
const UrlLogo = z.string().trim().max(2000).url().refine((u) => /^https?:\/\//i.test(u));

const http = (v: unknown): string | undefined => {
  const texto = typeof v === "object" && v !== null ? (v as Record<string, unknown>)["#text"] : v;
  const r = UrlLogo.safeParse(texto);
  return r.success ? r.data : undefined;
};

const xml = new XMLParser({ ignoreAttributes: true, textNodeName: "#text", parseTagValue: false, trimValues: true, removeNSPrefix: true, isArray: (name) => name === "Listing" });

export function vrsyncLogoUrl(raw: string): string | undefined {
  if (/<!ENTITY/i.test(raw)) return undefined;
  let doc: Record<string, unknown>;
  try {
    doc = xml.parse(raw) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  const root = doc.ListingDataFeed as Record<string, unknown> | undefined;
  if (!root || typeof root !== "object") return undefined;
  const header = (root.Header ?? {}) as Record<string, unknown>;
  const doHeader = http(header.Logo);
  if (doHeader) return doHeader;
  const listings = ((root.Listings as Record<string, unknown> | undefined)?.Listing ?? []) as Record<string, unknown>[];
  for (const l of Array.isArray(listings) ? listings : []) {
    const contato = http((l?.ContactInfo as Record<string, unknown> | undefined)?.Logo);
    if (contato) return contato;
  }
  return undefined;
}

export function jsonLogoUrl(raw: string): string | undefined {
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return undefined;
  return http((doc as { logoUrl?: unknown }).logoUrl);
}

export function logoUrlDoFeed(format: string, raw: string): string | undefined {
  if (format === "vrsync") return vrsyncLogoUrl(raw);
  if (format === "novoseminovo_json") return jsonLogoUrl(raw);
  return undefined;
}

export const baixarLogo = async (url: string): Promise<Buffer> => (await safeFetch(url, { maxBytes: LOGO_MAX_BYTES, timeoutMs: LOGO_TIMEOUT_MS, accept: "image/*" })).buffer;

export type ResultadoLogoFeed = "salva" | "ja_tem" | "sem_empresa";

export async function importarLogoDoFeed(
  prisma: PrismaService,
  partnerId: string,
  url: string,
  opcoes: { baixar?: (url: string) => Promise<Buffer>; aoSalvar?: (partnerId: string) => Promise<void> } = {},
): Promise<ResultadoLogoFeed> {
  const p = await prisma.partner.findUnique({ where: { id: partnerId }, select: { logoUrl: true } });
  if (!p) return "sem_empresa";
  if (p.logoUrl) return "ja_tem";
  // javascript:, file:, usuário/senha no link, IP interno e localhost: recusa
  // antes de qualquer download (o safeFetch confere de novo o IP resolvido).
  assertPublicHttpUrl(url);
  const bytes = await (opcoes.baixar ?? baixarLogo)(url);
  const limpa = await sanitizeUpload({ buffer: bytes, mimetype: "application/octet-stream", originalname: "logo-do-feed" });
  const storage = getPhotoStorage();
  const salva = await storage.save(limpa.buffer, limpa.originalname, limpa.mimetype);
  // Só grava se continuar sem logo (o dono pode ter enviado a dele enquanto baixava).
  const { count } = await prisma.partner.updateMany({ where: { id: partnerId, logoUrl: null }, data: { logoUrl: salva } });
  if (!count) {
    await storage.remove(salva);
    return "ja_tem";
  }
  if (opcoes.aoSalvar) await opcoes.aoSalvar(partnerId);
  return "salva";
}

// Leitura da página de um anúncio em outro site (OLX, Webmotors, ZAP,
// VivaReal, iCarros, Mercado Livre…) para a importação pelo link. Não depende
// do layout de cada portal: junta o que quase todos publicam para o Google
// e as redes sociais — dados estruturados (JSON-LD), tags Open Graph/meta,
// o texto visível e as imagens — e a IA monta o rascunho no nosso padrão
// (ver AiService.extractListingFromPage).

export type PageData = {
  url: string;
  host: string;
  title?: string;
  description?: string;
  structured: string;
  text: string;
  images: string[];
};

const MAX_TEXT = 12_000;
const MAX_STRUCTURED = 8_000;
const MAX_IMAGES = 40;

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

function metaContent(html: string, key: string): string | undefined {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) return decodeEntities(match[1]).trim();
  }
  return undefined;
}

function absolute(src: string, base: string): string | undefined {
  try {
    const url = new URL(decodeEntities(src.trim()), base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

// Imagens citadas em JSON-LD ("image": "..." ou ["...", ...] ou {url}).
function collectJsonLdImages(value: unknown, out: string[]): void {
  if (!value) return;
  if (typeof value === "string") {
    if (/^https?:\/\//.test(value)) out.push(value);
    return;
  }
  if (Array.isArray(value)) return value.forEach((item) => collectJsonLdImages(item, out));
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["image", "images", "photo", "photos", "contentUrl", "url"]) {
      if (key === "url" && !("contentUrl" in record) && record["@type"] !== "ImageObject") continue;
      collectJsonLdImages(record[key], out);
    }
    if (Array.isArray(record["@graph"])) collectJsonLdImages(record["@graph"], out);
    for (const nested of ["offers", "itemOffered", "mainEntity"]) collectJsonLdImages(record[nested], out);
  }
}

// Ícones, logos e banners que não são foto do anúncio.
const NOT_A_PHOTO = /logo|icon|sprite|avatar|placeholder|banner|badge|favicon|\.svg(\?|$)|\.gif(\?|$)|1x1|pixel|tracking/i;

export function extractPageData(html: string, pageUrl: string): PageData {
  const host = new URL(pageUrl).hostname.replace(/^www\./, "");
  const structuredBlocks: string[] = [];
  const jsonLdImages: string[] = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = match[1]!.trim();
    structuredBlocks.push(raw);
    try {
      collectJsonLdImages(JSON.parse(raw), jsonLdImages);
    } catch {
      // JSON-LD quebrado: o texto ainda vai para a IA
    }
  }

  const meta: string[] = [];
  for (const key of ["og:title", "og:description", "og:price:amount", "product:price:amount", "og:locality", "og:region", "twitter:title", "twitter:description", "description"]) {
    const value = metaContent(html, key);
    if (value) meta.push(`${key}: ${value}`);
  }

  const images = [
    ...jsonLdImages,
    ...[...html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image(?::url)?|twitter:image)["'][^>]*content=["']([^"']+)["']/gi)].map((m) => m[1]!),
    ...[...html.matchAll(/<img[^>]+(?:data-src|src)=["']([^"']+)["']/gi)].map((m) => m[1]!),
    ...[...html.matchAll(/<source[^>]+srcset=["']([^"'\s,]+)/gi)].map((m) => m[1]!),
  ]
    .map((src) => absolute(src, pageUrl))
    .filter((src): src is string => Boolean(src) && !NOT_A_PHOTO.test(src!) && !src!.startsWith("data:"));

  const text = decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

  return {
    url: pageUrl,
    host,
    title: metaContent(html, "og:title") ?? decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").trim() ?? undefined,
    description: metaContent(html, "og:description") ?? metaContent(html, "description"),
    structured: [...meta, ...structuredBlocks].join("\n").slice(0, MAX_STRUCTURED),
    text: text.slice(0, MAX_TEXT),
    images: [...new Set(images)].slice(0, MAX_IMAGES),
  };
}

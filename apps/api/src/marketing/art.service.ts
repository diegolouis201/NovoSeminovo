import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Injectable, Logger } from "@nestjs/common";
import sharp from "sharp";
import { readPhotoBytes } from "../common/storage";
import { GeminiImageService } from "../architect/gemini-image.service";
import { PrismaService } from "../prisma/prisma.service";

// Arte dos posts do Instagram: 1080×1350 (4:5, o formato que ocupa mais tela
// no feed). Fundo = foto real de um anúncio, imagem gerada pelo Gemini ou o
// degradê da marca; por cima, logo, título, linha de apoio e o endereço do
// site. Fonte Fredoka (assets/fonts, licença OFL) instalada no container.
export const ART_SIZE = { width: 1080, height: 1350 };
export type ArtSource = "listing" | "ai" | "brand";
export type ArtInput = { source: ArtSource; headline: string; subline?: string; listingId?: string; prompt?: string };

const ASSETS_DIR = join(__dirname, "..", "..", "assets");
const GREEN = "#76b82a";
const BLUE = "#006aa4";
const FONT = "Fredoka, DejaVu Sans, sans-serif";

// Regras fixas de toda imagem gerada: fundo limpo, sem texto (o texto entra
// pelo nosso overlay, com a fonte da marca e sem erro de ortografia).
const AI_RULES =
  "Vertical 4:5 social media background photo. Photorealistic, bright, modern, Brazilian context. " +
  "Leave the lower third calm and uncluttered for text overlay. Absolutely no text, letters, numbers, logos, watermarks or license plates. Scene: ";

function escapeXml(raw: string): string {
  return raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Quebra em linhas por largura aproximada (Fredoka ≈ 0,52 × tamanho por letra).
export function wrapText(text: string, fontSize: number, maxWidth: number, maxLines: number): string[] {
  const maxChars = Math.max(8, Math.floor(maxWidth / (fontSize * 0.52)));
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = `${last.slice(0, Math.max(0, maxChars - 1)).replace(/\s+\S*$/, "")}…`;
  }
  return lines;
}

@Injectable()
export class MarketingArtService {
  private readonly logger = new Logger(MarketingArtService.name);
  private logo?: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiImageService,
  ) {}

  imagesEnabled(): boolean {
    return this.gemini.isEnabled();
  }

  // Devolve o JPEG pronto. Se o fundo pedido não der (anúncio sem foto, Gemini
  // fora do ar), cai no degradê da marca e diz isso em `fallback`.
  async render(input: ArtInput): Promise<{ image: Buffer; fallback?: string }> {
    let background: Buffer | undefined;
    let fallback: string | undefined;
    try {
      if (input.source === "listing") background = await this.listingBackground(input.listingId);
      if (input.source === "ai") background = await this.aiBackground(input.prompt ?? input.headline);
    } catch (error) {
      fallback = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Fundo da arte caiu no degradê: ${fallback}`);
    }
    const base = background
      ? await sharp(background).rotate().resize(ART_SIZE.width, ART_SIZE.height, { fit: "cover", position: "attention" }).toBuffer()
      : await sharp(Buffer.from(this.brandBackgroundSvg())).toBuffer();
    const logo = await this.logoBadge();
    const image = await sharp(base)
      .composite([
        { input: Buffer.from(this.overlaySvg(input.headline, input.subline, Boolean(background))), top: 0, left: 0 },
        { input: logo, top: 48, left: 48 },
      ])
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    return { image, fallback };
  }

  private async listingBackground(listingId: string | undefined): Promise<Buffer> {
    if (!listingId) throw new Error("Nenhum anúncio escolhido para a foto");
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { status: true, photos: { orderBy: [{ isCover: "desc" }, { position: "asc" }], take: 1, select: { url: true } } },
    });
    if (!listing || listing.status !== "active") throw new Error("Anúncio não encontrado ou fora do ar");
    if (!listing.photos[0]) throw new Error("O anúncio não tem fotos");
    return readPhotoBytes(listing.photos[0].url);
  }

  private async aiBackground(prompt: string): Promise<Buffer> {
    if (!this.gemini.isEnabled()) throw new Error("Geração de imagens (GEMINI_API_KEY) não configurada");
    const { image } = await this.gemini.generate(`${AI_RULES}${prompt}`, "4:5");
    return image;
  }

  private async logoBadge(): Promise<Buffer> {
    if (this.logo) return this.logo;
    const raw = await readFile(join(ASSETS_DIR, "logo.png"));
    const mark = await sharp(raw).resize({ width: 200, height: 154, fit: "inside" }).png().toBuffer();
    const { width = 200, height = 154 } = await sharp(mark).metadata();
    const pad = 18;
    const badge = Buffer.from(
      `<svg width="${width + pad * 2}" height="${height + pad * 2}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" rx="28" fill="#ffffff" fill-opacity="0.94"/></svg>`,
    );
    this.logo = await sharp(badge)
      .composite([{ input: mark, top: pad, left: pad }])
      .png()
      .toBuffer();
    return this.logo;
  }

  private brandBackgroundSvg(): string {
    const { width, height } = ART_SIZE;
    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${BLUE}"/><stop offset="100%" stop-color="#003b5c"/></linearGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <circle cx="${width - 120}" cy="260" r="260" fill="${GREEN}" fill-opacity="0.18"/>
  <circle cx="140" cy="${height - 520}" r="200" fill="#ffffff" fill-opacity="0.06"/>
</svg>`;
  }

  private overlaySvg(headline: string, subline: string | undefined, onPhoto: boolean): string {
    const { width, height } = ART_SIZE;
    const pad = 64;
    const maxWidth = width - pad * 2;
    const headSize = headline.length > 60 ? 64 : 78;
    const headLines = wrapText(headline, headSize, maxWidth, 3);
    const subLines = subline ? wrapText(subline, 38, maxWidth, 2) : [];
    const ctaHeight = 76;
    const bottom = height - 72;
    const ctaTop = bottom - ctaHeight;
    let y = ctaTop - 44 - subLines.length * 50;
    const subY = y;
    y -= headLines.length * headSize * 1.08 + 24;
    const headY = y;
    const fadeTop = Math.max(0, headY - 320);
    const texts: string[] = [];
    headLines.forEach((line, index) => {
      texts.push(
        `<text x="${pad}" y="${Math.round(headY + (index + 1) * headSize * 1.08)}" font-family="${FONT}" font-weight="700" font-size="${headSize}" fill="#ffffff">${escapeXml(line)}</text>`,
      );
    });
    subLines.forEach((line, index) => {
      texts.push(`<text x="${pad}" y="${Math.round(subY + 40 + index * 50)}" font-family="${FONT}" font-weight="600" font-size="38" fill="#e8f1f7">${escapeXml(line)}</text>`);
    });
    const ctaText = "novoseminovo.com.br";
    const ctaWidth = Math.round(ctaText.length * 36 * 0.56) + 72;
    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#001826" stop-opacity="0"/><stop offset="45%" stop-color="#001826" stop-opacity="${onPhoto ? 0.72 : 0.25}"/><stop offset="100%" stop-color="#001826" stop-opacity="${onPhoto ? 0.94 : 0.45}"/></linearGradient></defs>
  <rect x="0" y="${Math.round(fadeTop)}" width="${width}" height="${Math.round(height - fadeTop)}" fill="url(#fade)"/>
  ${texts.join("\n  ")}
  <rect x="${pad}" y="${ctaTop}" width="${ctaWidth}" height="${ctaHeight}" rx="${ctaHeight / 2}" fill="${GREEN}"/>
  <text x="${pad + ctaWidth / 2}" y="${ctaTop + 50}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="36" fill="#ffffff">${ctaText}</text>
</svg>`;
  }
}

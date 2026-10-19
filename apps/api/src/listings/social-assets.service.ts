import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import sharp from "sharp";
import { getPhotoStorage } from "../common/storage";
import { PrismaService } from "../prisma/prisma.service";
import { listingInclude, mimeTypeFromUrl, toListingSummary, type ListingWithDetails } from "./listings.mapper";

const FEED_SIZE = { width: 1080, height: 1080 };
const STORY_SIZE = { width: 1080, height: 1920 };

// Escapa texto vindo do anúncio (título, bairro etc.) antes de injetar no
// SVG do overlay — sem isso um título com "<" ou "&" quebraria o XML.
function escapeXml(raw: string): string {
  return raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

@Injectable()
export class SocialAssetsService {
  constructor(private readonly prisma: PrismaService) {}

  async generateFeedImage(listingId: string, requesterUserId: string): Promise<Buffer> {
    const listing = await this.loadListing(listingId, requesterUserId);
    return this.composeSlide(listing, listing.photos[0].url, FEED_SIZE);
  }

  async generateStoryImage(listingId: string, requesterUserId: string): Promise<Buffer> {
    const listing = await this.loadListing(listingId, requesterUserId);
    return this.composeSlide(listing, listing.photos[0].url, STORY_SIZE);
  }

  async generateCarouselImage(listingId: string, requesterUserId: string, index: number): Promise<Buffer> {
    const listing = await this.loadListing(listingId, requesterUserId);
    const photo = listing.photos[index];
    if (!photo) throw new NotFoundException(`Essa foto não existe nesse anúncio (índice ${index}).`);
    return this.composeSlide(listing, photo.url, FEED_SIZE);
  }

  async carouselLength(listingId: string, requesterUserId: string): Promise<number> {
    const listing = await this.loadListing(listingId, requesterUserId);
    return listing.photos.length;
  }

  private async loadListing(listingId: string, requesterUserId: string): Promise<ListingWithDetails> {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId }, include: listingInclude });
    if (!listing) throw new NotFoundException(`Anúncio ${listingId} não encontrado`);
    if (listing.ownerUserId !== requesterUserId) {
      throw new ForbiddenException("Você só pode gerar imagens dos seus próprios anúncios.");
    }
    if (listing.photos.length === 0) throw new NotFoundException("Esse anúncio ainda não tem fotos.");
    return listing;
  }

  private async composeSlide(
    listing: ListingWithDetails,
    photoUrl: string,
    size: { width: number; height: number },
  ): Promise<Buffer> {
    const storage = getPhotoStorage();
    const photoBuffer = await storage.read(photoUrl);
    // mimeTypeFromUrl só serve pra inferir a extensão de volta (ver
    // listings.mapper.ts) — sharp detecta o formato sozinho a partir dos
    // bytes, não precisa do mimetype aqui; mantido só pra deixar claro que
    // os três formatos aceitos no upload (jpeg/png/webp) são suportados.
    mimeTypeFromUrl(photoUrl);

    const background = await sharp(photoBuffer)
      .resize(size.width, size.height, { fit: "cover", position: "attention" })
      .jpeg({ quality: 90 })
      .toBuffer();

    const summary = toListingSummary(listing);
    const overlay = this.buildOverlaySvg(size, summary);

    return sharp(background)
      .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
      .jpeg({ quality: 92 })
      .toBuffer();
  }

  private buildOverlaySvg(
    size: { width: number; height: number },
    summary: { title: string; subtitle?: string; priceLabel: string; location: string },
  ): string {
    const { width, height } = size;
    const gradientHeight = Math.round(height * 0.38);
    const gradientTop = height - gradientHeight;
    const title = escapeXml(truncate(summary.title, 42));
    const subtitle = summary.subtitle ? escapeXml(truncate(summary.subtitle, 48)) : undefined;
    const location = escapeXml(truncate(summary.location, 48));
    const price = escapeXml(summary.priceLabel);

    const priceFontSize = Math.round(width * 0.075);
    const titleFontSize = Math.round(width * 0.042);
    const smallFontSize = Math.round(width * 0.03);
    const watermarkFontSize = Math.round(width * 0.028);
    const padding = Math.round(width * 0.06);

    let y = height - Math.round(height * 0.2);
    const lines: string[] = [];
    lines.push(
      `<text x="${padding}" y="${y}" font-family="Arial, sans-serif" font-size="${priceFontSize}" font-weight="800" fill="#ffffff">${price}</text>`,
    );
    y += Math.round(titleFontSize * 1.5);
    lines.push(
      `<text x="${padding}" y="${y}" font-family="Arial, sans-serif" font-size="${titleFontSize}" font-weight="700" fill="#ffffff">${title}</text>`,
    );
    if (subtitle) {
      y += Math.round(smallFontSize * 1.6);
      lines.push(
        `<text x="${padding}" y="${y}" font-family="Arial, sans-serif" font-size="${smallFontSize}" font-weight="400" fill="#e5e5e5">${subtitle}</text>`,
      );
    }
    y += Math.round(smallFontSize * 1.6);
    lines.push(
      `<text x="${padding}" y="${y}" font-family="Arial, sans-serif" font-size="${smallFontSize}" font-weight="400" fill="#cfcfcf">${location}</text>`,
    );

    return `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.82"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${gradientTop}" width="${width}" height="${gradientHeight}" fill="url(#fade)"/>
  ${lines.join("\n  ")}
  <text x="${width - padding}" y="${padding + watermarkFontSize}" text-anchor="end" font-family="Arial, sans-serif" font-size="${watermarkFontSize}" font-weight="700" fill="#ffffff" opacity="0.85">NovoSeminovo</text>
</svg>`;
  }
}

function truncate(raw: string, max: number): string {
  return raw.length > max ? `${raw.slice(0, max - 1)}…` : raw;
}

import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@novoseminovo/db";
import { PrismaService } from "../prisma/prisma.service";
import {
  MAX_FEED_IMAGES,
  feedPhotoUrl,
  homeListingFeedXml,
  vehicleFeedXml,
  type FeedEnv,
  type FeedHome,
  type FeedVehicle,
} from "./meta-catalog";

export type CatalogFeed = {
  xml: string;
  // Anúncios no feed.
  included: number;
  // Anúncios no ar que ficaram de fora por não ter foto que a Meta consiga
  // baixar (a Meta exige imagem).
  skippedNoPhoto: number;
};

// Mesmo critério da busca pública e do sitemap: só anúncio "active" — rascunho,
// em análise, pausado (inclui suspenso pela moderação), vendido, recusado e
// expirado nunca entram. Além disso, dono com a conta suspensa fica de fora.
function publicWhere(type: "vehicle" | "property"): Prisma.ListingWhereInput {
  return { type, status: "active", owner: { status: "active" } };
}

// Só campos públicos: nada de owner (telefone, e-mail, CPF, nome), rua do
// imóvel, matrícula, placa ou coordenada exata para fora do service.
const photoSelect = {
  select: { url: true },
  orderBy: [{ isCover: "desc" as const }, { position: "asc" as const }],
  take: MAX_FEED_IMAGES,
};

@Injectable()
export class CatalogFeedsService {
  private readonly logger = new Logger(CatalogFeedsService.name);
  private readonly cache = new Map<string, { at: number; feed: CatalogFeed }>();
  // A Meta busca o feed no máximo de hora em hora; 10 min de memória evita
  // montar o XML de novo a cada acesso repetido.
  cacheMs = 10 * 60_000;
  // Teto documentado (HANDOFF): os mais recentes primeiro.
  maxItems = 10_000;

  constructor(private readonly prisma: PrismaService) {}

  vehicleFeed(env: FeedEnv = process.env): Promise<CatalogFeed> {
    return this.cached("veiculos", env, () => this.buildVehicles(env));
  }

  homeListingFeed(env: FeedEnv = process.env): Promise<CatalogFeed> {
    return this.cached("imoveis", env, () => this.buildHomes(env));
  }

  private async cached(kind: string, env: FeedEnv, build: () => Promise<CatalogFeed>): Promise<CatalogFeed> {
    const key = `${kind}|${env.WEB_ORIGIN ?? ""}|${env.PUBLIC_API_URL ?? ""}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.cacheMs) return hit.feed;
    const feed = await build();
    if (this.cacheMs > 0) this.cache.set(key, { at: Date.now(), feed });
    this.logger.log(`Feed Meta de ${kind}: ${feed.included} anúncio(s); ${feed.skippedNoPhoto} sem foto ficaram de fora.`);
    return feed;
  }

  private photosOf(rows: { url: string }[], env: FeedEnv): string[] {
    return [...new Set(rows.map((row) => feedPhotoUrl(row.url, env)).filter((url): url is string => Boolean(url)))];
  }

  private async buildVehicles(env: FeedEnv): Promise<CatalogFeed> {
    const where = publicWhere("vehicle");
    const [rows, withoutPhotos] = await Promise.all([
      this.prisma.listing.findMany({
        where: { ...where, photos: { some: {} }, vehicleDetails: { isNot: null } },
        orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { id: "asc" }],
        take: this.maxItems,
        select: {
          id: true,
          title: true,
          description: true,
          price: true,
          city: true,
          state: true,
          photos: photoSelect,
          partner: { select: { type: true, legalName: true } },
          vehicleDetails: {
            select: {
              version: true,
              yearModel: true,
              mileage: true,
              transmission: true,
              fuelType: true,
              color: true,
              condition: true,
              bodyType: true,
              brand: { select: { name: true } },
              model: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.listing.count({ where: { ...where, photos: { none: {} } } }),
    ]);
    let skippedNoPhoto = withoutPhotos;
    const vehicles: FeedVehicle[] = [];
    for (const row of rows) {
      const details = row.vehicleDetails;
      const photoUrls = this.photosOf(row.photos, env);
      if (!details) continue;
      if (photoUrls.length === 0) {
        skippedNoPhoto++;
        continue;
      }
      vehicles.push({
        id: row.id,
        title: row.title,
        description: row.description,
        price: Number(row.price),
        city: row.city,
        state: row.state,
        photoUrls,
        brand: details.brand.name,
        model: details.model.name,
        version: details.version,
        yearModel: details.yearModel,
        mileage: details.mileage,
        transmission: details.transmission,
        fuelType: details.fuelType,
        color: details.color,
        condition: details.condition,
        bodyType: details.bodyType,
        partner: row.partner,
      });
    }
    return { xml: vehicleFeedXml(vehicles, env), included: vehicles.length, skippedNoPhoto };
  }

  private async buildHomes(env: FeedEnv): Promise<CatalogFeed> {
    const where = publicWhere("property");
    const [rows, withoutPhotos] = await Promise.all([
      this.prisma.listing.findMany({
        where: { ...where, photos: { some: {} }, propertyDetails: { isNot: null } },
        orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { id: "asc" }],
        take: this.maxItems,
        select: {
          id: true,
          title: true,
          description: true,
          price: true,
          city: true,
          state: true,
          neighborhood: true,
          // Só para calcular o ponto aproximado (approximatePoint); o valor
          // exato nunca vai para o XML.
          latitude: true,
          longitude: true,
          photos: photoSelect,
          partner: { select: { type: true } },
          propertyDetails: { select: { propertyType: true, purpose: true, bedrooms: true, bathrooms: true, areaM2: true } },
        },
      }),
      this.prisma.listing.count({ where: { ...where, photos: { none: {} } } }),
    ]);
    let skippedNoPhoto = withoutPhotos;
    const homes: FeedHome[] = [];
    for (const row of rows) {
      const details = row.propertyDetails;
      const photoUrls = this.photosOf(row.photos, env);
      if (!details) continue;
      if (photoUrls.length === 0) {
        skippedNoPhoto++;
        continue;
      }
      homes.push({
        id: row.id,
        title: row.title,
        description: row.description,
        price: Number(row.price),
        city: row.city,
        state: row.state,
        neighborhood: row.neighborhood,
        latitude: row.latitude,
        longitude: row.longitude,
        photoUrls,
        propertyType: details.propertyType,
        purpose: details.purpose,
        bedrooms: details.bedrooms,
        bathrooms: details.bathrooms,
        areaM2: Number(details.areaM2),
        partner: row.partner,
      });
    }
    return { xml: homeListingFeedXml(homes, env), included: homes.length, skippedNoPhoto };
  }
}

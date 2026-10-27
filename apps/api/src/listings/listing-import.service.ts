import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import type { ImportedListing } from "@novoseminovo/shared-types";
import { stripContactInfo } from "../common/contact-filter";
import { SafeFetchError, safeFetch, type SafeFetchOptions, type SafeFetchResult } from "../common/safe-fetch";
import { toUf } from "../integrations/vehicle-catalog-parser";
import { PrismaService } from "../prisma/prisma.service";
import { AiService } from "./ai.service";
import { assertNotImportedYet } from "./import-origin";
import { extractPageData, type PageData } from "./listing-import";

// Muitos portais devolvem página vazia ou bloqueio para robôs: a leitura se
// identifica como um navegador comum (é a pessoa importando o próprio anúncio).
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const PAGE_LIMITS: SafeFetchOptions = { maxBytes: 4_000_000, timeoutMs: 15_000, maxRedirects: 5, accept: "text/html,application/xhtml+xml", userAgent: BROWSER_UA };
const MAX_IMPORTS_PER_HOUR = 30;
const PHOTO_LIMITS: SafeFetchOptions = { maxBytes: 12_000_000, timeoutMs: 20_000, maxRedirects: 5, accept: "image/*", userAgent: BROWSER_UA };
const MAX_PHOTOS = 20;

type Fetcher = (url: string, options: SafeFetchOptions) => Promise<SafeFetchResult>;

const num = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : undefined;
const int = (value: unknown, min = 0, max = 100_000): number | undefined => {
  const n = num(value, min, max);
  return n === undefined ? undefined : Math.round(n);
};
const str = (value: unknown, max = 120): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;

// "Importar pelo link": lê a página do anúncio da pessoa em outro site e
// devolve um rascunho no padrão do NovoSeminovo. Nada é publicado aqui — o
// rascunho vai para o passo a passo, onde a pessoa revisa e completa.
@Injectable()
export class ListingImportService {
  // Trocável nos testes (o safeFetch recusa endereço local).
  private readonly logger = new Logger(ListingImportService.name);
  fetcher: Fetcher = safeFetch;

  // Importações por pessoa na última hora (além do limite por conexão do
  // controller): cada uma custa uma leitura de página e uma chamada à IA.
  private readonly recentByUser = new Map<string, number[]>();

  constructor(
    private readonly ai: AiService,
    private readonly prisma: PrismaService,
  ) {}

  private async beforeImport(userId: string, sourceUrl: string | undefined) {
    const now = Date.now();
    const recent = (this.recentByUser.get(userId) ?? []).filter((at) => now - at < 60 * 60_000);
    if (recent.length >= MAX_IMPORTS_PER_HOUR) {
      throw new HttpException("Você fez muitas importações na última hora. Tente de novo mais tarde.", HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    this.recentByUser.set(userId, recent);
    await assertNotImportedYet(this.prisma, userId, sourceUrl);
  }

  async importFromUrl(userId: string, url: string): Promise<ImportedListing> {
    if (!this.ai.isEnabled()) throw new ServiceUnavailableException("A importação pelo link está indisponível no momento.");
    await this.beforeImport(userId, url);

    let page: SafeFetchResult;
    try {
      page = await this.fetcher(url, PAGE_LIMITS);
    } catch (error) {
      this.logger.warn(`Leitura do link falhou (${new URL(url).hostname}): ${error instanceof Error ? error.message : error}`);
      throw new BadRequestException(
        error instanceof SafeFetchError && /endereço|link/i.test(error.message)
          ? error.message
          : "Esse site não deixa a gente ler o link. Sem problema: copie a página do anúncio e cole abaixo.",
      );
    }
    if (page.contentType && !/html|xml/i.test(page.contentType)) {
      throw new BadRequestException("Esse link não é de uma página de anúncio.");
    }

    const data = extractPageData(page.buffer.toString("utf8"), page.finalUrl);
    if (data.text.length < 200 && !data.structured) {
      throw new BadRequestException(
        "A página não mostrou o conteúdo do anúncio (o site pode exigir navegador ou login). Copie o texto do anúncio e cole abaixo.",
      );
    }
    return this.fromPage(data, "Esse link não parece ser de um anúncio de carro ou imóvel. Abra o anúncio e copie o link da barra do navegador — ou cole o texto dele abaixo.");
  }

  // Site que bloqueia a leitura (OLX, Webmotors): a pessoa abre o anúncio,
  // copia a página e cola. As imagens que vieram junto no que foi copiado
  // viram candidatas a foto; se não vier nenhuma, ela envia no passo a passo.
  async importFromText(userId: string, text: string, sourceUrl?: string, images: string[] = []): Promise<ImportedListing> {
    if (!this.ai.isEnabled()) throw new ServiceUnavailableException("A importação está indisponível no momento.");
    await this.beforeImport(userId, sourceUrl);
    let host = "texto colado";
    try {
      if (sourceUrl) host = new URL(sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      // link inválido: fica "texto colado"
    }
    const data = {
      url: sourceUrl ?? "",
      host,
      structured: "",
      text: text.trim().slice(0, 20_000),
      images: [...new Set(images.filter((image) => /^https?:\/\//.test(image)))].slice(0, 40),
    };
    return this.fromPage(data, "Não encontramos um anúncio de carro ou imóvel nesse texto. Abra o anúncio, selecione a página inteira (Ctrl+A), copie e cole aqui.");
  }

  // Extensão do Chrome: a página capturada no navegador da pessoa.
  async importFromCapturedPage(userId: string, page: { url: string; title?: string; description?: string; structured?: string; text: string; images?: string[] }) {
    if (!this.ai.isEnabled()) throw new ServiceUnavailableException("A importação está indisponível no momento.");
    await this.beforeImport(userId, page.url);
    const host = new URL(page.url).hostname.replace(/^www\./, "");
    const data: PageData = {
      url: page.url,
      host,
      title: page.title,
      description: page.description,
      structured: (page.structured ?? "").slice(0, 8_000),
      text: page.text.slice(0, 12_000),
      images: [...new Set((page.images ?? []).filter((image) => /^https?:\/\//.test(image)))].slice(0, 40),
    };
    if (data.text.length < 100 && !data.structured) {
      throw new BadRequestException("A página aberta não tem o conteúdo de um anúncio. Abra o anúncio e clique na extensão de novo.");
    }
    return this.fromPage(data, "A página aberta não parece ser um anúncio de carro ou imóvel. Abra o anúncio e clique na extensão de novo.");
  }

  private async fromPage(data: PageData, notListingMessage: string): Promise<ImportedListing> {
    const raw = await this.ai.extractListingFromPage(data);
    const assetType = raw.assetType === "vehicle" || raw.assetType === "property" ? raw.assetType : undefined;
    if (raw.is_listing === false || !assetType) throw new BadRequestException(notListingMessage);

    const photos = (Array.isArray(raw.photoIndexes) ? raw.photoIndexes : [])
      .map((index) => (Number.isInteger(index) ? data.images[index] : undefined))
      .filter((photo): photo is string => Boolean(photo))
      .filter((photo, index, all) => all.indexOf(photo) === index)
      .slice(0, MAX_PHOTOS);

    const title = stripContactInfo(str(raw.title, 120) ?? data.title ?? "").slice(0, 120);
    const description = stripContactInfo(typeof raw.description === "string" ? raw.description : data.description ?? "").slice(0, 5000);

    const listing: ImportedListing = {
      assetType,
      sourceHost: data.host,
      sourceUrl: data.url || undefined,
      title,
      description,
      price: num(raw.price, 1, 1_000_000_000),
      city: str(raw.city, 80),
      state: toUf(str(raw.state, 40)),
      neighborhood: str(raw.neighborhood, 80),
      photos,
      missing: [],
    };

    if (assetType === "vehicle") {
      const transmission = raw.transmission === "manual" || raw.transmission === "automatic" ? raw.transmission : undefined;
      const fuelType = ["flex", "gasoline", "ethanol", "diesel", "electric", "hybrid"].includes(raw.fuelType as string)
        ? (raw.fuelType as NonNullable<ImportedListing["vehicle"]>["fuelType"])
        : undefined;
      listing.vehicle = {
        brand: str(raw.brand, 40),
        model: str(raw.model, 60),
        version: str(raw.version, 80),
        yearManufacture: int(raw.yearManufacture, 1950, 2100),
        yearModel: int(raw.yearModel, 1950, 2100),
        mileage: int(raw.mileage, 0, 2_000_000),
        transmission,
        fuelType,
        color: str(raw.color, 30),
        doors: int(raw.doors, 2, 6),
        bodyType: str(raw.bodyType, 20)?.toLowerCase(),
      };
      const v = listing.vehicle;
      listing.missing = [
        !v.brand && "marca",
        !v.model && "modelo",
        !v.yearModel && "ano",
        v.mileage === undefined && "quilometragem",
        !listing.price && "preço",
        !listing.city && "cidade",
        photos.length === 0 && "fotos",
      ].filter((item): item is string => Boolean(item));
    } else {
      const features = (Array.isArray(raw.features) ? raw.features : []).filter((feature): feature is string =>
        ["pool", "balcony", "barbecue", "elevator", "gourmet_area", "garden", "furnished", "concierge"].includes(feature as string),
      );
      listing.property = {
        purpose: raw.purpose === "rent" ? "rent" : raw.purpose === "sale" ? "sale" : undefined,
        propertyType: str(raw.propertyType, 20),
        bedrooms: int(raw.bedrooms, 0, 50),
        suites: int(raw.suites, 0, 50),
        bathrooms: int(raw.bathrooms, 0, 50),
        parkingSpots: int(raw.parkingSpots, 0, 50),
        areaM2: num(raw.areaM2, 1, 10_000_000),
        totalAreaM2: num(raw.totalAreaM2, 1, 10_000_000),
        floor: int(raw.floor, 0, 300),
        condoFee: num(raw.condoFee, 0, 1_000_000),
        iptu: num(raw.iptu, 0, 1_000_000),
        features,
      };
      const p = listing.property;
      listing.missing = [
        !p.propertyType && "tipo do imóvel",
        !p.areaM2 && "área",
        !listing.price && "preço",
        !listing.city && "cidade",
        "endereço (rua e número)",
        photos.length === 0 && "fotos",
      ].filter((item): item is string => Boolean(item));
    }
    if (description.length < 20) listing.missing.push("descrição");
    return listing;
  }

  // Foto da página de origem, baixada pelo servidor (o navegador não pode
  // buscar direto em outro site). O passo a passo comprime e envia como foto
  // comum — e a placa é borrada na hora de salvar, como qualquer foto.
  async fetchPhoto(url: string): Promise<{ buffer: Buffer; contentType: string }> {
    try {
      const photo = await this.fetcher(url, PHOTO_LIMITS);
      const contentType = (photo.contentType ?? "").split(";")[0]!.trim().toLowerCase();
      if (!contentType.startsWith("image/") || contentType.includes("svg")) throw new Error(`tipo ${contentType}`);
      return { buffer: photo.buffer, contentType };
    } catch {
      throw new BadRequestException("Não foi possível baixar esta foto.");
    }
  }
}

import { createHash, randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { Prisma, type IntegrationFeed as FeedRow } from "@novoseminovo/db";
import {
  IntegrationListingInputSchema,
  allowedAssetTypes,
  assetTypeNotAllowedMessage,
  type CreateIntegrationFeedInput,
  type CreatedPartnerApiKey,
  type IntegrationFeed,
  type IntegrationListingInput,
  type IntegrationOverview,
  type IntegrationSyncReport,
  type PartnerApiKey,
} from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { ListingsService } from "../listings/listings.service";
import { VehiclesService } from "../vehicles/vehicles.service";
import { LISTING_STATUSES_COUNTED_IN_PLAN_QUOTA, listingLimitFor } from "../partners/partners.service";
import { SafeFetchError, assertPublicHttpUrl, safeFetch } from "../common/safe-fetch";
import { FeedFormatError, parseNovoSeminovoJson, parseVrsync, type ParsedFeedItem } from "./feed-parsers";
import { parseVehicleCatalog } from "./vehicle-catalog-parser";

export type IntegrationPartner = { id: string; ownerUserId: string; verified: boolean; type: string };

export type ItemOutcome = {
  externalId: string;
  action: "created" | "updated" | "unchanged" | "reactivated" | "skipped" | "error";
  listingId?: string;
  status?: string;
  message?: string;
};

const FEED_MAX_BYTES = 50_000_000;
const FEED_TIMEOUT_MS = 120_000;
const MAX_FEEDS_PER_PARTNER = 5;
const MAX_KEYS_PER_PARTNER = 10;
// "Sincronizar agora" seguido não refaz o download a cada clique.
const MANUAL_SYNC_COOLDOWN_MS = 2 * 60 * 1000;
// Sincronização marcada "running" há mais que isso morreu no meio (ex.: a
// API reiniciou) — pode rodar de novo.
const STALE_RUNNING_MS = 30 * 60 * 1000;
const API_RATE_LIMIT = { max: 300, windowMs: 60 * 1000 };

function syncIntervalMinutes(): number {
  const value = Number(process.env.INTEGRATION_SYNC_INTERVAL_MINUTES);
  return Number.isFinite(value) && value >= 15 ? value : 60;
}

function hashOf(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function emptyReport(): IntegrationSyncReport {
  return { total: 0, created: 0, updated: 0, unchanged: 0, paused: 0, reactivated: 0, skipped: 0, errors: [], warnings: [] };
}

// Relatório guardado no banco/mostrado no painel — com milhares de itens
// quebrados, a lista de erros fica nos primeiros 100.
function trimReport(report: IntegrationSyncReport): IntegrationSyncReport {
  return { ...report, errors: report.errors.slice(0, 100), warnings: report.warnings.slice(0, 20) };
}

function zodMessage(error: { issues: Array<{ message: string; path: (string | number)[] }> }): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => (issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
    .join("; ");
}

@Injectable()
export class IntegrationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IntegrationsService.name);
  private readonly runningFeeds = new Set<string>();
  private readonly apiHits = new Map<string, number[]>();
  private timer: NodeJS.Timeout | undefined;
  private ticking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly listings: ListingsService,
    private readonly vehicles: VehiclesService,
  ) {}

  // ---------- Agendador ----------

  async onModuleInit(): Promise<void> {
    // Sincronização que estava rodando quando a API caiu nunca vai terminar.
    await this.prisma.integrationFeed
      .updateMany({ where: { lastStatus: "running" }, data: { lastStatus: "error", lastError: "Sincronização interrompida (o servidor reiniciou). Vai rodar de novo sozinha." } })
      .catch(() => {});
    if (process.env.INTEGRATION_SYNC_DISABLED === "1") return;
    // Confere a cada 5 minutos quais feeds já passaram do intervalo — sem
    // dependência de agendador externo; a API roda numa instância só.
    this.timer = setInterval(() => void this.tick(), 5 * 60 * 1000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const dueBefore = new Date(Date.now() - syncIntervalMinutes() * 60 * 1000);
      const feeds = await this.prisma.integrationFeed.findMany({
        where: {
          active: true,
          OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: dueBefore } }],
        },
        orderBy: { lastSyncAt: { sort: "asc", nulls: "first" } },
        take: 20,
      });
      // Um de cada vez: cada feed pode ter centenas de anúncios e consulta à
      // FIPE por veículo novo — em paralelo isso disputaria o banco com o site.
      for (const feed of feeds) await this.syncFeed(feed.id).catch(() => {});
    } finally {
      this.ticking = false;
    }
  }

  // ---------- Núcleo: aplicar itens do CRM ----------

  async applyItems(
    partner: IntegrationPartner,
    items: ParsedFeedItem[],
    source: string,
    options: { fullSync: boolean },
  ): Promise<{ report: IntegrationSyncReport; outcomes: ItemOutcome[] }> {
    const report = emptyReport();
    const outcomes: ItemOutcome[] = [];
    report.total = items.length;

    const record = (outcome: ItemOutcome) => {
      outcomes.push(outcome);
      if (outcome.action === "error") report.errors.push({ externalId: outcome.externalId, message: outcome.message ?? "erro" });
      else report[outcome.action]++;
    };

    // Validação primeiro, tudo de uma vez — e código repetido no feed só
    // vale a primeira ocorrência (senão os dois itens brigariam pelo mesmo
    // anúncio a cada sincronização).
    const valid: { input: IntegrationListingInput; hash: string }[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      if (!item.ok) {
        record({ externalId: item.externalId, action: "error", message: item.message });
        continue;
      }
      const parsed = IntegrationListingInputSchema.safeParse(item.input);
      if (!parsed.success) {
        record({ externalId: item.externalId, action: "error", message: zodMessage(parsed.error) });
        continue;
      }
      if (!allowedAssetTypes(partner.type).includes(parsed.data.assetType)) {
        record({ externalId: parsed.data.externalId, action: "error", message: assetTypeNotAllowedMessage(partner.type) });
        continue;
      }
      if (seen.has(parsed.data.externalId)) {
        record({ externalId: parsed.data.externalId, action: "error", message: "Código repetido no feed — só o primeiro foi usado." });
        continue;
      }
      seen.add(parsed.data.externalId);
      valid.push({ input: parsed.data, hash: hashOf(parsed.data) });
    }

    if (options.fullSync && valid.length === 0) {
      // Feed que veio vazio (ou todo quebrado) é quase sempre falha
      // temporária do CRM — pausar o estoque inteiro por isso seria pior.
      throw new FeedFormatError(
        report.errors.length
          ? "Nenhum anúncio do feed pôde ser importado — veja os erros abaixo. Nada foi alterado no seu estoque."
          : "O feed veio sem nenhum anúncio. Por segurança, nada foi alterado no seu estoque.",
      );
    }

    const existingRows = await this.prisma.listing.findMany({
      where: { partnerId: partner.id, externalId: { in: valid.map((v) => v.input.externalId) } },
      select: {
        id: true,
        externalId: true,
        externalHash: true,
        externalSource: true,
        status: true,
        syncPaused: true,
        publishedAt: true,
        ownerUserId: true,
        photos: { select: { url: true }, orderBy: [{ isCover: "desc" }, { position: "asc" }] },
      },
    });
    const existingById = new Map(existingRows.map((row) => [row.externalId!, row]));

    const quota = await this.quotaFor(partner.id);

    for (const { input, hash } of valid) {
      const existing = existingById.get(input.externalId);
      try {
        if (!existing) {
          if (quota && quota.used >= quota.max) {
            record({
              externalId: input.externalId,
              action: "error",
              message: `Limite do plano atingido (${quota.max} anúncios). Contrate um plano maior em /parceiro/plano.`,
            });
            continue;
          }
          const created = await this.createListing(partner, input, hash, source);
          if (quota) quota.used++;
          record({ externalId: input.externalId, action: "created", listingId: created.id, status: created.status });
          continue;
        }

        // Vendido é definitivo; recusado pela moderação só volta se o admin
        // mudar — o CRM continuar mandando não reverte nenhum dos dois.
        if (existing.status === "sold" || existing.status === "rejected") {
          record({ externalId: input.externalId, action: "skipped", listingId: existing.id, status: existing.status });
          continue;
        }

        const reactivate = existing.syncPaused;
        if (existing.externalHash === hash && !reactivate) {
          // Mesmo conteúdo, mas pode ter vindo de outra origem (ex.: passou
          // do feed pra API) — a origem acompanha quem mandou por último.
          if (existing.externalSource !== source) {
            await this.prisma.listing.update({ where: { id: existing.id }, data: { externalSource: source } });
          }
          record({ externalId: input.externalId, action: "unchanged", listingId: existing.id, status: existing.status });
          continue;
        }

        const status = reactivate ? (partner.verified || existing.publishedAt ? "active" : "pending_review") : existing.status;
        if (existing.externalHash !== hash) {
          await this.updateListing(existing.id, input, existing.photos.map((p) => p.url));
        }
        await this.prisma.listing.update({
          where: { id: existing.id },
          data: {
            externalHash: hash,
            externalSource: source,
            ...(reactivate ? { status, syncPaused: false, publishedAt: status === "active" ? existing.publishedAt ?? new Date() : undefined } : {}),
          },
        });
        record({
          externalId: input.externalId,
          action: reactivate ? "reactivated" : "updated",
          listingId: existing.id,
          status,
        });
      } catch (error) {
        this.logger.warn(`Integração: falha no item ${input.externalId} do parceiro ${partner.id}: ${error}`);
        record({
          externalId: input.externalId,
          action: "error",
          message: error instanceof HttpException ? String(error.message) : "Erro ao salvar este anúncio.",
        });
      }
    }

    if (options.fullSync) {
      // Sumiu do CRM = saiu do ar aqui também. Só pausa (nunca apaga), e
      // marca syncPaused pra reativar sozinho se voltar ao feed.
      const gone = await this.prisma.listing.updateMany({
        where: {
          partnerId: partner.id,
          externalSource: source,
          externalId: { notIn: [...seen] },
          status: { in: ["active", "pending_review", "paused"] },
          syncPaused: false,
        },
        data: { status: "paused", syncPaused: true },
      });
      report.paused = gone.count;
    }

    if (quota && report.errors.some((e) => e.message.startsWith("Limite do plano"))) {
      report.warnings.push(`Seu plano permite ${quota.max} anúncios — os excedentes não foram importados.`);
    }
    if (!partner.verified && report.created > 0) {
      report.warnings.push(
        "Sua loja ainda não é verificada: anúncios novos passam pela aprovação do NovoSeminovo antes de aparecer na busca. Depois da verificação, entram no ar direto.",
      );
    }

    return { report, outcomes };
  }

  private async quotaFor(partnerId: string): Promise<{ max: number; used: number } | undefined> {
    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId } });
    const limit = partner ? await listingLimitFor(this.prisma, partner) : undefined;
    if (!limit) return undefined;
    const used = await this.prisma.listing.count({
      where: { partnerId, status: { in: [...LISTING_STATUSES_COUNTED_IN_PLAN_QUOTA] } },
    });
    return { max: limit.max, used };
  }

  private async createListing(partner: IntegrationPartner, input: IntegrationListingInput, hash: string, source: string) {
    const { externalId, photos, ...listingInput } = input;
    const ownerUserId = partner.ownerUserId;
    const { detailsData, linkedVehicleId } = await this.listings.prepareDetails(ownerUserId, listingInput);

    // Loja verificada já passou pela checagem do NovoSeminovo — o estoque
    // dela entra no ar direto (moderar centenas de anúncios de CRM um a um
    // inviabilizaria a integração). Loja não verificada passa pela fila.
    const status = partner.verified ? "active" : "pending_review";
    const listing = await this.prisma.listing.create({
      data: {
        type: listingInput.assetType,
        ownerUserId,
        partnerId: partner.id,
        title: listingInput.title,
        description: listingInput.description,
        price: listingInput.price,
        city: listingInput.city,
        state: listingInput.state,
        neighborhood: listingInput.neighborhood,
        status,
        tierRank: 1,
        publishedAt: status === "active" ? new Date() : undefined,
        externalSource: source,
        externalId,
        externalHash: hash,
        ...detailsData,
        photos: photos?.length
          ? { create: photos.map((url, index) => ({ url, position: index, isCover: index === 0 })) }
          : undefined,
      },
      select: { id: true, status: true, title: true },
    });

    if (linkedVehicleId) await this.vehicles.logListingPublished(linkedVehicleId, ownerUserId, listing.title);
    return listing;
  }

  private async updateListing(listingId: string, input: IntegrationListingInput, currentPhotos: string[]) {
    const { externalId: _externalId, photos, ...listingInput } = input;
    const core = {
      title: listingInput.title,
      description: listingInput.description,
      price: listingInput.price,
      city: listingInput.city,
      state: listingInput.state,
      neighborhood: listingInput.neighborhood ?? null,
    };

    let details: Prisma.ListingUpdateInput;
    if (listingInput.assetType === "vehicle") {
      const brandModel = await this.vehicles.resolveBrandAndModel(listingInput.brand, listingInput.model);
      const fields = {
        version: listingInput.version ?? null,
        yearManufacture: listingInput.yearManufacture,
        yearModel: listingInput.yearModel,
        mileage: listingInput.mileage,
        transmission: listingInput.transmission,
        fuelType: listingInput.fuelType,
        color: listingInput.color,
        doors: listingInput.doors ?? null,
      };
      details = { vehicleDetails: { update: { ...brandModel, ...fields } } };
    } else {
      details = {
        propertyDetails: {
          update: {
            propertyType: listingInput.propertyType,
            purpose: listingInput.purpose,
            bedrooms: listingInput.bedrooms ?? null,
            suites: listingInput.suites ?? null,
            bathrooms: listingInput.bathrooms ?? null,
            parkingSpots: listingInput.parkingSpots ?? null,
            floor: listingInput.floor ?? null,
            areaM2: listingInput.areaM2,
            totalAreaM2: listingInput.totalAreaM2 ?? null,
            condoFee: listingInput.condoFee ?? null,
            iptu: listingInput.iptu ?? null,
            features: listingInput.features ?? [],
            streetAddress: listingInput.streetAddress,
          },
        },
      };
    }

    // Fotos só são trocadas quando o CRM mandou alguma e a lista mudou —
    // CRM sem foto nenhuma não apaga as que o parceiro subiu à mão aqui.
    const photosChanged = photos?.length && JSON.stringify(photos) !== JSON.stringify(currentPhotos);
    await this.prisma.$transaction([
      this.prisma.listing.update({ where: { id: listingId }, data: { ...core, ...details } }),
      ...(photosChanged
        ? [
            this.prisma.photo.deleteMany({ where: { listingId } }),
            this.prisma.photo.createMany({
              data: photos!.map((url, index) => ({ listingId, url, position: index, isCover: index === 0 })),
            }),
          ]
        : []),
    ]);
  }

  // ---------- Feeds ----------

  private async partnerForOwner(userId: string): Promise<IntegrationPartner> {
    const partner = await this.prisma.partner.findFirst({
      where: { OR: [{ ownerUserId: userId }, { members: { some: { userId } } }] },
      select: { id: true, ownerUserId: true, verifiedAt: true, type: true },
    });
    if (!partner) throw new NotFoundException("Você ainda não tem uma loja/imobiliária cadastrada.");
    // Mesmo critério de "Equipe": integrar mexe no estoque inteiro, então é
    // coisa do dono.
    if (partner.ownerUserId !== userId) throw new ForbiddenException("Só o dono da loja/imobiliária pode configurar integrações.");
    return { id: partner.id, ownerUserId: partner.ownerUserId, verified: Boolean(partner.verifiedAt), type: partner.type };
  }

  private toFeed(row: FeedRow, listingsCount: number): IntegrationFeed {
    return {
      id: row.id,
      url: row.url,
      format: row.format,
      active: row.active,
      lastSyncAt: row.lastSyncAt?.toISOString(),
      lastStatus: row.lastStatus,
      lastError: row.lastError ?? undefined,
      lastReport: (row.lastReport as IntegrationSyncReport | null) ?? undefined,
      listingsCount,
    };
  }

  async overview(userId: string): Promise<IntegrationOverview> {
    const partner = await this.partnerForOwner(userId);
    const [feeds, keys, importedListings, counts] = await Promise.all([
      this.prisma.integrationFeed.findMany({ where: { partnerId: partner.id }, orderBy: { createdAt: "asc" } }),
      this.prisma.partnerApiKey.findMany({ where: { partnerId: partner.id, revokedAt: null }, orderBy: { createdAt: "asc" } }),
      this.prisma.listing.count({ where: { partnerId: partner.id, externalId: { not: null }, status: { not: "sold" } } }),
      this.prisma.listing.groupBy({
        by: ["externalSource"],
        where: { partnerId: partner.id, externalSource: { startsWith: "feed:" }, status: { in: ["active", "pending_review"] } },
        _count: true,
      }),
    ]);
    const countBySource = new Map(counts.map((row) => [row.externalSource, row._count]));
    return {
      feeds: feeds.map((feed) => this.toFeed(feed, countBySource.get(`feed:${feed.id}`) ?? 0)),
      apiKeys: keys.map((key) => this.toKey(key)),
      importedListings,
      syncIntervalMinutes: syncIntervalMinutes(),
    };
  }

  async createFeed(userId: string, input: CreateIntegrationFeedInput): Promise<IntegrationFeed> {
    const partner = await this.partnerForOwner(userId);
    try {
      assertPublicHttpUrl(input.url);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Link inválido.");
    }
    const count = await this.prisma.integrationFeed.count({ where: { partnerId: partner.id } });
    if (count >= MAX_FEEDS_PER_PARTNER) throw new ConflictException(`Máximo de ${MAX_FEEDS_PER_PARTNER} feeds por loja.`);
    const duplicate = await this.prisma.integrationFeed.findFirst({ where: { partnerId: partner.id, url: input.url } });
    if (duplicate) throw new ConflictException("Esse link já está cadastrado.");

    const feed = await this.prisma.integrationFeed.create({
      data: { partnerId: partner.id, url: input.url, format: input.format },
    });
    // Primeira sincronização já começa — o painel mostra o andamento.
    return this.toFeed(await this.startSync(feed.id), 0);
  }

  async deleteFeed(userId: string, feedId: string): Promise<void> {
    const partner = await this.partnerForOwner(userId);
    const feed = await this.prisma.integrationFeed.findUnique({ where: { id: feedId } });
    if (!feed || feed.partnerId !== partner.id) throw new NotFoundException("Feed não encontrado.");
    // Os anúncios já importados ficam (agora sem origem automática) — o
    // parceiro decide no Estoque o que fazer com eles.
    await this.prisma.$transaction([
      this.prisma.listing.updateMany({ where: { partnerId: partner.id, externalSource: `feed:${feed.id}` }, data: { externalSource: null } }),
      this.prisma.integrationFeed.delete({ where: { id: feed.id } }),
    ]);
  }

  async requestSync(userId: string, feedId: string): Promise<IntegrationFeed> {
    const partner = await this.partnerForOwner(userId);
    const feed = await this.prisma.integrationFeed.findUnique({ where: { id: feedId } });
    if (!feed || feed.partnerId !== partner.id) throw new NotFoundException("Feed não encontrado.");
    if (feed.lastSyncAt && Date.now() - feed.lastSyncAt.getTime() < MANUAL_SYNC_COOLDOWN_MS) {
      throw new HttpException("Acabou de sincronizar. Espere 2 minutos para sincronizar de novo.", HttpStatus.TOO_MANY_REQUESTS);
    }
    const synced = await this.startSync(feed.id);
    const listingsCount = await this.prisma.listing.count({
      where: { partnerId: partner.id, externalSource: `feed:${feed.id}`, status: { in: ["active", "pending_review"] } },
    });
    return this.toFeed(synced, listingsCount);
  }

  // Catálogo de veículo muitas vezes traz o endereço só da loja (ou nenhum)
  // em vez de um por carro — cai pra cidade onde a loja já anuncia.
  private async defaultLocation(partnerId: string): Promise<{ city?: string; state?: string }> {
    const recent = await this.prisma.listing.findFirst({
      where: { partnerId },
      orderBy: { createdAt: "desc" },
      select: { city: true, state: true },
    });
    return recent ?? {};
  }

  // Exposto pra teste (troca o download por um conteúdo fixo).
  async downloadFeed(url: string): Promise<string> {
    const result = await safeFetch(url, { maxBytes: FEED_MAX_BYTES, timeoutMs: FEED_TIMEOUT_MS, accept: "application/xml, text/xml, application/json, */*" });
    return result.buffer.toString("utf8");
  }

  async syncFeed(feedId: string): Promise<FeedRow> {
    return this.runSync(await this.beginSync(feedId));
  }

  // Painel: marca "sincronizando" e devolve na hora — a importação em si
  // (centenas de anúncios, FIPE por veículo novo) continua em segundo plano
  // e o painel mostra o resultado quando a pessoa atualizar a página.
  private async startSync(feedId: string): Promise<FeedRow> {
    const feed = await this.beginSync(feedId);
    void this.runSync(feed).catch((error) => this.logger.error(`Feed ${feedId}: ${error}`));
    return this.prisma.integrationFeed.findUniqueOrThrow({ where: { id: feedId } });
  }

  private async beginSync(feedId: string) {
    const feed = await this.prisma.integrationFeed.findUnique({
      where: { id: feedId },
      include: { partner: { select: { id: true, ownerUserId: true, verifiedAt: true, type: true } } },
    });
    if (!feed) throw new NotFoundException("Feed não encontrado.");
    if (this.runningFeeds.has(feed.id)) {
      throw new ConflictException("Esse feed já está sincronizando agora. Aguarde terminar.");
    }
    if (feed.lastStatus === "running" && feed.lastSyncAt && Date.now() - feed.lastSyncAt.getTime() < STALE_RUNNING_MS) {
      throw new ConflictException("Esse feed já está sincronizando agora. Aguarde terminar.");
    }
    this.runningFeeds.add(feed.id);
    await this.prisma.integrationFeed.update({ where: { id: feed.id }, data: { lastStatus: "running", lastSyncAt: new Date() } });
    return feed;
  }

  private async runSync(feed: Awaited<ReturnType<IntegrationsService["beginSync"]>>): Promise<FeedRow> {
    const startedAt = Date.now();
    try {
      const raw = await this.downloadFeed(feed.url);
      const items =
        feed.format === "vrsync"
          ? parseVrsync(raw)
          : feed.format === "meta_vehicles"
            ? parseVehicleCatalog(raw, await this.defaultLocation(feed.partner.id))
            : parseNovoSeminovoJson(raw);
      const { report } = await this.applyItems(
        { id: feed.partner.id, ownerUserId: feed.partner.ownerUserId, verified: Boolean(feed.partner.verifiedAt), type: feed.partner.type },
        items,
        `feed:${feed.id}`,
        { fullSync: true },
      );
      report.durationMs = Date.now() - startedAt;
      this.logger.log(
        `Feed ${feed.id}: ${report.total} itens, +${report.created} ~${report.updated} =${report.unchanged} ⏸${report.paused} ✗${report.errors.length} em ${report.durationMs}ms`,
      );
      return await this.prisma.integrationFeed.update({
        where: { id: feed.id },
        data: {
          lastStatus: "ok",
          lastError: null,
          lastSyncAt: new Date(),
          lastReport: trimReport(report) as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      const known = error instanceof SafeFetchError || error instanceof FeedFormatError;
      if (!known) this.logger.error(`Feed ${feed.id}: ${error}`);
      return await this.prisma.integrationFeed.update({
        where: { id: feed.id },
        data: {
          lastStatus: "error",
          lastError: known ? (error as Error).message : "Erro inesperado ao sincronizar. Tente de novo mais tarde.",
          lastSyncAt: new Date(),
        },
      });
    } finally {
      this.runningFeeds.delete(feed.id);
    }
  }

  // ---------- Chaves da API ----------

  private toKey(row: { id: string; name: string; prefix: string; lastUsedAt: Date | null; createdAt: Date }): PartnerApiKey {
    return {
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      lastUsedAt: row.lastUsedAt?.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }

  async createApiKey(userId: string, name: string): Promise<CreatedPartnerApiKey> {
    const partner = await this.partnerForOwner(userId);
    const active = await this.prisma.partnerApiKey.count({ where: { partnerId: partner.id, revokedAt: null } });
    if (active >= MAX_KEYS_PER_PARTNER) throw new ConflictException(`Máximo de ${MAX_KEYS_PER_PARTNER} chaves ativas. Revogue uma antes.`);

    const key = `nsk_${randomBytes(24).toString("base64url")}`;
    const row = await this.prisma.partnerApiKey.create({
      data: { partnerId: partner.id, name, prefix: key.slice(0, 12), keyHash: hashKey(key), createdByUserId: userId },
    });
    return { ...this.toKey(row), key };
  }

  async revokeApiKey(userId: string, keyId: string): Promise<void> {
    const partner = await this.partnerForOwner(userId);
    const key = await this.prisma.partnerApiKey.findUnique({ where: { id: keyId } });
    if (!key || key.partnerId !== partner.id) throw new NotFoundException("Chave não encontrada.");
    await this.prisma.partnerApiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
  }

  async authenticateApiKey(key: string): Promise<IntegrationPartner | undefined> {
    if (!key.startsWith("nsk_")) return undefined;
    const row = await this.prisma.partnerApiKey.findUnique({
      where: { keyHash: hashKey(key) },
      include: { partner: { select: { id: true, ownerUserId: true, verifiedAt: true, type: true } } },
    });
    if (!row || row.revokedAt) return undefined;

    const now = Date.now();
    const recent = (this.apiHits.get(row.id) ?? []).filter((time) => now - time < API_RATE_LIMIT.windowMs);
    if (recent.length >= API_RATE_LIMIT.max) {
      throw new HttpException("Limite de 300 requisições por minuto atingido. Use o envio em lote.", HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    this.apiHits.set(row.id, recent);

    // "Último uso" no painel não precisa de precisão de segundo — grava no
    // máximo a cada 5 minutos pra não escrever no banco a cada requisição.
    if (!row.lastUsedAt || now - row.lastUsedAt.getTime() > 5 * 60 * 1000) {
      await this.prisma.partnerApiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    }
    return { id: row.partner.id, ownerUserId: row.partner.ownerUserId, verified: Boolean(row.partner.verifiedAt), type: row.partner.type };
  }

  // ---------- Operações da API (push) ----------

  async apiUpsert(partner: IntegrationPartner, items: unknown[]): Promise<{ results: ItemOutcome[] }> {
    const parsed: ParsedFeedItem[] = items.map((item, index) => ({
      ok: true,
      externalId:
        item && typeof item === "object" && typeof (item as { externalId?: unknown }).externalId === "string"
          ? (item as { externalId: string }).externalId
          : `item-${index + 1}`,
      input: item,
    }));
    const { outcomes } = await this.applyItems(partner, parsed, "api", { fullSync: false });
    return { results: outcomes };
  }

  private async findExternal(partner: IntegrationPartner, externalId: string) {
    const listing = await this.prisma.listing.findFirst({ where: { partnerId: partner.id, externalId } });
    if (!listing) throw new NotFoundException(`Anúncio com externalId "${externalId}" não encontrado.`);
    return listing;
  }

  async apiRemove(partner: IntegrationPartner, externalId: string): Promise<ItemOutcome> {
    const listing = await this.findExternal(partner, externalId);
    if (listing.status === "sold" || listing.status === "rejected") {
      return { externalId, action: "skipped", listingId: listing.id, status: listing.status };
    }
    await this.prisma.listing.update({ where: { id: listing.id }, data: { status: "paused", syncPaused: true } });
    return { externalId, action: "updated", listingId: listing.id, status: "paused" };
  }

  async apiMarkSold(partner: IntegrationPartner, externalId: string, soldPrice?: number): Promise<ItemOutcome> {
    const listing = await this.findExternal(partner, externalId);
    if (listing.status === "sold") return { externalId, action: "unchanged", listingId: listing.id, status: "sold" };
    // Pausado pela sincronização também pode ser marcado vendido (é comum o
    // CRM tirar do feed justamente porque vendeu).
    const updated = await this.listings.updateStatus(listing.id, listing.ownerUserId, { status: "sold", soldPrice });
    return { externalId, action: "updated", listingId: listing.id, status: updated.status };
  }

  async apiList(partner: IntegrationPartner) {
    const listings = await this.prisma.listing.findMany({
      where: { partnerId: partner.id, externalId: { not: null } },
      select: { id: true, externalId: true, status: true, title: true, price: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 5000,
    });
    const site = process.env.WEB_ORIGIN ?? "https://novoseminovo.com.br";
    return {
      total: listings.length,
      listings: listings.map((listing) => ({
        externalId: listing.externalId,
        listingId: listing.id,
        status: listing.status,
        title: listing.title,
        price: Number(listing.price),
        url: `${site}/anuncio/${listing.id}`,
        updatedAt: listing.updatedAt.toISOString(),
      })),
    };
  }
}

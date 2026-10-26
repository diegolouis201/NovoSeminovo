import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  ModerateListingInput,
  ModerationLogEntry,
  PendingListing,
  PendingPartner,
  PartnerType,
  PendingReport,
  ReportStatus,
} from "@novoseminovo/shared-types";
import { formatBRL } from "@novoseminovo/shared-types";
import type { AdminListingActionInput, AdminListingRow, AdminListingsPage } from "@novoseminovo/shared-types";
import type { Prisma } from "@novoseminovo/db";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { SavedSearchesService } from "../saved-searches/saved-searches.service";

function location(listing: { city: string; state: string; neighborhood: string | null }): string {
  return listing.neighborhood
    ? `${listing.neighborhood}, ${listing.city} - ${listing.state}`
    : `${listing.city} - ${listing.state}`;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly savedSearches: SavedSearchesService,
  ) {}

  async listPendingListings(): Promise<PendingListing[]> {
    const listings = await this.prisma.listing.findMany({
      where: { status: "pending_review" },
      include: { owner: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });

    return listings.map((listing) => ({
      id: listing.id,
      assetType: listing.type,
      title: listing.title,
      priceLabel: formatBRL(Number(listing.price)),
      location: location(listing),
      ownerName: listing.owner.name,
      ownerEmail: listing.owner.email,
      createdAt: listing.createdAt.toISOString(),
      autoReviewNote: listing.autoReviewNote ?? undefined,
    }));
  }

  // Todos os anúncios de todos os usuários (/admin/anuncios), por tipo de bem,
  // vendedor (PF = sem loja, PJ = de loja/imobiliária/corretor), situação e busca.
  async listAllListings(filters: {
    assetType: "vehicle" | "property";
    sellerType?: "pf" | "pj";
    status?: string;
    search?: string;
    page: number;
  }): Promise<AdminListingsPage> {
    const pageSize = 30;
    const search = filters.search?.trim();
    const where: Prisma.ListingWhereInput = {
      type: filters.assetType,
      ...(filters.sellerType === "pf" ? { partnerId: null } : filters.sellerType === "pj" ? { partnerId: { not: null } } : {}),
      ...(filters.status ? { status: filters.status as Prisma.ListingWhereInput["status"] } : {}),
      ...(search
        ? {
            OR: [
              { id: search },
              { title: { contains: search, mode: "insensitive" } },
              { city: { contains: search, mode: "insensitive" } },
              { owner: { name: { contains: search, mode: "insensitive" } } },
              { owner: { email: { contains: search, mode: "insensitive" } } },
              { partner: { legalName: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const [rows, total, grouped] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * pageSize,
        take: pageSize,
        include: {
          owner: { select: { name: true, email: true } },
          partner: { select: { legalName: true } },
          photos: { orderBy: [{ isCover: "desc" }, { position: "asc" }], take: 1, select: { url: true } },
          _count: { select: { photos: true, conversations: true } },
        },
      }),
      this.prisma.listing.count({ where }),
      this.prisma.listing.groupBy({ by: ["type", "status", "partnerId"], _count: { _all: true } }),
    ]);
    const counts = new Map<string, AdminListingsPage["counts"][number]>();
    for (const row of grouped) {
      const sellerType = row.partnerId ? "pj" : "pf";
      const key = `${row.type}|${sellerType}|${row.status}`;
      const current = counts.get(key) ?? { assetType: row.type, sellerType, status: row.status, count: 0 };
      current.count += row._count._all;
      counts.set(key, current);
    }
    const now = Date.now();
    const items: AdminListingRow[] = rows.map((listing) => ({
      id: listing.id,
      assetType: listing.type,
      title: listing.title,
      priceLabel: formatBRL(Number(listing.price)),
      location: location(listing),
      status: listing.status,
      photoUrl: listing.photos[0]?.url,
      photos: listing._count.photos,
      views: listing.viewsCount,
      leads: listing._count.conversations,
      ownerName: listing.owner.name,
      ownerEmail: listing.owner.email,
      sellerType: listing.partnerId ? "pj" : "pf",
      partnerName: listing.partner?.legalName,
      highlighted: Boolean(listing.highlightedUntil && listing.highlightedUntil.getTime() > now),
      createdAt: listing.createdAt.toISOString(),
      publishedAt: listing.publishedAt?.toISOString(),
    }));
    return { items, total, page: filters.page, pageSize, counts: [...counts.values()] };
  }

  // Suspender (sai do ar, dono avisado com o motivo) ou reativar um anúncio. Fica no histórico de moderação.
  async listingAction(adminId: string, listingId: string, input: AdminListingActionInput): Promise<{ status: string }> {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException("Anúncio não encontrado");
    if (input.action === "suspend") {
      if (listing.status !== "active") throw new ConflictException("Só dá para suspender anúncio que está no ar.");
      if (!input.reason) throw new ConflictException("Informe o motivo: ele vai para o dono do anúncio.");
      await this.prisma.$transaction([
        this.prisma.listing.update({ where: { id: listingId }, data: { status: "paused" } }),
        this.prisma.moderationLog.create({ data: { listingId, adminId, action: "suspended", reason: input.reason } }),
      ]);
      await this.notifications.notify(listing.ownerUserId, "listing_suspended", { listingId, listingTitle: listing.title, reason: input.reason });
      return { status: "paused" };
    }
    if (!["paused", "rejected", "expired"].includes(listing.status)) throw new ConflictException("Este anúncio não está pausado, recusado ou expirado.");
    await this.prisma.$transaction([
      this.prisma.listing.update({ where: { id: listingId }, data: { status: "active", publishedAt: listing.publishedAt ?? new Date() } }),
      this.prisma.moderationLog.create({ data: { listingId, adminId, action: "reactivated", reason: input.reason } }),
    ]);
    await this.notifications.notify(listing.ownerUserId, "listing_approved", { listingId, listingTitle: listing.title });
    return { status: "active" };
  }

  async moderateListing(adminId: string, listingId: string, input: ModerateListingInput): Promise<void> {
    await this.applyModeration(listingId, input.action, input.reason, adminId);
  }

  // Aprovação/recusa de anúncio em análise — usada pelo admin e pela
  // moderação automática (adminId vazio = decisão da IA, ver AutoModerationService).
  async applyModeration(listingId: string, action: "approve" | "reject", reason: string | undefined, adminId?: string): Promise<void> {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException(`Anúncio ${listingId} não encontrado`);
    if (listing.status !== "pending_review") {
      throw new ConflictException("Este anúncio não está mais aguardando moderação.");
    }

    const nextStatus = action === "approve" ? "active" : "rejected";

    await this.prisma.$transaction([
      this.prisma.listing.update({
        where: { id: listingId },
        data: {
          status: nextStatus,
          publishedAt: action === "approve" ? new Date() : listing.publishedAt,
          ...(adminId ? {} : { autoReviewedAt: new Date(), autoReviewNote: null }),
        },
      }),
      this.prisma.moderationLog.create({
        data: {
          listingId,
          adminId: adminId ?? null,
          automated: !adminId,
          action: action === "approve" ? "approved" : "rejected",
          reason,
        },
      }),
    ]);

    await this.notifications.notify(
      listing.ownerUserId,
      nextStatus === "active" ? "listing_approved" : "listing_rejected",
      { listingId: listing.id, listingTitle: listing.title, reason },
    );

    if (nextStatus === "active") {
      await this.savedSearches.notifyMatches(listing.id);
    }
  }

  async listPendingPartners(): Promise<PendingPartner[]> {
    const partners = await this.prisma.partner.findMany({
      where: { verifiedAt: null },
      include: { owner: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });

    return partners.map((partner) => ({
      id: partner.id,
      type: partner.type,
      legalName: partner.legalName,
      document: partner.document,
      ownerName: partner.owner.name,
      ownerEmail: partner.owner.email,
      createdAt: partner.createdAt.toISOString(),
    }));
  }

  async verifyPartner(partnerId: string): Promise<void> {
    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId } });
    if (!partner) throw new NotFoundException(`Loja/imobiliária ${partnerId} não encontrada`);

    await this.prisma.partner.update({ where: { id: partnerId }, data: { verifiedAt: new Date() } });

    await this.notifications.notify(partner.ownerUserId, "partner_verified", {
      partnerId: partner.id,
      partnerName: partner.legalName,
    });
  }

  // A classificação automática pelo CNPJ às vezes erra (ex.: fábrica de
  // esquadrias entrando como corretor) — o admin corrige aqui.
  async setPartnerType(partnerId: string, type: PartnerType): Promise<void> {
    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId } });
    if (!partner) throw new NotFoundException(`Loja/imobiliária ${partnerId} não encontrada`);
    await this.prisma.partner.update({ where: { id: partnerId }, data: { type } });
  }

  async listOpenReports(): Promise<PendingReport[]> {
    const reports = await this.prisma.report.findMany({
      where: { status: "open" },
      include: { listing: { select: { title: true } }, reporter: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });

    return reports.map((report) => ({
      id: report.id,
      listingId: report.listingId,
      listingTitle: report.listing.title,
      reporterName: report.reporter.name,
      reporterEmail: report.reporter.email,
      reason: report.reason,
      createdAt: report.createdAt.toISOString(),
    }));
  }

  async updateReportStatus(reportId: string, status: ReportStatus): Promise<void> {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException(`Denúncia ${reportId} não encontrada`);

    await this.prisma.report.update({ where: { id: reportId }, data: { status } });
  }

  async listModerationLog(): Promise<ModerationLogEntry[]> {
    const entries = await this.prisma.moderationLog.findMany({
      include: { listing: { select: { title: true } }, admin: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return entries.map((entry) => ({
      id: entry.id,
      listingId: entry.listingId,
      listingTitle: entry.listing.title,
      adminName: entry.admin?.name ?? "Moderação automática (IA)",
      automated: entry.automated,
      action: entry.action,
      reason: entry.reason ?? undefined,
      createdAt: entry.createdAt.toISOString(),
    }));
  }
}

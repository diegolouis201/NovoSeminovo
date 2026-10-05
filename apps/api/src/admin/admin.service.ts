import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  ModerateListingInput,
  ModerationLogEntry,
  PendingListing,
  PendingPartner,
  PendingReport,
  ReportStatus,
} from "@novoseminovo/shared-types";
import { formatBRL } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";

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
    }));
  }

  async moderateListing(adminId: string, listingId: string, input: ModerateListingInput): Promise<void> {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException(`Anúncio ${listingId} não encontrado`);
    if (listing.status !== "pending_review") {
      throw new ConflictException("Este anúncio não está mais aguardando moderação.");
    }

    const nextStatus = input.action === "approve" ? "active" : "rejected";

    await this.prisma.$transaction([
      this.prisma.listing.update({
        where: { id: listingId },
        data: {
          status: nextStatus,
          publishedAt: input.action === "approve" ? new Date() : listing.publishedAt,
        },
      }),
      this.prisma.moderationLog.create({
        data: {
          listingId,
          adminId,
          action: input.action === "approve" ? "approved" : "rejected",
          reason: input.reason,
        },
      }),
    ]);

    await this.notifications.notify(
      listing.ownerUserId,
      nextStatus === "active" ? "listing_approved" : "listing_rejected",
      { listingId: listing.id, listingTitle: listing.title, reason: input.reason },
    );
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
      adminName: entry.admin.name,
      action: entry.action,
      reason: entry.reason ?? undefined,
      createdAt: entry.createdAt.toISOString(),
    }));
  }
}

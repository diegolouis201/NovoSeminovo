import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { ModerateListingInput, PendingListing, PendingPartner } from "@novoseminovo/shared-types";
import { formatBRL } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";

function location(listing: { city: string; state: string; neighborhood: string | null }): string {
  return listing.neighborhood
    ? `${listing.neighborhood}, ${listing.city} - ${listing.state}`
    : `${listing.city} - ${listing.state}`;
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

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
  }
}

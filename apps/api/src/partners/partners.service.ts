import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreatePartnerInput,
  LeadStatus,
  LeadSummary,
  Partner,
  PartnerStorefront,
} from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { listingInclude, toListingSummary } from "../listings/listings.mapper";

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

@Injectable()
export class PartnersService {
  constructor(private readonly prisma: PrismaService) {}

  private async uniqueSlug(base: string): Promise<string> {
    const root = slugify(base) || "loja";
    let slug = root;
    let attempt = 1;
    while (await this.prisma.partner.findUnique({ where: { slug } })) {
      attempt += 1;
      slug = `${root}-${attempt}`;
    }
    return slug;
  }

  async create(ownerUserId: string, input: CreatePartnerInput): Promise<Partner> {
    const existing = await this.prisma.partner.findFirst({ where: { ownerUserId } });
    if (existing) throw new ConflictException("Você já tem uma loja/imobiliária cadastrada.");

    const slug = await this.uniqueSlug(input.legalName);

    await this.prisma.$transaction([
      this.prisma.partner.create({
        data: {
          ownerUserId,
          type: input.type,
          legalName: input.legalName,
          document: input.document,
          description: input.description,
          address: input.address,
          slug,
        },
      }),
      this.prisma.user.update({ where: { id: ownerUserId }, data: { role: "partner_owner" } }),
    ]);

    const partner = await this.getMine(ownerUserId);
    if (!partner) throw new Error("Falha inesperada ao criar a loja/imobiliária.");
    return partner;
  }

  async getMine(ownerUserId: string): Promise<Partner | null> {
    const partner = await this.prisma.partner.findFirst({ where: { ownerUserId } });
    if (!partner) return null;

    const [activeListings, totalListings, leadsByStatus, subscription] = await Promise.all([
      this.prisma.listing.count({ where: { partnerId: partner.id, status: "active" } }),
      this.prisma.listing.count({ where: { partnerId: partner.id } }),
      this.prisma.lead.groupBy({ by: ["status"], where: { partnerId: partner.id }, _count: true }),
      this.prisma.subscription.findFirst({
        where: { partnerId: partner.id, status: "active" },
        include: { plan: true },
        orderBy: { currentPeriodEnd: "desc" },
      }),
    ]);

    const countByStatus = (status: LeadStatus) =>
      leadsByStatus.find((row) => row.status === status)?._count ?? 0;

    return {
      id: partner.id,
      type: partner.type,
      legalName: partner.legalName,
      slug: partner.slug,
      description: partner.description ?? undefined,
      address: partner.address ?? undefined,
      verified: Boolean(partner.verifiedAt),
      planName: subscription?.plan.name,
      stats: {
        activeListings,
        totalListings,
        leadsTotal: leadsByStatus.reduce((sum, row) => sum + row._count, 0),
        leadsNew: countByStatus("new"),
        leadsNegotiating: countByStatus("negotiating"),
        leadsWon: countByStatus("won"),
      },
    };
  }

  async getStorefront(slug: string): Promise<PartnerStorefront> {
    const partner = await this.prisma.partner.findUnique({ where: { slug } });
    if (!partner) throw new NotFoundException(`Loja "${slug}" não encontrada`);

    const listings = await this.prisma.listing.findMany({
      where: { partnerId: partner.id, status: "active" },
      include: listingInclude,
      orderBy: [{ highlightedUntil: "desc" }, { publishedAt: "desc" }],
    });

    return {
      legalName: partner.legalName,
      type: partner.type,
      description: partner.description ?? undefined,
      address: partner.address ?? undefined,
      verified: Boolean(partner.verifiedAt),
      listings: listings.map(toListingSummary),
    };
  }

  async listLeads(ownerUserId: string): Promise<LeadSummary[]> {
    const partner = await this.prisma.partner.findFirst({ where: { ownerUserId } });
    if (!partner) throw new NotFoundException("Você ainda não tem uma loja/imobiliária cadastrada.");

    const leads = await this.prisma.lead.findMany({
      where: { partnerId: partner.id },
      include: { listing: { select: { title: true } }, buyer: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });

    return leads.map((lead) => ({
      id: lead.id,
      listingId: lead.listingId,
      listingTitle: lead.listing.title,
      buyerName: lead.buyer?.name ?? "Contato anônimo",
      buyerEmail: lead.buyer?.email ?? "—",
      source: lead.source,
      status: lead.status,
      createdAt: lead.createdAt.toISOString(),
    }));
  }

  async updateLeadStatus(ownerUserId: string, leadId: string, status: LeadStatus): Promise<LeadSummary> {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        partner: true,
        listing: { select: { title: true } },
        buyer: { select: { name: true, email: true } },
      },
    });
    if (!lead) throw new NotFoundException(`Lead ${leadId} não encontrado`);
    if (lead.partner.ownerUserId !== ownerUserId) {
      throw new ForbiddenException("Este lead não pertence à sua loja/imobiliária.");
    }

    const updated = await this.prisma.lead.update({ where: { id: leadId }, data: { status } });

    return {
      id: updated.id,
      listingId: lead.listingId,
      listingTitle: lead.listing.title,
      buyerName: lead.buyer?.name ?? "Contato anônimo",
      buyerEmail: lead.buyer?.email ?? "—",
      source: updated.source,
      status: updated.status,
      createdAt: updated.createdAt.toISOString(),
    };
  }
}

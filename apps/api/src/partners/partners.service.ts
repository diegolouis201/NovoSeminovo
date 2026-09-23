import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreatePartnerInput,
  LeadStatus,
  LeadSummary,
  Partner,
  PartnerMember,
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

  // Dono ou membro da equipe (ver PartnerMember) — os dois operam o mesmo
  // painel (anúncios, leads); só "Equipe" fica restrita ao dono (ver
  // addMember/removeMember).
  private async findPartnerForUser(userId: string) {
    return this.prisma.partner.findFirst({
      where: { OR: [{ ownerUserId: userId }, { members: { some: { userId } } }] },
    });
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

  async getMine(userId: string): Promise<Partner | null> {
    const partner = await this.findPartnerForUser(userId);
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
      isOwner: partner.ownerUserId === userId,
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

    const [listings, reviews] = await Promise.all([
      this.prisma.listing.findMany({
        where: { partnerId: partner.id, status: "active" },
        include: listingInclude,
        orderBy: [{ highlightedUntil: "desc" }, { publishedAt: "desc" }],
      }),
      this.prisma.review.findMany({
        where: { reviewedPartnerId: partner.id },
        include: { reviewer: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    const averageRating = reviews.length
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : undefined;

    return {
      legalName: partner.legalName,
      type: partner.type,
      description: partner.description ?? undefined,
      address: partner.address ?? undefined,
      verified: Boolean(partner.verifiedAt),
      listings: listings.map(toListingSummary),
      averageRating,
      reviews: reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment ?? undefined,
        reviewerName: review.reviewer.name,
        createdAt: review.createdAt.toISOString(),
      })),
    };
  }

  async listLeads(userId: string): Promise<LeadSummary[]> {
    const partner = await this.findPartnerForUser(userId);
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

  async updateLeadStatus(userId: string, leadId: string, status: LeadStatus): Promise<LeadSummary> {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        listing: { select: { title: true } },
        buyer: { select: { name: true, email: true } },
      },
    });
    if (!lead) throw new NotFoundException(`Lead ${leadId} não encontrado`);

    const partner = await this.findPartnerForUser(userId);
    if (!partner || lead.partnerId !== partner.id) {
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

  async listMembers(userId: string): Promise<PartnerMember[]> {
    const partner = await this.prisma.partner.findFirst({
      where: { OR: [{ ownerUserId: userId }, { members: { some: { userId } } }] },
      include: { owner: true, members: { include: { user: true } } },
    });
    if (!partner) throw new NotFoundException("Você ainda não tem uma loja/imobiliária cadastrada.");

    return [
      { id: partner.owner.id, name: partner.owner.name, email: partner.owner.email, role: "owner" as const },
      ...partner.members.map((member) => ({
        id: member.id,
        name: member.user.name,
        email: member.user.email,
        role: "agent" as const,
      })),
    ];
  }

  // Convite direto (ver comentário em AddPartnerMemberInputSchema): só o
  // dono convida, nunca um agente — evita uma corrente de convites sem
  // controle. A pessoa convidada precisa já ter conta na plataforma.
  async addMember(ownerUserId: string, email: string): Promise<PartnerMember> {
    const partner = await this.prisma.partner.findFirst({ where: { ownerUserId } });
    if (!partner) throw new NotFoundException("Você ainda não tem uma loja/imobiliária cadastrada.");

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new BadRequestException("Essa pessoa ainda não tem conta no NovoSeminovo — peça pra ela se cadastrar primeiro.");
    }
    if (user.id === ownerUserId) {
      throw new ConflictException("Você já é o dono desta loja/imobiliária.");
    }

    const existing = await this.prisma.partnerMember.findUnique({
      where: { partnerId_userId: { partnerId: partner.id, userId: user.id } },
    });
    if (existing) throw new ConflictException("Esta pessoa já faz parte da sua equipe.");

    const member = await this.prisma.partnerMember.create({
      data: { partnerId: partner.id, userId: user.id, role: "agent" },
    });
    return { id: member.id, name: user.name, email: user.email, role: "agent" };
  }

  async removeMember(ownerUserId: string, memberId: string): Promise<void> {
    const partner = await this.prisma.partner.findFirst({ where: { ownerUserId } });
    if (!partner) throw new NotFoundException("Você ainda não tem uma loja/imobiliária cadastrada.");

    const member = await this.prisma.partnerMember.findUnique({ where: { id: memberId } });
    if (!member || member.partnerId !== partner.id) {
      throw new NotFoundException(`Membro ${memberId} não encontrado`);
    }

    await this.prisma.partnerMember.delete({ where: { id: memberId } });
  }
}

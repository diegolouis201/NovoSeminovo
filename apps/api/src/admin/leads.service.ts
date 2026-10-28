import { Injectable } from "@nestjs/common";
import type { Prisma } from "@novoseminovo/db";
import { LeadSource, LeadStatus, type AdminLeadRow, type AdminLeadsPage } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { conversationsForLeads } from "../conversations/access";

const PAGE_SIZE = 50;

export type AdminLeadFilters = {
  days?: number;
  status?: string;
  source?: string;
  assetType?: "vehicle" | "property";
  search?: string;
  page: number;
};

// Todos os leads do site (chat, WhatsApp e os cadastrados à mão pelas lojas):
// quando chegou, de quem, para qual loja/imobiliária e em que etapa está.
@Injectable()
export class AdminLeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: AdminLeadFilters): Promise<AdminLeadsPage> {
    const search = filters.search?.trim();
    const base: Prisma.LeadWhereInput = {
      ...(filters.days ? { createdAt: { gte: new Date(Date.now() - filters.days * 86_400_000) } } : {}),
      ...(LeadSource.safeParse(filters.source).success ? { source: filters.source as AdminLeadRow["source"] } : {}),
      ...(filters.assetType ? { listing: { type: filters.assetType } } : {}),
      ...(search
        ? {
            OR: [
              { partner: { legalName: { contains: search, mode: "insensitive" } } },
              { buyer: { name: { contains: search, mode: "insensitive" } } },
              { buyer: { email: { contains: search, mode: "insensitive" } } },
              { contactName: { contains: search, mode: "insensitive" } },
              { listing: { title: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const status = LeadStatus.safeParse(filters.status);
    const where: Prisma.LeadWhereInput = status.success ? { ...base, status: status.data } : base;

    const [rows, total, grouped, waitingOver24h] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          buyer: { select: { name: true, email: true, phone: true } },
          listing: { select: { title: true, type: true } },
          partner: { select: { legalName: true, ownerUserId: true } },
        },
      }),
      this.prisma.lead.count({ where }),
      this.prisma.lead.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
      this.prisma.lead.count({ where: { ...base, status: "new", createdAt: { ...(base.createdAt as object), lt: new Date(Date.now() - 86_400_000) } } }),
    ]);

    const funnel = Object.fromEntries(LeadStatus.options.map((key) => [key, 0])) as AdminLeadsPage["funnel"];
    for (const row of grouped) funnel[row.status] = row._count._all;

    const conversations = await conversationsForLeads(this.prisma, rows);
    const now = Date.now();
    const items: AdminLeadRow[] = rows.map((lead) => ({
      id: lead.id,
      createdAt: lead.createdAt.toISOString(),
      statusChangedAt: lead.statusChangedAt.toISOString(),
      daysInStage: Math.max(0, Math.floor((now - lead.statusChangedAt.getTime()) / 86_400_000)),
      status: lead.status,
      source: lead.source,
      buyerName: lead.buyer?.name ?? lead.contactName ?? "Contato anônimo",
      buyerEmail: lead.contactEmail ?? lead.buyer?.email ?? undefined,
      buyerPhone: lead.contactPhone ?? lead.buyer?.phone ?? undefined,
      buyerUserId: lead.buyerId ?? undefined,
      listingId: lead.listingId ?? undefined,
      listingTitle: lead.listing?.title,
      assetType: lead.listing?.type,
      partnerName: lead.partner.legalName,
      partnerOwnerUserId: lead.partner.ownerUserId,
      proposalValue: lead.proposalValue != null ? Number(lead.proposalValue) : undefined,
      hasConversation: conversations.has(`${lead.listingId}:${lead.buyerId}`),
      acqSource: lead.acqSource ?? undefined,
    }));
    return { items, total, page: filters.page, pageSize: PAGE_SIZE, funnel, waitingOver24h };
  }
}

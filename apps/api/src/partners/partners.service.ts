import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { PARTNER_TRIAL_DAYS, PLAN_REQUIRED_PARTNER_TYPES, formatBRL } from "@novoseminovo/shared-types";
import type {
  CreateLeadInput,
  UpdateLeadInput,
  UpdateSaleInput,
  CreatePartnerInput,
  SubscriptionBoardCard,
  FeaturedPartner,
  LeadStatus,
  LeadSummary,
  Partner,
  PartnerMember,
  PartnerStorefront,
  Plan,
  SaleSummary,
} from "@novoseminovo/shared-types";
import type { Prisma } from "@novoseminovo/db";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentsService } from "../payments/payments.service";
import { listingInclude, toListingSummary } from "../listings/listings.mapper";
import { AiService } from "../listings/ai.service";
import { getPhotoStorage } from "../common/storage";
import { NotificationsService } from "../notifications/notifications.service";

// Quantas vagas de anúncio um plano "ocupa": tudo que não é um estado final
// (vendido/recusado/expirado) conta contra o limite, porque senão dava pra
// furar o limite só deixando um monte de anúncio pausado ou em análise.
export const LISTING_STATUSES_COUNTED_IN_PLAN_QUOTA = ["active", "pending_review", "paused"] as const;

// Assinatura "valendo": ativa ou com a renovação atrasada (o Stripe ainda
// está tentando cobrar — a loja não perde o plano de um dia pro outro por um
// cartão recusado). Só "canceled" tira o plano.
export const SUBSCRIPTION_STATUSES_IN_EFFECT = ["active", "past_due"] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export function requiresPlan(type: string): boolean {
  return (PLAN_REQUIRED_PARTNER_TYPES as readonly string[]).includes(type);
}

export function trialEndsAt(partner: { createdAt: Date }): Date {
  return new Date(partner.createdAt.getTime() + PARTNER_TRIAL_DAYS * DAY_MS);
}

export type ListingLimit = { max: number; planName?: string; trialOver?: boolean };

// Limite de anúncios que vale agora pra loja (ver PLAN_REQUIRED_PARTNER_TYPES
// no shared-types): sem limite no período grátis ou pra quem não precisa de
// plano (undefined); depois, o do plano em vigor; sem plano, zero — a loja
// sai do ar até assinar.
export async function listingLimitFor(
  prisma: PrismaService,
  partner: { id: string; type: string; createdAt: Date },
): Promise<ListingLimit | undefined> {
  if (!requiresPlan(partner.type)) return undefined;
  if (trialEndsAt(partner) > new Date()) return undefined;
  const subscription = await prisma.subscription.findFirst({
    where: { partnerId: partner.id, status: { in: [...SUBSCRIPTION_STATUSES_IN_EFFECT] } },
    include: { plan: true },
    orderBy: { currentPeriodEnd: "desc" },
  });
  if (subscription) return { max: subscription.plan.maxActiveListings, planName: subscription.plan.name };
  return { max: 0, trialOver: true };
}

export function listingLimitMessage(limit: ListingLimit): string {
  return limit.planName
    ? `Seu plano atual (${limit.planName}) permite até ${limit.max} anúncios. Marque como vendido os que já saíram, ou contrate um plano com mais limite em /parceiro/plano.`
    : `O período grátis de ${PARTNER_TRIAL_DAYS / 30} meses da sua loja terminou. Contrate um plano em /parceiro/plano para anunciar — seus anúncios ficam guardados e voltam ao ar na hora.`;
}

// Status do Stripe → status nosso. incomplete/unpaid contam como atrasado;
// paused (pausa de cobrança) e os finais como cancelado.
function fromStripeStatus(status: string): "active" | "past_due" | "canceled" {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due" || status === "unpaid" || status === "incomplete") return "past_due";
  return "canceled";
}

function toPlan(plan: {
  id: string;
  name: string;
  maxActiveListings: number;
  highlightCredits: number;
  priceMonth: unknown;
  audience: string | null;
}): Plan {
  return {
    id: plan.id,
    name: plan.name,
    maxActiveListings: plan.maxActiveListings,
    highlightCredits: plan.highlightCredits,
    priceLabel: formatBRL(Number(plan.priceMonth)),
    audience: plan.audience === "vehicle" || plan.audience === "property" ? plan.audience : undefined,
  };
}

// Planos de loja de veículos (decisão do Diego, out/2026) — o código é a fonte
// da verdade: ensurePlanCatalog cria o que falta e atualiza preço/limites ao
// subir a API. Preço mudou → stripePriceId zera e o Stripe ganha um preço
// novo no próximo checkout (quem já assinou continua no preço antigo lá).
// "Enterprise" (mais de 100) é conversa no WhatsApp, não plano no sistema.
const VEHICLE_PLAN_CATALOG = [
  { name: "Inicial", priceMonth: 149, maxActiveListings: 30, highlightCredits: 5 },
  { name: "Profissional", priceMonth: 249, maxActiveListings: 60, highlightCredits: 10 },
  { name: "Loja Grande", priceMonth: 349, maxActiveListings: 100, highlightCredits: 20 },
];

// Tipo de parceiro → público dos planos (ver PARTNER_ALLOWED_ASSET_TYPES).
export function planAudienceFor(partnerType: string): "vehicle" | "property" {
  return partnerType === "real_estate_agency" || partnerType === "broker" ? "property" : "vehicle";
}

const leadInclude = {
  listing: { select: { title: true } },
  buyer: { select: { name: true, email: true, phone: true } },
} satisfies Prisma.LeadInclude;

type LeadRow = Prisma.LeadGetPayload<{ include: typeof leadInclude }>;

function toLeadSummary(lead: LeadRow): LeadSummary {
  return {
    id: lead.id,
    listingId: lead.listingId ?? undefined,
    listingTitle: lead.listing?.title,
    buyerName: lead.buyer?.name ?? lead.contactName ?? "Contato anônimo",
    buyerEmail: lead.buyer?.email ?? "—",
    buyerPhone: lead.buyer?.phone ?? lead.contactPhone ?? undefined,
    source: lead.source,
    status: lead.status,
    notes: lead.notes ?? undefined,
    proposalValue: lead.proposalValue != null ? Number(lead.proposalValue) : undefined,
    statusChangedAt: lead.statusChangedAt.toISOString(),
    createdAt: lead.createdAt.toISOString(),
  };
}

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

@Injectable()
export class PartnersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PartnersService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly ai: AiService,
    private readonly notifications: NotificationsService,
  ) {}

  // Fim do período grátis não tem evento nenhum — confere a cada 6 horas (e
  // 1 minuto depois de subir) quem precisa de aviso ou de sair do ar.
  onModuleInit(): void {
    void this.ensurePlanCatalog().catch((error) => this.logger.error(`Falha ao conferir o catálogo de planos: ${error}`));
    if (process.env.TRIAL_SWEEP_DISABLED === "1") return;
    const run = () => void this.trialSweep().catch((error) => this.logger.error(`Falha na checagem do período grátis: ${error}`));
    setTimeout(run, 60 * 1000).unref();
    this.timer = setInterval(run, 6 * 60 * 60 * 1000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async trialSweep(): Promise<{ warned: number; paused: number }> {
    const now = Date.now();
    const trialStartedBefore = (daysLeft: number) => new Date(now - (PARTNER_TRIAL_DAYS - daysLeft) * DAY_MS);
    const noPlan = { subscriptions: { none: { status: { in: [...SUBSCRIPTION_STATUSES_IN_EFFECT] } } } };
    let warned = 0;
    let paused = 0;

    // Aviso 7 dias antes, uma vez só.
    const ending = await this.prisma.partner.findMany({
      where: {
        type: { in: [...PLAN_REQUIRED_PARTNER_TYPES] },
        createdAt: { lte: trialStartedBefore(7), gt: trialStartedBefore(0) },
        trialWarningSentAt: null,
        ...noPlan,
      },
    });
    for (const partner of ending) {
      await this.notifications.notify(partner.ownerUserId, "partner_trial_ending", {
        partnerName: partner.legalName,
        endsAtLabel: trialEndsAt(partner).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      });
      await this.prisma.partner.update({ where: { id: partner.id }, data: { trialWarningSentAt: new Date() } });
      warned += 1;
    }

    // Período grátis acabou: sem plano, tudo que estiver no ar sai (inclusive
    // anúncio aprovado na moderação depois disso); com plano, só o que passar
    // do limite dele (pauseListingsOverLimit não mexe em quem está dentro).
    const expired = await this.prisma.partner.findMany({
      where: {
        type: { in: [...PLAN_REQUIRED_PARTNER_TYPES] },
        createdAt: { lte: trialStartedBefore(0) },
        listings: { some: { status: "active" } },
      },
      select: { id: true },
    });
    for (const partner of expired) paused += await this.pauseListingsOverLimit(partner.id);

    if (warned || paused) this.logger.log(`Período grátis: ${warned} aviso(s), ${paused} anúncio(s) pausado(s)`);
    return { warned, paused };
  }

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

  // Logo da loja/imobiliária (ver FeaturedPartners/vitrine pública, que já
  // sabiam exibir logoUrl — só faltava um jeito do parceiro definir o dele.
  // Reaproveita o mesmo PhotoStorage dos anúncios (disco local ou S3/R2).
  async uploadLogo(userId: string, file: { buffer: Buffer; originalname: string; mimetype: string }): Promise<Partner> {
    const partner = await this.findPartnerForUser(userId);
    if (!partner) throw new NotFoundException("Você ainda não tem uma loja/imobiliária cadastrada.");

    const storage = getPhotoStorage();
    const url = await storage.save(file.buffer, file.originalname, file.mimetype);

    if (partner.logoUrl) await storage.remove(partner.logoUrl);
    await this.prisma.partner.update({ where: { id: partner.id }, data: { logoUrl: url } });

    const updated = await this.getMine(userId);
    if (!updated) throw new Error("Falha inesperada ao salvar a logo.");
    return updated;
  }

  async getMine(userId: string): Promise<Partner | null> {
    const partner = await this.findPartnerForUser(userId);
    if (!partner) return null;

    // Mês corrente no fuso do servidor — suficiente pro MVP do painel
    // (ver README "Próximos passos" sobre timezone por usuário).
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [activeListings, totalListings, leadsByStatus, subscription, soldTotal, soldThisMonthAgg, allSoldAgg] =
      await Promise.all([
        this.prisma.listing.count({ where: { partnerId: partner.id, status: "active" } }),
        this.prisma.listing.count({ where: { partnerId: partner.id } }),
        this.prisma.lead.groupBy({ by: ["status"], where: { partnerId: partner.id }, _count: true }),
        this.prisma.subscription.findFirst({
          where: { partnerId: partner.id, status: { in: [...SUBSCRIPTION_STATUSES_IN_EFFECT] } },
          include: { plan: true },
          orderBy: { currentPeriodEnd: "desc" },
        }),
        this.prisma.listing.count({ where: { partnerId: partner.id, status: "sold" } }),
        this.prisma.listing.aggregate({
          where: { partnerId: partner.id, status: "sold", soldAt: { gte: monthStart } },
          _count: true,
          _sum: { soldPrice: true },
        }),
        this.prisma.listing.aggregate({
          where: { partnerId: partner.id, status: "sold" },
          _avg: { soldPrice: true },
        }),
      ]);

    const countByStatus = (status: LeadStatus) =>
      leadsByStatus.find((row) => row.status === status)?._count ?? 0;
    const leadsTotal = leadsByStatus.reduce((sum, row) => sum + row._count, 0);
    const leadsWon = countByStatus("won");

    return {
      id: partner.id,
      type: partner.type,
      legalName: partner.legalName,
      slug: partner.slug,
      description: partner.description ?? undefined,
      address: partner.address ?? undefined,
      logoUrl: partner.logoUrl ?? undefined,
      verified: Boolean(partner.verifiedAt),
      subscription: subscription
        ? {
            planId: subscription.plan.id,
            planName: subscription.plan.name,
            priceLabel: formatBRL(Number(subscription.plan.priceMonth)),
            maxActiveListings: subscription.plan.maxActiveListings,
            highlightCredits: subscription.plan.highlightCredits,
            currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
            status: subscription.status === "past_due" ? "past_due" : "active",
          }
        : undefined,
      isOwner: partner.ownerUserId === userId,
      ...(requiresPlan(partner.type)
        ? {
            trialEndsAt: trialEndsAt(partner).toISOString(),
            offline: (await listingLimitFor(this.prisma, partner))?.max === 0,
          }
        : {}),
      stats: {
        activeListings,
        totalListings,
        leadsTotal,
        leadsNew: countByStatus("new"),
        leadsNegotiating: countByStatus("negotiating"),
        leadsWon,
        soldTotal,
        soldThisMonth: soldThisMonthAgg._count,
        revenueThisMonthLabel: formatBRL(Number(soldThisMonthAgg._sum.soldPrice ?? 0)),
        conversionRatePercent: leadsTotal > 0 ? Math.round((leadsWon / leadsTotal) * 1000) / 10 : undefined,
        averageTicketLabel:
          allSoldAgg._avg.soldPrice != null ? formatBRL(Number(allSoldAgg._avg.soldPrice)) : undefined,
      },
    };
  }

  // "Lojas parceiras em destaque" na home — só quem tem o selo de
  // verificado E pelo menos um anúncio ativo (loja verificada mas sem
  // vitrine nenhuma não ajuda ninguém a decidir clicar). "/carros" e
  // "/imoveis" passam forAssetType pra só mostrar loja do ramo certo —
  // "dealership" vende carro, "real_estate_agency"/"broker" vende imóvel.
  async listFeatured(forAssetType?: "vehicle" | "property", limit = 8): Promise<FeaturedPartner[]> {
    const partners = await this.prisma.partner.findMany({
      where: {
        verifiedAt: { not: null },
        listings: { some: { status: "active" } },
        ...(forAssetType === "vehicle" ? { type: "dealership" } : {}),
        ...(forAssetType === "property" ? { type: { in: ["real_estate_agency", "broker"] } } : {}),
      },
      orderBy: { listings: { _count: "desc" } },
      take: limit,
      select: { slug: true, legalName: true, logoUrl: true },
    });

    return partners.map((partner) => ({
      slug: partner.slug,
      legalName: partner.legalName,
      logoUrl: partner.logoUrl ?? undefined,
    }));
  }

  async getStorefront(slug: string): Promise<PartnerStorefront> {
    const partner = await this.prisma.partner.findUnique({ where: { slug } });
    if (!partner) throw new NotFoundException(`Loja "${slug}" não encontrada`);
    // Fim do período grátis sem plano: a vitrine sai do ar junto com os anúncios.
    if ((await listingLimitFor(this.prisma, partner))?.max === 0) {
      throw new NotFoundException(`Loja "${slug}" não encontrada`);
    }

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

    const listingSummaries = listings.map(toListingSummary);
    const highlights = await this.ai.curateStorefrontHighlights(
      partner.legalName,
      listingSummaries.map((l) => ({ id: l.id, title: l.title, subtitle: l.subtitle, priceLabel: l.priceLabel })),
    );

    return {
      legalName: partner.legalName,
      type: partner.type,
      description: partner.description ?? undefined,
      address: partner.address ?? undefined,
      logoUrl: partner.logoUrl ?? undefined,
      verified: Boolean(partner.verifiedAt),
      listings: listingSummaries,
      highlights,
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

  // /parceiro/vendas — histórico de anúncios vendidos (ver ListingsService.
  // updateStatus, que grava soldAt/soldPrice na transição pra "sold").
  async listSales(userId: string): Promise<SaleSummary[]> {
    const partner = await this.findPartnerForUser(userId);
    if (!partner) throw new NotFoundException("Você ainda não tem uma loja/imobiliária cadastrada.");

    const sales = await this.prisma.listing.findMany({
      where: { partnerId: partner.id, status: "sold" },
      select: { id: true, title: true, type: true, price: true, soldPrice: true, costPrice: true, soldAt: true, publishedAt: true },
      orderBy: { soldAt: "desc" },
    });

    return sales.map((sale) => ({
      listingId: sale.id,
      title: sale.title,
      assetType: sale.type,
      askingPriceLabel: formatBRL(Number(sale.price)),
      soldPriceValue: Number(sale.soldPrice ?? sale.price),
      soldPriceLabel: formatBRL(Number(sale.soldPrice ?? sale.price)),
      soldAt: (sale.soldAt ?? sale.publishedAt ?? new Date()).toISOString(),
      daysOnMarket:
        sale.publishedAt && sale.soldAt
          ? Math.max(0, Math.round((sale.soldAt.getTime() - sale.publishedAt.getTime()) / 86_400_000))
          : undefined,
      costPriceValue: sale.costPrice != null ? Number(sale.costPrice) : undefined,
      profitValue: sale.costPrice != null ? Number(sale.soldPrice ?? sale.price) - Number(sale.costPrice) : undefined,
    }));
  }

  async listLeads(userId: string): Promise<LeadSummary[]> {
    const partner = await this.findPartnerForUser(userId);
    if (!partner) throw new NotFoundException("Você ainda não tem uma loja/imobiliária cadastrada.");

    const leads = await this.prisma.lead.findMany({
      where: { partnerId: partner.id },
      include: leadInclude,
      orderBy: { createdAt: "desc" },
    });
    return leads.map(toLeadSummary);
  }

  private async leadForPartner(userId: string, leadId: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException(`Lead ${leadId} não encontrado`);
    const partner = await this.findPartnerForUser(userId);
    if (!partner || lead.partnerId !== partner.id) {
      throw new ForbiddenException("Este lead não pertence à sua loja/imobiliária.");
    }
    return lead;
  }

  async updateLeadStatus(userId: string, leadId: string, status: LeadStatus): Promise<LeadSummary> {
    return this.updateLead(userId, leadId, { status });
  }

  // Kanban de leads (/parceiro/leads): mover de etapa, anotar, valor da proposta.
  async updateLead(userId: string, leadId: string, input: UpdateLeadInput): Promise<LeadSummary> {
    const lead = await this.leadForPartner(userId, leadId);
    const updated = await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        ...(input.status && input.status !== lead.status ? { status: input.status, statusChangedAt: new Date() } : {}),
        ...(input.notes !== undefined ? { notes: input.notes.trim() || null } : {}),
        ...(input.proposalValue !== undefined ? { proposalValue: input.proposalValue } : {}),
      },
      include: leadInclude,
    });
    return toLeadSummary(updated);
  }

  // Lead cadastrado à mão (cliente que ligou, foi à loja, indicação…).
  async createLead(userId: string, input: CreateLeadInput): Promise<LeadSummary> {
    const partner = await this.findPartnerForUser(userId);
    if (!partner) throw new NotFoundException("Você ainda não tem uma loja/imobiliária cadastrada.");
    if (input.listingId) {
      const listing = await this.prisma.listing.findUnique({ where: { id: input.listingId } });
      if (!listing || listing.partnerId !== partner.id) throw new BadRequestException("Esse anúncio não é do seu estoque.");
    }
    const lead = await this.prisma.lead.create({
      data: {
        partnerId: partner.id,
        listingId: input.listingId || undefined,
        source: input.source,
        status: "new",
        contactName: input.contactName.trim(),
        contactPhone: input.contactPhone?.replace(/\D/g, "") || undefined,
        notes: input.notes?.trim() || undefined,
      },
      include: leadInclude,
    });
    return toLeadSummary(lead);
  }

  // Ajuste de venda já registrada (/parceiro/vendas): valor final e custo.
  async updateSale(userId: string, listingId: string, input: UpdateSaleInput): Promise<void> {
    const partner = await this.findPartnerForUser(userId);
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!partner || !listing || listing.partnerId !== partner.id) throw new NotFoundException("Venda não encontrada.");
    if (listing.status !== "sold") throw new BadRequestException("Este anúncio ainda não foi marcado como vendido.");
    await this.prisma.listing.update({
      where: { id: listingId },
      data: {
        ...(input.soldPrice !== undefined ? { soldPrice: input.soldPrice } : {}),
        ...(input.costPrice !== undefined ? { costPrice: input.costPrice } : {}),
      },
    });
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

  async listPlans(audience?: "vehicle" | "property"): Promise<Plan[]> {
    const plans = await this.prisma.plan.findMany({
      where: { active: true, ...(audience ? { audience } : {}) },
      orderBy: { priceMonth: "asc" },
    });
    return plans.map(toPlan);
  }

  async ensurePlanCatalog(): Promise<void> {
    // Planos antigos (Básico/Profissional de antes) ficam pras imobiliárias
    // até o Diego definir os delas.
    await this.prisma.plan.updateMany({ where: { audience: null }, data: { audience: "property" } });
    for (const item of VEHICLE_PLAN_CATALOG) {
      const existing = await this.prisma.plan.findFirst({ where: { audience: "vehicle", name: item.name } });
      if (!existing) {
        await this.prisma.plan.create({ data: { ...item, audience: "vehicle" } });
        continue;
      }
      const priceChanged = Number(existing.priceMonth) !== item.priceMonth;
      if (priceChanged || existing.maxActiveListings !== item.maxActiveListings || existing.highlightCredits !== item.highlightCredits || !existing.active) {
        await this.prisma.plan.update({
          where: { id: existing.id },
          data: { ...item, active: true, ...(priceChanged ? { stripePriceId: null } : {}) },
        });
      }
    }
  }

  // Cancela qualquer assinatura ativa da loja e cria a nova já ativa —
  // usado tanto pela simulação (subscribe, sem paymentProviderRef) quanto
  // pela confirmação de um checkout de verdade (com o id da Subscription
  // no Stripe, pra cancelSubscription saber o que cancelar lá também).
  // Chamado por dois caminhos independentes pro mesmo checkout (ver
  // confirmCheckoutSession e activateSubscriptionFromWebhook) — sem essa
  // checagem, uma confirmação síncrona seguida do webhook (ou vice-versa,
  // em qualquer ordem) duplicava a linha de Subscription pra mesma
  // assinatura do Stripe, mesmo o resultado final (status active) ficando
  // certo de qualquer jeito.
  //
  // Troca de plano (ex.: Básico → Profissional) é um checkout novo, ou seja,
  // uma assinatura nova no Stripe — a anterior é cancelada lá também, senão
  // a loja continuaria pagando os dois planos todo mês.
  private async activateSubscription(partnerId: string, planId: string, paymentProviderRef?: string): Promise<void> {
    if (paymentProviderRef) {
      const alreadyInEffect = await this.prisma.subscription.findFirst({
        where: { partnerId, paymentProviderRef, status: { in: [...SUBSCRIPTION_STATUSES_IN_EFFECT] } },
      });
      if (alreadyInEffect) return;
    }

    const now = new Date();
    const currentPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const previous = await this.prisma.subscription.findMany({
      where: { partnerId, status: { in: [...SUBSCRIPTION_STATUSES_IN_EFFECT] } },
    });

    await this.prisma.$transaction([
      this.prisma.subscription.updateMany({
        where: { partnerId, status: { in: [...SUBSCRIPTION_STATUSES_IN_EFFECT] } },
        data: { status: "canceled", statusChangedAt: now },
      }),
      this.prisma.subscription.create({
        data: { partnerId, planId, status: "active", currentPeriodStart: now, currentPeriodEnd, paymentProviderRef },
      }),
    ]);

    for (const old of previous) {
      if (old.paymentProviderRef && old.paymentProviderRef !== paymentProviderRef) {
        await this.payments.cancelStripeSubscription(old.paymentProviderRef);
      }
    }
    // Troca pra um plano menor (ex.: Profissional → Básico) pausa o excesso;
    // assinatura nova ou plano maior devolve o que estava pausado por plano.
    await this.pauseListingsOverLimit(partnerId);
    await this.restoreListingsPausedByPlan(partnerId);
  }

  // Quando o limite diminui (fim do período grátis, plano cancelado ou
  // trocado por um menor), os anúncios no ar que passam do limite são
  // pausados — nunca apagados — e marcados com pausedByPlan pra voltarem
  // sozinhos quando a loja assinar (ver restoreListingsPausedByPlan). Ficam
  // no ar os mais recentes.
  async pauseListingsOverLimit(partnerId: string): Promise<number> {
    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId } });
    if (!partner) return 0;
    const limit = await listingLimitFor(this.prisma, partner);
    if (!limit) return 0;
    const pending = await this.prisma.listing.count({ where: { partnerId, status: "pending_review" } });
    const active = await this.prisma.listing.findMany({
      where: { partnerId, status: "active" },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true },
    });
    const keep = limit.max === 0 ? 0 : Math.max(0, limit.max - pending);
    const toPause = active.slice(keep).map((listing) => listing.id);
    if (toPause.length === 0) return 0;

    await this.prisma.listing.updateMany({ where: { id: { in: toPause } }, data: { status: "paused", pausedByPlan: true } });
    if (limit.trialOver) {
      await this.notifications.notify(partner.ownerUserId, "partner_offline", {
        partnerName: partner.legalName,
        count: toPause.length,
      });
    }
    return toPause.length;
  }

  // Assinou (ou trocou pra um plano maior): volta ao ar o que o sistema
  // pausou por falta de plano, os mais recentes primeiro, até o limite novo.
  // O que o próprio dono pausou continua pausado.
  async restoreListingsPausedByPlan(partnerId: string): Promise<number> {
    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId } });
    if (!partner) return 0;
    const limit = await listingLimitFor(this.prisma, partner);
    const candidates = await this.prisma.listing.findMany({
      where: { partnerId, status: "paused", pausedByPlan: true },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true },
    });
    const live = await this.prisma.listing.count({ where: { partnerId, status: { in: ["active", "pending_review"] } } });
    const room = limit ? Math.max(0, limit.max - live) : candidates.length;
    const toRestore = candidates.slice(0, room).map((listing) => listing.id);
    if (toRestore.length > 0) {
      await this.prisma.listing.updateMany({ where: { id: { in: toRestore } }, data: { status: "active", pausedByPlan: false } });
    }
    return toRestore.length;
  }

  // "Contratar" só o dono decide (mesma regra de Equipe). Sem Stripe
  // configurado (ver PaymentsService.isEnabled), é uma simulação: ativa a
  // assinatura na hora, sem falar com gateway de pagamento nenhum (ver
  // comentário em PartnerSubscriptionSchema) — com Stripe configurado, o
  // controller chama createCheckoutSession em vez deste método.
  async subscribe(ownerUserId: string, planId: string): Promise<Partner> {
    const partner = await this.prisma.partner.findFirst({ where: { ownerUserId } });
    if (!partner) throw new NotFoundException("Você ainda não tem uma loja/imobiliária cadastrada.");

    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException(`Plano ${planId} não encontrado`);
    if (plan.audience && plan.audience !== planAudienceFor(partner.type)) {
      throw new BadRequestException("Esse plano não é para o seu tipo de conta.");
    }

    await this.activateSubscription(partner.id, planId);

    const result = await this.getMine(ownerUserId);
    if (!result) throw new Error("Falha inesperada ao contratar o plano.");
    return result;
  }

  async createCheckoutSession(ownerUserId: string, planId: string, successUrl: string, cancelUrl: string): Promise<string> {
    const partner = await this.prisma.partner.findFirst({ where: { ownerUserId } });
    if (!partner) throw new NotFoundException("Você ainda não tem uma loja/imobiliária cadastrada.");

    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException(`Plano ${planId} não encontrado`);
    if (plan.audience && plan.audience !== planAudienceFor(partner.type)) {
      throw new BadRequestException("Esse plano não é para o seu tipo de conta.");
    }

    const owner = await this.prisma.user.findUnique({ where: { id: partner.ownerUserId }, select: { email: true } });
    return this.payments.createCheckoutSession(partner, plan, successUrl, cancelUrl, owner?.email);
  }

  // Chamado quando a pessoa volta do Checkout do Stripe — confirma direto na
  // API do Stripe (não confia só no redirecionamento do navegador) antes de
  // ativar a assinatura. O webhook (ver WebhooksController) faz a mesma
  // ativação de forma independente, pro caso de a pessoa fechar a aba antes
  // de voltar.
  async confirmCheckoutSession(ownerUserId: string, sessionId: string): Promise<Partner> {
    const partner = await this.prisma.partner.findFirst({ where: { ownerUserId } });
    if (!partner) throw new NotFoundException("Você ainda não tem uma loja/imobiliária cadastrada.");

    const confirmed = await this.payments.confirmCheckoutSession(sessionId);
    if (!confirmed || confirmed.metadata.partnerId !== partner.id) {
      throw new BadRequestException("Checkout não encontrado ou ainda não confirmado pelo Stripe.");
    }

    await this.activateSubscription(partner.id, confirmed.metadata.planId, confirmed.stripeSubscriptionId);

    const result = await this.getMine(ownerUserId);
    if (!result) throw new Error("Falha inesperada ao confirmar o plano.");
    return result;
  }

  async cancelSubscription(ownerUserId: string): Promise<Partner> {
    const partner = await this.prisma.partner.findFirst({ where: { ownerUserId } });
    if (!partner) throw new NotFoundException("Você ainda não tem uma loja/imobiliária cadastrada.");

    const inEffect = await this.prisma.subscription.findMany({
      where: { partnerId: partner.id, status: { in: [...SUBSCRIPTION_STATUSES_IN_EFFECT] } },
    });
    for (const subscription of inEffect) {
      if (subscription.paymentProviderRef) await this.payments.cancelStripeSubscription(subscription.paymentProviderRef);
    }

    await this.prisma.subscription.updateMany({
      where: { partnerId: partner.id, status: { in: [...SUBSCRIPTION_STATUSES_IN_EFFECT] } },
      data: { status: "canceled", statusChangedAt: new Date() },
    });
    await this.pauseListingsOverLimit(partner.id);

    const result = await this.getMine(ownerUserId);
    if (!result) throw new Error("Falha inesperada ao cancelar o plano.");
    return result;
  }

  // Usado pelo WebhooksController (checkout.session.completed) — mesma
  // ativação de confirmCheckoutSession, mas sem JWT: quem garante que é
  // legítimo é a assinatura do webhook, verificada antes de chegar aqui.
  async activateSubscriptionFromWebhook(partnerId: string, planId: string, stripeSubscriptionId: string): Promise<void> {
    await this.activateSubscription(partnerId, planId, stripeSubscriptionId);
  }

  // customer.subscription.updated/deleted: renovação paga, cartão recusado,
  // cancelamento pelo portal do Stripe ou por falta de pagamento depois das
  // novas tentativas. Uma assinatura já cancelada do nosso lado não volta a
  // valer por aqui (só por um checkout novo) — evita ressuscitar um plano
  // trocado por outro quando um evento antigo chega atrasado.
  async syncSubscriptionFromStripe(
    stripeSubscriptionId: string,
    stripeStatus: string,
    period?: { start: Date; end: Date },
  ): Promise<number> {
    const status = fromStripeStatus(stripeStatus);
    const rows = await this.prisma.subscription.findMany({
      where: { paymentProviderRef: stripeSubscriptionId, status: { in: [...SUBSCRIPTION_STATUSES_IN_EFFECT] } },
    });
    for (const row of rows) {
      await this.prisma.subscription.update({
        where: { id: row.id },
        data: {
          status,
          ...(status !== row.status ? { statusChangedAt: new Date() } : {}),
          ...(period ? { currentPeriodStart: period.start, currentPeriodEnd: period.end } : {}),
        },
      });
      if (status === "canceled") await this.pauseListingsOverLimit(row.partnerId);
    }
    return rows.length;
  }

  async createBillingPortalSession(ownerUserId: string, returnUrl: string): Promise<string> {
    const partner = await this.prisma.partner.findFirst({ where: { ownerUserId } });
    if (!partner) throw new NotFoundException("Você ainda não tem uma loja/imobiliária cadastrada.");
    if (!partner.stripeCustomerId) {
      throw new BadRequestException("Sua loja ainda não tem pagamento cadastrado no Stripe — contrate um plano primeiro.");
    }
    return this.payments.createBillingPortalSession(partner.stripeCustomerId, returnUrl);
  }

  // Quadro do admin: toda loja/imobiliária, com a assinatura que vale agora
  // (ou, se não tiver, a mais recente — pra mostrar quem cancelou).
  async subscriptionBoard(): Promise<SubscriptionBoardCard[]> {
    const [partners, usage] = await Promise.all([
      this.prisma.partner.findMany({
        include: {
          owner: { select: { name: true, email: true, phone: true } },
          subscriptions: { include: { plan: true }, orderBy: { currentPeriodStart: "desc" } },
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.listing.groupBy({
        by: ["partnerId"],
        where: { partnerId: { not: null }, status: { in: [...LISTING_STATUSES_COUNTED_IN_PLAN_QUOTA] } },
        _count: true,
      }),
    ]);

    return partners.map((partner) => {
      const current =
        partner.subscriptions.find((sub) => sub.status !== "canceled") ?? partner.subscriptions[0];
      const inEffect = current && current.status !== "canceled";
      const trialEnd = requiresPlan(partner.type) ? trialEndsAt(partner) : undefined;
      const inTrial = Boolean(trialEnd && trialEnd > new Date());
      return {
        partnerId: partner.id,
        legalName: partner.legalName,
        slug: partner.slug,
        type: partner.type,
        verified: Boolean(partner.verifiedAt),
        partnerCreatedAt: partner.createdAt.toISOString(),
        ownerName: partner.owner.name,
        ownerEmail: partner.owner.email,
        ownerPhone: partner.owner.phone ?? undefined,
        column: inEffect ? current.status : inTrial ? "trial" : current ? "canceled" : "none",
        planName: current?.plan.name,
        priceMonth: current ? Number(current.plan.priceMonth) : undefined,
        priceLabel: current ? formatBRL(Number(current.plan.priceMonth)) : undefined,
        startedAt: current?.currentPeriodStart.toISOString(),
        currentPeriodEnd: current?.currentPeriodEnd.toISOString(),
        statusChangedAt: current?.statusChangedAt.toISOString(),
        simulated: Boolean(current && !current.paymentProviderRef),
        trialEndsAt: trialEnd?.toISOString(),
        offline: Boolean(trialEnd && !inTrial && !inEffect),
        listingsUsed: usage.find((row) => row.partnerId === partner.id)?._count ?? 0,
        listingsLimit: inEffect && !inTrial ? current.plan.maxActiveListings : undefined,
        adminNotes: partner.adminNotes ?? undefined,
      };
    });
  }

  async updateAdminNotes(partnerId: string, adminNotes: string): Promise<void> {
    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId } });
    if (!partner) throw new NotFoundException("Loja/imobiliária não encontrada.");
    await this.prisma.partner.update({ where: { id: partnerId }, data: { adminNotes: adminNotes.trim() || null } });
  }
}

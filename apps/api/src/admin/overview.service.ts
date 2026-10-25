import { Injectable } from "@nestjs/common";
import type { Prisma } from "@novoseminovo/db";
import {
  ACQUISITION_SOURCES,
  type AdminOverview,
  type AdminOverviewCampaignRow,
  type AdminOverviewDay,
  type AdminOverviewOriginRow,
  type AdminOverviewRevenueMonth,
  type AdminOverviewScope,
  type AdminOverviewTrend,
  type StoreEarningInput,
} from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS_SHOWN = 6;

// Tipo de parceiro → lado do site (carros ou imóveis), pro recorte do painel.
const PARTNER_TYPES: Record<Exclude<AdminOverviewScope, "all">, ("dealership" | "workshop" | "real_estate_agency" | "broker" | "builder")[]> = {
  vehicle: ["dealership", "workshop"],
  property: ["real_estate_agency", "broker", "builder"],
};

// Leads que a loja cadastrou à mão no kanban não passam pelo site: a origem é
// o canal que ela marcou.
const MANUAL_LEAD_LABELS: Record<string, string> = {
  walk_in: "Loja: cliente foi até a loja",
  referral: "Loja: indicação",
  social: "Loja: redes sociais",
  phone: "Telefone",
  other: "Loja: outros",
};
const UNKNOWN = { key: "nao_identificado", label: "Não identificado (antes do rastreio)" };

type Range = { gte: Date; lt?: Date };

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function sum<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0);
}

// Painel de big numbers do admin: só contagens e somas (nada de dado pessoal),
// numa chamada. Volumes ainda são pequenos, então séries diárias, meses e
// origens agrupam em memória linhas enxutas em vez de SQL cru por tabela.
@Injectable()
export class AdminOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(scope: AdminOverviewScope): Promise<AdminOverview> {
    const db = this.prisma;
    const now = new Date();
    const since30 = new Date(now.getTime() - 30 * DAY_MS);
    const last30: Range = { gte: since30 };
    const prev30: Range = { gte: new Date(now.getTime() - 60 * DAY_MS), lt: since30 };
    const monthsStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (MONTHS_SHOWN - 1), 1));

    const type = scope === "all" ? undefined : scope;
    const listingWhere: Prisma.ListingWhereInput = type ? { type } : {};
    const partnerTypes = type ? PARTNER_TYPES[type] : undefined;
    const partnerWhere: Prisma.PartnerWhereInput = partnerTypes ? { type: { in: partnerTypes } } : {};
    // Lead sem anúncio (cadastrado à mão) cai no lado do tipo da loja.
    const leadWhere: Prisma.LeadWhereInput = type ? { OR: [{ listing: { type } }, { listingId: null, partner: partnerWhere }] } : {};
    const financingLeadWhere: Prisma.FinancingLeadWhereInput = type ? { assetType: type } : {};
    // Links de lojas só existem no Arquiteto (reforma de imóvel).
    const hasStores = scope !== "vehicle";

    const trend = async (count: (range: Range) => Promise<number>): Promise<AdminOverviewTrend> => {
      const [last30d, prev30d] = await Promise.all([count(last30), count(prev30)]);
      return { last30d, prev30d };
    };
    const money = (value: Prisma.Decimal | number | null | undefined) => Number(value ?? 0);
    const listingPlansIn = async (range: Range) =>
      money((await db.listingBoostPurchase.aggregate({ where: { status: "paid", paidAt: range, listing: listingWhere }, _sum: { amount: true } }))._sum.amount);
    const subscriptionsIn = async (range: Range) =>
      money(
        (await db.subscriptionPayment.aggregate({ where: { paidAt: range, ...(partnerTypes ? { partnerType: { in: partnerTypes } } : {}) }, _sum: { amount: true } }))._sum
          .amount,
      );
    // Receita de financiamento = comissão do banco menos o rebate repassado ao parceiro.
    const financingIn = async (range: Range) => {
      const result = await db.financingDeal.aggregate({ where: { createdAt: range, listing: listingWhere }, _sum: { commissionAmount: true, rebateAmount: true } });
      return money(result._sum.commissionAmount) - money(result._sum.rebateAmount);
    };
    const storesIn = async (range: Range) => {
      if (!hasStores) return 0;
      const months = await db.storeEarning.findMany({ select: { month: true, amount: true } });
      // Lançamento é mensal: entra no período o mês que começa dentro dele.
      return sum(
        months.filter((row) => {
          const start = new Date(`${row.month}-01T00:00:00Z`);
          return start >= range.gte && (!range.lt || start < range.lt);
        }),
        (row) => money(row.amount),
      );
    };

    const [
      usersTotal,
      newUsers,
      sellers,
      referred,
      listingGroups,
      activeByType,
      sold,
      soldValue,
      created,
      views,
      avgPrice,
      partnersTotal,
      partnersVerified,
      partnersByType,
      activeSubs,
      pastDue,
      listingPlans,
      listingPlansCount30d,
      subscriptions,
      financing,
      financingDeals30d,
      financingRebates30d,
      financingOpenLeads,
      stores,
      storeClicks30d,
      conversations,
      messages,
      favorites,
      leads,
      leadsWon30d,
      simulations,
      openReports,
      agentConversations,
      financingLeads,
      financingLeadsConverted,
      architectSessions,
      architectImages30d,
      autoModerated30d,
      affiliatesActive,
      affiliatesPending,
      commissionsOpen,
      commissionsPaid,
      dailyUsers,
      dailyListings,
      dailyLeads,
      dailyMessages,
      monthPlans,
      monthSubscriptions,
      monthDeals,
      storeEntries,
      originUsers,
      originLeads,
      originFinancing,
    ] = await Promise.all([
      db.user.count(),
      trend((range) => db.user.count({ where: { createdAt: range } })),
      db.user.count({ where: { listings: { some: listingWhere } } }),
      db.user.count({ where: { referredByAffiliateId: { not: null } } }),
      db.listing.groupBy({ by: ["status"], where: listingWhere, _count: { _all: true } }),
      db.listing.groupBy({ by: ["type"], where: { status: "active", ...listingWhere }, _count: { _all: true } }),
      trend((range) => db.listing.count({ where: { status: "sold", soldAt: range, ...listingWhere } })),
      db.listing.aggregate({ where: { status: "sold", soldAt: last30, ...listingWhere }, _sum: { soldPrice: true } }),
      trend((range) => db.listing.count({ where: { createdAt: range, ...listingWhere } })),
      db.listing.aggregate({ where: listingWhere, _sum: { viewsCount: true } }),
      db.listing.aggregate({ where: { status: "active", ...listingWhere }, _avg: { price: true } }),
      db.partner.count({ where: partnerWhere }),
      db.partner.count({ where: { verifiedAt: { not: null }, ...partnerWhere } }),
      db.partner.groupBy({ by: ["type"], where: partnerWhere, _count: { _all: true } }),
      // MRR conta só assinatura paga pelo Stripe (sem paymentProviderRef = ativada sem cobrança).
      db.subscription.findMany({
        where: { status: "active", paymentProviderRef: { not: null }, partner: partnerWhere },
        select: { plan: { select: { priceMonth: true } } },
      }),
      db.subscription.count({ where: { status: "past_due", partner: partnerWhere } }),
      trend(listingPlansIn),
      db.listingBoostPurchase.count({ where: { status: "paid", paidAt: last30, listing: listingWhere } }),
      trend(subscriptionsIn),
      trend(financingIn),
      db.financingDeal.count({ where: { createdAt: last30, listing: listingWhere } }),
      db.financingDeal.aggregate({ where: { createdAt: last30, listing: listingWhere }, _sum: { rebateAmount: true } }),
      db.financingLead.count({ where: { status: { notIn: ["converted", "lost"] }, ...financingLeadWhere } }),
      trend(storesIn),
      hasStores ? db.affiliateClick.count({ where: { createdAt: last30 } }) : Promise.resolve(0),
      trend((range) => db.conversation.count({ where: { createdAt: range, listing: listingWhere } })),
      trend((range) => db.message.count({ where: { createdAt: range, conversation: { listing: listingWhere } } })),
      db.favorite.count({ where: { listing: listingWhere } }),
      trend((range) => db.lead.count({ where: { createdAt: range, ...leadWhere } })),
      db.lead.count({ where: { status: "won", statusChangedAt: last30, ...leadWhere } }),
      trend((range) => db.financingSimulation.count({ where: { createdAt: range, listing: listingWhere } })),
      db.report.count({ where: { status: "open", listing: listingWhere } }),
      trend((range) => db.agentConversation.count({ where: { createdAt: range } })),
      trend((range) => db.financingLead.count({ where: { createdAt: range, ...financingLeadWhere } })),
      db.financingLead.count({ where: { status: "converted", ...financingLeadWhere } }),
      trend((range) => (scope === "vehicle" ? Promise.resolve(0) : db.architectSession.count({ where: { createdAt: range } }))),
      scope === "vehicle" ? Promise.resolve(0) : db.architectImage.count({ where: { createdAt: last30 } }),
      db.moderationLog.count({ where: { automated: true, createdAt: last30, listing: listingWhere } }),
      db.affiliate.count({ where: { status: "approved" } }),
      db.affiliate.count({ where: { status: "pending" } }),
      db.affiliateCommission.aggregate({ where: { status: { in: ["pending", "available"] } }, _sum: { amount: true } }),
      db.affiliateCommission.aggregate({ where: { status: "paid" }, _sum: { amount: true } }),
      db.user.findMany({ where: { createdAt: last30 }, select: { createdAt: true } }),
      db.listing.findMany({ where: { createdAt: last30, ...listingWhere }, select: { createdAt: true } }),
      db.lead.findMany({ where: { createdAt: last30, ...leadWhere }, select: { createdAt: true } }),
      db.message.findMany({ where: { createdAt: last30, conversation: { listing: listingWhere } }, select: { createdAt: true } }),
      db.listingBoostPurchase.findMany({ where: { status: "paid", paidAt: { gte: monthsStart }, listing: listingWhere }, select: { paidAt: true, amount: true } }),
      db.subscriptionPayment.findMany({
        where: { paidAt: { gte: monthsStart }, ...(partnerTypes ? { partnerType: { in: partnerTypes } } : {}) },
        select: { paidAt: true, amount: true },
      }),
      db.financingDeal.findMany({
        where: { createdAt: { gte: monthsStart }, listing: listingWhere },
        select: { createdAt: true, commissionAmount: true, rebateAmount: true },
      }),
      db.storeEarning.findMany({ orderBy: [{ month: "desc" }, { store: "asc" }], take: 36 }),
      db.user.findMany({ where: { createdAt: last30 }, select: { acqSource: true, acqCampaign: true, referredByAffiliateId: true } }),
      db.lead.findMany({ where: { createdAt: last30, ...leadWhere }, select: { acqSource: true, acqCampaign: true, source: true } }),
      db.financingLead.findMany({ where: { createdAt: last30, ...financingLeadWhere }, select: { acqSource: true, channel: true } }),
    ]);

    const byStatus = (status: string) => listingGroups.find((row) => row.status === status)?._count._all ?? 0;
    const activeOf = (listingType: string) => activeByType.find((row) => row.type === listingType)?._count._all ?? 0;

    const days = new Map<string, AdminOverviewDay>();
    for (let i = 29; i >= 0; i--) {
      const day = dayKey(new Date(now.getTime() - i * DAY_MS));
      days.set(day, { day, users: 0, listings: 0, leads: 0, messages: 0 });
    }
    const bump = (rows: { createdAt: Date }[], field: "users" | "listings" | "leads" | "messages") => {
      for (const row of rows) {
        const entry = days.get(dayKey(row.createdAt));
        if (entry) entry[field] += 1;
      }
    };
    bump(dailyUsers, "users");
    bump(dailyListings, "listings");
    bump(dailyLeads, "leads");
    bump(dailyMessages, "messages");

    const months = new Map<string, AdminOverviewRevenueMonth>();
    for (let i = 0; i < MONTHS_SHOWN; i++) {
      const month = monthKey(new Date(Date.UTC(monthsStart.getUTCFullYear(), monthsStart.getUTCMonth() + i, 1)));
      months.set(month, { month, listingPlans: 0, subscriptions: 0, financing: 0, stores: 0 });
    }
    const addMonth = (date: Date | null | undefined, field: keyof Omit<AdminOverviewRevenueMonth, "month">, value: number) => {
      const entry = date ? months.get(monthKey(date)) : undefined;
      if (entry) entry[field] += value;
    };
    for (const row of monthPlans) addMonth(row.paidAt, "listingPlans", money(row.amount));
    for (const row of monthSubscriptions) addMonth(row.paidAt, "subscriptions", money(row.amount));
    for (const row of monthDeals) addMonth(row.createdAt, "financing", money(row.commissionAmount) - money(row.rebateAmount));
    if (hasStores) for (const row of storeEntries) addMonth(new Date(`${row.month}-15T00:00:00Z`), "stores", money(row.amount));

    // Origens dos últimos 30 dias: cadastros, leads de lojas e pedidos de financiamento.
    const origins = new Map<string, AdminOverviewOriginRow>();
    const origin = (key: string, label: string) => {
      const row = origins.get(key) ?? { key, label, signups: 0, leads: 0, financingLeads: 0 };
      origins.set(key, row);
      return row;
    };
    const known = (source: string | null) => (source && source in ACQUISITION_SOURCES ? source : undefined);
    const sourceRow = (source: string) => origin(source, ACQUISITION_SOURCES[source as keyof typeof ACQUISITION_SOURCES]);
    for (const user of originUsers) {
      const source = known(user.acqSource) ?? (user.referredByAffiliateId ? "afiliado" : undefined);
      (source ? sourceRow(source) : origin(UNKNOWN.key, UNKNOWN.label)).signups += 1;
    }
    for (const lead of originLeads) {
      const source = known(lead.acqSource);
      if (source) sourceRow(source).leads += 1;
      else if (MANUAL_LEAD_LABELS[lead.source]) origin(`loja_${lead.source}`, MANUAL_LEAD_LABELS[lead.source]!).leads += 1;
      else origin(UNKNOWN.key, UNKNOWN.label).leads += 1;
    }
    for (const lead of originFinancing) {
      const source = known(lead.acqSource) ?? (lead.channel === "whatsapp" ? "whatsapp" : undefined);
      (source ? sourceRow(source) : origin(UNKNOWN.key, UNKNOWN.label)).financingLeads += 1;
    }

    const campaigns = new Map<string, AdminOverviewCampaignRow>();
    const campaign = (source: string | null, name: string | null) => {
      if (!source || !name) return undefined;
      const key = `${source}|${name}`;
      const row = campaigns.get(key) ?? { source: ACQUISITION_SOURCES[source as keyof typeof ACQUISITION_SOURCES] ?? source, campaign: name, signups: 0, leads: 0 };
      campaigns.set(key, row);
      return row;
    };
    for (const user of originUsers) {
      const row = campaign(user.acqSource, user.acqCampaign);
      if (row) row.signups += 1;
    }
    for (const lead of originLeads) {
      const row = campaign(lead.acqSource, lead.acqCampaign);
      if (row) row.leads += 1;
    }

    const mrr = sum(activeSubs, (sub) => money(sub.plan.priceMonth));
    const total = (pick: (trendValue: AdminOverviewTrend) => number) =>
      pick(listingPlans) + pick(subscriptions) + pick(financing) + pick(stores);

    return {
      scope,
      generatedAt: now.toISOString(),
      users: { total: usersTotal, newUsers, sellers, referred },
      listings: {
        active: byStatus("active"),
        pendingReview: byStatus("pending_review"),
        paused: byStatus("paused"),
        rejected: byStatus("rejected"),
        expired: byStatus("expired"),
        sold,
        soldValue30d: money(soldValue._sum.soldPrice),
        created,
        views: views._sum.viewsCount ?? 0,
        avgActivePrice: Math.round(money(avgPrice._avg.price)),
        activeVehicles: activeOf("vehicle"),
        activeProperties: activeOf("property"),
      },
      partners: {
        total: partnersTotal,
        verified: partnersVerified,
        byType: partnersByType.map((row) => ({ type: row.type, count: row._count._all })).sort((a, b) => b.count - a.count),
      },
      revenue: {
        mrr,
        payingSubscriptions: activeSubs.length,
        pastDue,
        listingPlans,
        listingPlansCount30d,
        subscriptions,
        financing,
        financingDeals30d,
        financingRebates30d: money(financingRebates30d._sum.rebateAmount),
        financingOpenLeads,
        stores,
        storeClicks30d,
        total: { last30d: Math.round(total((t) => t.last30d) * 100) / 100, prev30d: Math.round(total((t) => t.prev30d) * 100) / 100 },
        months: [...months.values()],
        storeEntries: storeEntries.map((row) => ({ id: row.id, month: row.month, store: row.store, amount: money(row.amount), note: row.note ?? undefined })),
      },
      engagement: { conversations, messages, favorites, leads, leadsWon30d, simulations, openReports },
      ai: { agentConversations, financingLeads, financingLeadsConverted, architectSessions, architectImages30d, autoModerated30d },
      affiliates: {
        active: affiliatesActive,
        pending: affiliatesPending,
        commissionsOpen: money(commissionsOpen._sum.amount),
        commissionsPaid: money(commissionsPaid._sum.amount),
      },
      origins: [...origins.values()].sort((a, b) => b.signups + b.leads + b.financingLeads - (a.signups + a.leads + a.financingLeads)),
      campaigns: [...campaigns.values()].sort((a, b) => b.signups + b.leads - (a.signups + a.leads)).slice(0, 15),
      daily: [...days.values()],
    };
  }

  // Lançamento mensal da comissão de uma loja parceira (substitui o do mesmo mês/loja).
  async saveStoreEarning(input: StoreEarningInput): Promise<{ ok: true }> {
    await this.prisma.storeEarning.upsert({
      where: { month_store: { month: input.month, store: input.store } },
      create: { month: input.month, store: input.store, amount: input.amount, note: input.note || null },
      update: { amount: input.amount, note: input.note || null },
    });
    return { ok: true };
  }

  async deleteStoreEarning(id: string): Promise<{ ok: true }> {
    await this.prisma.storeEarning.deleteMany({ where: { id } });
    return { ok: true };
  }
}

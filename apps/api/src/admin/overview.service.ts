import { Injectable } from "@nestjs/common";
import type { AdminOverview, AdminOverviewDay, AdminOverviewTrend } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Painel de big numbers do admin: só contagens e somas (nada de dado pessoal),
// numa chamada. Volumes ainda são pequenos, então a série diária agrupa em
// memória as datas dos últimos 30 dias em vez de SQL cru por tabela.
@Injectable()
export class AdminOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(): Promise<AdminOverview> {
    const now = new Date();
    const since30 = new Date(now.getTime() - 30 * DAY_MS);
    const since60 = new Date(now.getTime() - 60 * DAY_MS);
    const last30 = { gte: since30 };
    const prev30 = { gte: since60, lt: since30 };
    const db = this.prisma;

    // Conta "últimos 30 dias" e "30 dias anteriores" com o mesmo filtro.
    const trend = async (count: (range: { gte: Date; lt?: Date }) => Promise<number>): Promise<AdminOverviewTrend> => {
      const [last30d, prev30d] = await Promise.all([count(last30), count(prev30)]);
      return { last30d, prev30d };
    };
    const paidPlans = async (range: { gte: Date; lt?: Date }) =>
      Number((await db.listingBoostPurchase.aggregate({ where: { status: "paid", paidAt: range }, _sum: { amount: true } }))._sum.amount ?? 0);

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
      avgPrices,
      partnersTotal,
      partnersVerified,
      partnersByType,
      activeSubs,
      pastDue,
      listingPlans,
      listingPlansCount30d,
      listingPlansTotal,
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
      storeClicks30d,
      autoModerated30d,
      affiliatesActive,
      affiliatesPending,
      commissionsOpen,
      commissionsPaid,
      dailyUsers,
      dailyListings,
      dailyLeads,
      dailyMessages,
    ] = await Promise.all([
      db.user.count(),
      trend((range) => db.user.count({ where: { createdAt: range } })),
      db.user.count({ where: { listings: { some: {} } } }),
      db.user.count({ where: { referredByAffiliateId: { not: null } } }),
      db.listing.groupBy({ by: ["status"], _count: { _all: true } }),
      db.listing.groupBy({ by: ["type"], where: { status: "active" }, _count: { _all: true } }),
      trend((range) => db.listing.count({ where: { status: "sold", soldAt: range } })),
      db.listing.aggregate({ where: { status: "sold", soldAt: last30 }, _sum: { soldPrice: true } }),
      trend((range) => db.listing.count({ where: { createdAt: range } })),
      db.listing.aggregate({ _sum: { viewsCount: true } }),
      db.listing.groupBy({ by: ["type"], where: { status: "active" }, _avg: { price: true } }),
      db.partner.count(),
      db.partner.count({ where: { verifiedAt: { not: null } } }),
      db.partner.groupBy({ by: ["type"], _count: { _all: true } }),
      // Receita conta só assinatura paga pelo Stripe (sem paymentProviderRef = ativada sem cobrança).
      db.subscription.findMany({ where: { status: "active", paymentProviderRef: { not: null } }, select: { plan: { select: { priceMonth: true } } } }),
      db.subscription.count({ where: { status: "past_due" } }),
      trend(paidPlans),
      db.listingBoostPurchase.count({ where: { status: "paid", paidAt: last30 } }),
      paidPlans({ gte: new Date(0) }),
      trend((range) => db.conversation.count({ where: { createdAt: range } })),
      trend((range) => db.message.count({ where: { createdAt: range } })),
      db.favorite.count(),
      trend((range) => db.lead.count({ where: { createdAt: range } })),
      db.lead.count({ where: { status: "won", statusChangedAt: last30 } }),
      trend((range) => db.financingSimulation.count({ where: { createdAt: range } })),
      db.report.count({ where: { status: "open" } }),
      trend((range) => db.agentConversation.count({ where: { createdAt: range } })),
      trend((range) => db.financingLead.count({ where: { createdAt: range } })),
      db.financingLead.count({ where: { status: "converted" } }),
      trend((range) => db.architectSession.count({ where: { createdAt: range } })),
      db.architectImage.count({ where: { createdAt: last30 } }),
      db.affiliateClick.count({ where: { createdAt: last30 } }),
      db.moderationLog.count({ where: { automated: true, createdAt: last30 } }),
      db.affiliate.count({ where: { status: "approved" } }),
      db.affiliate.count({ where: { status: "pending" } }),
      db.affiliateCommission.aggregate({ where: { status: { in: ["pending", "available"] } }, _sum: { amount: true } }),
      db.affiliateCommission.aggregate({ where: { status: "paid" }, _sum: { amount: true } }),
      db.user.findMany({ where: { createdAt: last30 }, select: { createdAt: true } }),
      db.listing.findMany({ where: { createdAt: last30 }, select: { createdAt: true } }),
      db.lead.findMany({ where: { createdAt: last30 }, select: { createdAt: true } }),
      db.message.findMany({ where: { createdAt: last30 }, select: { createdAt: true } }),
    ]);

    const byStatus = (status: string) => listingGroups.find((row) => row.status === status)?._count._all ?? 0;
    const activeOf = (type: string) => activeByType.find((row) => row.type === type)?._count._all ?? 0;
    const avgOf = (type: string) => Math.round(Number(avgPrices.find((row) => row.type === type)?._avg.price ?? 0));

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

    return {
      generatedAt: now.toISOString(),
      users: { total: usersTotal, newUsers, sellers, referred },
      listings: {
        active: byStatus("active"),
        activeVehicles: activeOf("vehicle"),
        activeProperties: activeOf("property"),
        pendingReview: byStatus("pending_review"),
        paused: byStatus("paused"),
        rejected: byStatus("rejected"),
        expired: byStatus("expired"),
        sold,
        soldValue30d: Number(soldValue._sum.soldPrice ?? 0),
        created,
        views: views._sum.viewsCount ?? 0,
        avgActivePrice: { vehicle: avgOf("vehicle"), property: avgOf("property") },
      },
      partners: {
        total: partnersTotal,
        verified: partnersVerified,
        byType: partnersByType.map((row) => ({ type: row.type, count: row._count._all })).sort((a, b) => b.count - a.count),
      },
      revenue: {
        mrr: activeSubs.reduce((total, sub) => total + Number(sub.plan.priceMonth), 0),
        payingSubscriptions: activeSubs.length,
        pastDue,
        listingPlans,
        listingPlansCount30d,
        listingPlansTotal,
      },
      engagement: { conversations, messages, favorites, leads, leadsWon30d, simulations, openReports },
      ai: {
        agentConversations,
        financingLeads,
        financingLeadsConverted,
        architectSessions,
        architectImages30d,
        storeClicks30d,
        autoModerated30d,
      },
      affiliates: {
        active: affiliatesActive,
        pending: affiliatesPending,
        commissionsOpen: Number(commissionsOpen._sum.amount ?? 0),
        commissionsPaid: Number(commissionsPaid._sum.amount ?? 0),
      },
      daily: [...days.values()],
    };
  }
}

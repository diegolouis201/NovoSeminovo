import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  AFFILIATE_CODE_PATTERN,
  AFFILIATE_RULES,
  PARTNER_TYPE_LABELS,
  formatBRL,
  listingTier,
  type AdminAffiliateActionInput,
  type AdminAffiliateDetail,
  type AdminAffiliateRow,
  type AffiliateApplyInput,
  type AffiliateCommissionView,
  type AffiliateDashboard,
  type AffiliateTotals,
} from "@novoseminovo/shared-types";
import type { Prisma } from "@novoseminovo/db";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";

// Programa de afiliados: quem se inscreve (e é aprovado no /admin) ganha um
// código; o link novoseminovo.com.br/?ref=CODIGO (cookie de
// AFFILIATE_RULES.cookieDays dias) ou o código digitado no cadastro amarra a
// conta nova ao afiliado (User.referredByAffiliateId). Daí em diante:
// - cada fatura paga da assinatura de loja/imobiliária dessa pessoa gera
//   partnerSubscriptionRate% durante partnerSubscriptionMonths meses;
// - cada plano pago de anúncio (Flex/Turbo/Nitro) gera listingPlanRate%,
//   no mesmo prazo contado do cadastro.
// A comissão fica "pending" holdDays dias (estornos) e depois "available";
// o admin paga por Pix e marca "paid".

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30.44 * DAY_MS;

type CommissionRow = Prisma.AffiliateCommissionGetPayload<object>;

function toView(row: CommissionRow): AffiliateCommissionView {
  return {
    id: row.id,
    source: row.source as AffiliateCommissionView["source"],
    description: row.description,
    baseAmount: Number(row.baseAmount),
    rate: Number(row.rate),
    amount: Number(row.amount),
    status: row.status as AffiliateCommissionView["status"],
    availableAt: row.availableAt.toISOString(),
    paidAt: row.paidAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function totalsOf(rows: { status: string; amount: Prisma.Decimal | number }[]): AffiliateTotals {
  const totals = { pending: 0, available: 0, paid: 0 };
  for (const row of rows) {
    if (row.status === "pending" || row.status === "available" || row.status === "paid") totals[row.status] += Number(row.amount);
  }
  return { pending: round(totals.pending), available: round(totals.available), paid: round(totals.paid) };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function normalizeAffiliateCode(code: string | undefined | null): string | undefined {
  const clean = (code ?? "").trim().toUpperCase();
  return AFFILIATE_CODE_PATTERN.test(clean) ? clean : undefined;
}

@Injectable()
export class AffiliatesService {
  private readonly logger = new Logger(AffiliatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---- Inscrição e painel do afiliado ------------------------------------

  async apply(userId: string, input: AffiliateApplyInput): Promise<AffiliateDashboard> {
    const existing = await this.prisma.affiliate.findUnique({ where: { userId } });
    const data = { channels: input.channels, audience: input.audience || null, pixKey: input.pixKey };
    if (existing) {
      if (existing.status === "suspended") throw new ConflictException("Sua conta de afiliado está suspensa. Fale com a gente pelo WhatsApp.");
      // Aprovado só atualiza os dados (Pix, canais); recusado volta pra análise.
      await this.prisma.affiliate.update({
        where: { id: existing.id },
        data: { ...data, ...(existing.status === "rejected" ? { status: "pending", adminNote: null } : {}) },
      });
    } else {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
      await this.prisma.affiliate.create({ data: { ...data, userId, code: await this.newCode(user?.name ?? "") } });
    }
    return (await this.dashboard(userId))!;
  }

  async dashboard(userId: string): Promise<AffiliateDashboard | null> {
    const affiliate = await this.prisma.affiliate.findUnique({ where: { userId } });
    if (!affiliate) return null;
    await this.releaseMatured();
    const since = new Date(Date.now() - 30 * DAY_MS).toISOString().slice(0, 10);
    const [clicks, signups, commissions] = await Promise.all([
      this.prisma.affiliateClickDay.aggregate({ where: { affiliateId: affiliate.id, day: { gte: since } }, _sum: { count: true } }),
      this.prisma.user.count({ where: { referredByAffiliateId: affiliate.id } }),
      this.prisma.affiliateCommission.findMany({ where: { affiliateId: affiliate.id }, orderBy: { createdAt: "desc" }, take: 200 }),
    ]);
    return {
      status: affiliate.status as AffiliateDashboard["status"],
      code: affiliate.code,
      channels: affiliate.channels,
      audience: affiliate.audience ?? undefined,
      pixKey: affiliate.pixKey,
      adminNote: affiliate.adminNote ?? undefined,
      stats: {
        clicks30d: clicks._sum.count ?? 0,
        signups,
        payingCustomers: new Set(commissions.filter((row) => row.status !== "canceled").map((row) => row.referredUserId)).size,
      },
      totals: totalsOf(commissions),
      commissions: commissions.map(toView),
    };
  }

  // Clique no link ?ref= (somado por dia). Código desconhecido ou de
  // afiliado não aprovado é ignorado em silêncio.
  async recordClick(code: string): Promise<void> {
    const clean = normalizeAffiliateCode(code);
    if (!clean) return;
    const affiliate = await this.prisma.affiliate.findUnique({ where: { code: clean }, select: { id: true, status: true } });
    if (!affiliate || affiliate.status !== "approved") return;
    await this.prisma.affiliateClickDay.upsert({
      where: { affiliateId_day: { affiliateId: affiliate.id, day: today() } },
      create: { affiliateId: affiliate.id, day: today(), count: 1 },
      update: { count: { increment: 1 } },
    });
  }

  // ---- Comissões (chamadas pelo webhook do Stripe) -----------------------

  // Fatura paga de assinatura de loja/imobiliária.
  async recordPartnerInvoice(params: { invoiceId: string; stripeSubscriptionId: string; amountPaid: number; paidAt: Date }): Promise<void> {
    if (params.amountPaid <= 0) return;
    const subscription = await this.prisma.subscription.findFirst({
      where: { paymentProviderRef: params.stripeSubscriptionId },
      include: { plan: { select: { name: true } }, partner: { include: { owner: { select: { id: true, referredByAffiliateId: true } } } } },
    });
    // Receita do mês no painel geral do admin (uma linha por fatura paga).
    if (subscription) {
      await this.prisma.subscriptionPayment.upsert({
        where: { stripeInvoiceId: params.invoiceId },
        create: {
          stripeInvoiceId: params.invoiceId,
          partnerId: subscription.partnerId,
          partnerType: subscription.partner.type,
          amount: params.amountPaid,
          paidAt: params.paidAt,
        },
        update: {},
      });
    }
    const owner = subscription?.partner.owner;
    if (!subscription || !owner?.referredByAffiliateId) return;
    const affiliate = await this.prisma.affiliate.findUnique({ where: { id: owner.referredByAffiliateId } });
    if (!affiliate || affiliate.status !== "approved") return;

    // O prazo conta da primeira mensalidade comissionada dessa loja.
    const first = await this.prisma.affiliateCommission.findFirst({
      where: { partnerId: subscription.partnerId, source: "partner_subscription" },
      orderBy: { createdAt: "asc" },
    });
    if (first && params.paidAt.getTime() - first.createdAt.getTime() > AFFILIATE_RULES.partnerSubscriptionMonths * MONTH_MS) return;

    const typeLabel = PARTNER_TYPE_LABELS[subscription.partner.type] ?? "Parceiro";
    await this.createCommission({
      affiliateId: affiliate.id,
      affiliateUserId: affiliate.userId,
      source: "partner_subscription",
      sourceRef: `invoice:${params.invoiceId}`,
      referredUserId: owner.id,
      partnerId: subscription.partnerId,
      description: `Mensalidade ${subscription.plan.name} — ${typeLabel}`,
      baseAmount: params.amountPaid,
      rate: AFFILIATE_RULES.partnerSubscriptionRate,
    });
  }

  // Estorno de mensalidade: sai da receita; se foi total, a comissão cai.
  async recordInvoiceRefund(invoiceId: string, refundedAmount: number, fullRefund: boolean): Promise<void> {
    await this.prisma.subscriptionPayment.updateMany({
      where: { stripeInvoiceId: invoiceId },
      data: { refundedAmount, refundedAt: new Date() },
    });
    if (fullRefund) await this.cancelCommission(`invoice:${invoiceId}`);
  }

  // Comissão de pagamento estornado: cancelada se ainda não foi paga ao
  // afiliado (já paga, fica o aviso no log para acertar à mão).
  async cancelCommission(sourceRef: string): Promise<void> {
    const commission = await this.prisma.affiliateCommission.findUnique({ where: { sourceRef } });
    if (!commission || commission.status === "canceled") return;
    if (commission.status === "paid") {
      this.logger.warn(`Pagamento estornado, mas a comissão ${commission.id} já foi paga ao afiliado — acertar à mão.`);
      return;
    }
    await this.prisma.affiliateCommission.update({ where: { id: commission.id }, data: { status: "canceled" } });
  }

  // Plano de anúncio de pessoa física pago (ListingsService.applyBoost).
  async recordListingPlan(purchaseId: string): Promise<void> {
    const purchase = await this.prisma.listingBoostPurchase.findUnique({ where: { id: purchaseId } });
    if (!purchase || purchase.status !== "paid") return;
    const buyer = await this.prisma.user.findUnique({ where: { id: purchase.userId }, select: { id: true, referredByAffiliateId: true, referredAt: true } });
    if (!buyer?.referredByAffiliateId || !buyer.referredAt) return;
    if ((purchase.paidAt ?? new Date()).getTime() - buyer.referredAt.getTime() > AFFILIATE_RULES.partnerSubscriptionMonths * MONTH_MS) return;
    const affiliate = await this.prisma.affiliate.findUnique({ where: { id: buyer.referredByAffiliateId } });
    if (!affiliate || affiliate.status !== "approved") return;
    await this.createCommission({
      affiliateId: affiliate.id,
      affiliateUserId: affiliate.userId,
      source: "listing_plan",
      sourceRef: `boost:${purchase.id}`,
      referredUserId: buyer.id,
      description: `Plano ${listingTier(purchase.tier).name} de anúncio`,
      baseAmount: Number(purchase.amount),
      rate: AFFILIATE_RULES.listingPlanRate,
    });
  }

  private async createCommission(params: {
    affiliateId: string;
    affiliateUserId: string;
    source: "partner_subscription" | "listing_plan";
    sourceRef: string;
    referredUserId: string;
    partnerId?: string;
    description: string;
    baseAmount: number;
    rate: number;
  }): Promise<void> {
    const amount = round((params.baseAmount * params.rate) / 100);
    if (amount <= 0) return;
    // sourceRef é único: o mesmo evento do Stripe chegando duas vezes não paga em dobro.
    const exists = await this.prisma.affiliateCommission.findUnique({ where: { sourceRef: params.sourceRef } });
    if (exists) return;
    await this.prisma.affiliateCommission.create({
      data: {
        affiliateId: params.affiliateId,
        source: params.source,
        sourceRef: params.sourceRef,
        referredUserId: params.referredUserId,
        partnerId: params.partnerId,
        description: params.description,
        baseAmount: params.baseAmount,
        rate: params.rate,
        amount,
        availableAt: new Date(Date.now() + AFFILIATE_RULES.holdDays * DAY_MS),
      },
    });
    this.logger.log(`Comissão de afiliado ${params.affiliateId}: ${formatBRL(amount)} (${params.sourceRef})`);
    await this.notifications
      .notify(params.affiliateUserId, "affiliate_commission", { amountLabel: formatBRL(amount), description: params.description, holdDays: AFFILIATE_RULES.holdDays })
      .catch(() => undefined);
  }

  // Comissão que passou do período de garantia fica disponível pra saque.
  private async releaseMatured(): Promise<void> {
    await this.prisma.affiliateCommission.updateMany({ where: { status: "pending", availableAt: { lte: new Date() } }, data: { status: "available" } });
  }

  // ---- Admin --------------------------------------------------------------

  async adminList(): Promise<AdminAffiliateRow[]> {
    await this.releaseMatured();
    const affiliates = await this.prisma.affiliate.findMany({
      include: {
        user: { select: { name: true, email: true } },
        _count: { select: { referrals: true } },
        commissions: { select: { status: true, amount: true, baseAmount: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const since = new Date(Date.now() - 30 * DAY_MS).toISOString().slice(0, 10);
    const clicks = await this.prisma.affiliateClickDay.groupBy({ by: ["affiliateId"], where: { day: { gte: since } }, _sum: { count: true } });
    const clicksById = new Map(clicks.map((row) => [row.affiliateId, row._sum.count ?? 0]));
    return affiliates.map((affiliate) => ({
      id: affiliate.id,
      name: affiliate.user.name,
      email: affiliate.user.email,
      code: affiliate.code,
      status: affiliate.status as AdminAffiliateRow["status"],
      channels: affiliate.channels,
      audience: affiliate.audience ?? undefined,
      pixKey: affiliate.pixKey,
      createdAt: affiliate.createdAt.toISOString(),
      signups: affiliate._count.referrals,
      clicks30d: clicksById.get(affiliate.id) ?? 0,
      revenue: round(affiliate.commissions.filter((row) => row.status !== "canceled").reduce((sum, row) => sum + Number(row.baseAmount), 0)),
      totals: totalsOf(affiliate.commissions),
    }));
  }

  async adminDetail(affiliateId: string): Promise<AdminAffiliateDetail> {
    await this.releaseMatured();
    const affiliate = await this.prisma.affiliate.findUnique({
      where: { id: affiliateId },
      include: {
        user: { select: { name: true, email: true } },
        referrals: {
          select: { id: true, name: true, email: true, referredAt: true, ownedPartners: { select: { legalName: true, type: true } } },
          orderBy: { referredAt: "desc" },
        },
        commissions: { orderBy: { createdAt: "desc" } },
        clicks: { orderBy: { day: "asc" } },
      },
    });
    if (!affiliate) throw new NotFoundException("Afiliado não encontrado.");

    const counted = affiliate.commissions.filter((row) => row.status !== "canceled");
    const byUser = new Map<string, { revenue: number; commission: number }>();
    for (const row of counted) {
      const current = byUser.get(row.referredUserId) ?? { revenue: 0, commission: 0 };
      current.revenue += Number(row.baseAmount);
      current.commission += Number(row.amount);
      byUser.set(row.referredUserId, current);
    }
    const names = new Map(affiliate.referrals.map((user) => [user.id, user.name]));

    // Últimos 30 dias, com zero nos dias sem clique (o gráfico fica contínuo).
    const clicksByDay: { day: string; count: number }[] = [];
    const clickMap = new Map(affiliate.clicks.map((row) => [row.day, row.count]));
    for (let offset = 29; offset >= 0; offset--) {
      const day = new Date(Date.now() - offset * DAY_MS).toISOString().slice(0, 10);
      clicksByDay.push({ day, count: clickMap.get(day) ?? 0 });
    }

    const payouts = new Map<string, { paidAt: string; note: string; amount: number; count: number }>();
    for (const row of affiliate.commissions) {
      if (row.status !== "paid" || !row.paidAt) continue;
      const key = `${row.paidAt.toISOString()}|${row.paidNote ?? ""}`;
      const current = payouts.get(key) ?? { paidAt: row.paidAt.toISOString(), note: row.paidNote ?? "", amount: 0, count: 0 };
      current.amount = round(current.amount + Number(row.amount));
      current.count += 1;
      payouts.set(key, current);
    }

    return {
      affiliate: {
        id: affiliate.id,
        name: affiliate.user.name,
        email: affiliate.user.email,
        code: affiliate.code,
        status: affiliate.status as AdminAffiliateRow["status"],
        channels: affiliate.channels,
        audience: affiliate.audience ?? undefined,
        pixKey: affiliate.pixKey,
        createdAt: affiliate.createdAt.toISOString(),
        approvedAt: affiliate.approvedAt?.toISOString(),
        adminNote: affiliate.adminNote ?? undefined,
        signups: affiliate.referrals.length,
        clicks30d: clicksByDay.reduce((sum, row) => sum + row.count, 0),
        clicksTotal: affiliate.clicks.reduce((sum, row) => sum + row.count, 0),
        revenue: round(counted.reduce((sum, row) => sum + Number(row.baseAmount), 0)),
        totals: totalsOf(affiliate.commissions),
      },
      clicksByDay,
      referrals: affiliate.referrals.map((user) => {
        const partner = user.ownedPartners[0];
        const totals = byUser.get(user.id);
        return {
          userId: user.id,
          name: user.name,
          email: user.email,
          referredAt: user.referredAt?.toISOString(),
          account: partner ? `${PARTNER_TYPE_LABELS[partner.type] ?? "Empresa"} — ${partner.legalName}` : "Pessoa física",
          revenue: round(totals?.revenue ?? 0),
          commission: round(totals?.commission ?? 0),
        };
      }),
      commissions: affiliate.commissions.map((row) => ({
        ...toView(row),
        referredName: names.get(row.referredUserId) ?? "—",
        paidNote: row.paidNote ?? undefined,
      })),
      payouts: [...payouts.values()].sort((a, b) => b.paidAt.localeCompare(a.paidAt)),
    };
  }

  async adminAction(affiliateId: string, input: AdminAffiliateActionInput): Promise<void> {
    const affiliate = await this.prisma.affiliate.findUnique({ where: { id: affiliateId } });
    if (!affiliate) throw new NotFoundException("Afiliado não encontrado.");
    const next = { approve: "approved", reject: "rejected", suspend: "suspended", reactivate: "approved" }[input.action];
    await this.prisma.affiliate.update({
      where: { id: affiliateId },
      data: {
        status: next,
        adminNote: input.note || null,
        ...(input.action === "approve" && !affiliate.approvedAt ? { approvedAt: new Date() } : {}),
      },
    });
    if (input.action === "approve") {
      await this.notifications.notify(affiliate.userId, "affiliate_approved", { code: affiliate.code }).catch(() => undefined);
    }
  }

  // Pix feito: tudo que estava disponível vira pago, com a anotação do comprovante.
  async adminPayout(affiliateId: string, note: string): Promise<{ paid: number }> {
    await this.releaseMatured();
    const available = await this.prisma.affiliateCommission.findMany({ where: { affiliateId, status: "available" } });
    if (available.length === 0) throw new BadRequestException("Este afiliado não tem comissão disponível para pagar.");
    await this.prisma.affiliateCommission.updateMany({
      where: { id: { in: available.map((row) => row.id) } },
      data: { status: "paid", paidAt: new Date(), paidNote: note },
    });
    return { paid: round(available.reduce((sum, row) => sum + Number(row.amount), 0)) };
  }

  private async newCode(name: string): Promise<string> {
    const base =
      name
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toUpperCase()
        .replace(/[^A-Z]/g, " ")
        .trim()
        .split(/\s+/)[0]
        ?.slice(0, 10) || "PARCEIRO";
    const prefix = base.length >= 3 ? base : `${base}NS`;
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = `${prefix}${Math.floor(10 + Math.random() * (attempt < 10 ? 90 : 9990))}`;
      if (!(await this.prisma.affiliate.findUnique({ where: { code } }))) return code;
    }
    throw new ConflictException("Não foi possível gerar o código agora. Tente de novo.");
  }
}

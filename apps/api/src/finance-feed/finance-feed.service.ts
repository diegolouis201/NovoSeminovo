import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

// Feed do CRM financeiro (repositório "Financeiro NovoSeminovo" no Claude):
// o que o site vendeu e o que deve pagar, para lançar no caixa e conciliar
// com o Stripe (taxas e repasses) e o extrato do banco. Sem CPF, telefone,
// chave Pix ou cartão — só o que identifica o lançamento.

export type FinanceClient = { nome: string; documento?: string; email?: string };
export type FinanceEntry = {
  id: string;
  tipo: "mensalidade" | "plano_anuncio" | "comissao_financiamento" | "comissao_lojas_parceiras";
  origem: "stripe" | "banco" | "manual";
  descricao: string;
  cliente?: FinanceClient;
  valor: number;
  data: string;
  referencia?: string;
  estornado: boolean;
  valorEstornado: number;
  estornadoEm?: string;
};
export type FinanceExit = {
  id: string;
  tipo: "comissao_afiliado" | "cashback_financiamento";
  descricao: string;
  favorecido: string;
  valor: number;
  // aguardando: ainda não pode pagar (garantia contra estorno / banco não pagou a comissão).
  status: "aguardando" | "a_pagar" | "pago" | "cancelado";
  disponivelEm?: string;
  pagoEm?: string;
  criadoEm: string;
};
export type FinanceSubscription = {
  id: string;
  empresa: string;
  cnpj: string;
  email: string;
  plano: string;
  valorMensal: number;
  status: "ativa" | "em_atraso" | "cancelada";
  mudouEm: string;
  periodoAte: string;
};
export type FinanceFeed = { geradoEm: string; desde: string; entradas: FinanceEntry[]; saidas: FinanceExit[]; assinaturas: FinanceSubscription[] };

const money = (value: unknown) => Math.round(Number(value ?? 0) * 100) / 100;
const iso = (date?: Date | null) => date?.toISOString();
const COMMISSION_STATUS: Record<string, FinanceExit["status"]> = { pending: "aguardando", available: "a_pagar", paid: "pago", canceled: "cancelado" };
const SUBSCRIPTION_STATUS: Record<string, FinanceSubscription["status"]> = { active: "ativa", past_due: "em_atraso", canceled: "cancelada" };

@Injectable()
export class FinanceFeedService {
  constructor(private readonly prisma: PrismaService) {}

  async feed(since: Date): Promise<FinanceFeed> {
    const changedSince = (field: string) => ({ [field]: { gte: since } });
    const [payments, boosts, deals, stores, commissions, subscriptions] = await Promise.all([
      this.prisma.subscriptionPayment.findMany({ where: { OR: [changedSince("paidAt"), changedSince("refundedAt")] }, orderBy: { paidAt: "desc" }, take: 1000 }),
      this.prisma.listingBoostPurchase.findMany({
        where: { status: { in: ["paid", "refunded"] }, OR: [changedSince("paidAt"), changedSince("refundedAt")] },
        orderBy: { paidAt: "desc" },
        take: 1000,
        include: { listing: { select: { title: true, owner: { select: { name: true, email: true } } } } },
      }),
      this.prisma.financingDeal.findMany({
        where: { OR: [changedSince("createdAt"), changedSince("commissionReceivedAt"), changedSince("paidAt")] },
        orderBy: { createdAt: "desc" },
        take: 1000,
      }),
      this.prisma.storeEarning.findMany({ where: { month: { gte: since.toISOString().slice(0, 7) } }, orderBy: { month: "desc" } }),
      this.prisma.affiliateCommission.findMany({
        where: { OR: [changedSince("createdAt"), changedSince("availableAt"), changedSince("paidAt")] },
        orderBy: { createdAt: "desc" },
        take: 1000,
        include: { affiliate: { select: { user: { select: { name: true } } } } },
      }),
      this.prisma.subscription.findMany({
        orderBy: { statusChangedAt: "desc" },
        take: 1000,
        include: { plan: { select: { name: true, priceMonth: true } }, partner: { select: { legalName: true, document: true, owner: { select: { email: true } } } } },
      }),
    ]);

    const partnerIds = [...new Set(payments.map((p) => p.partnerId))];
    const partners = new Map(
      (
        await this.prisma.partner.findMany({ where: { id: { in: partnerIds } }, select: { id: true, legalName: true, document: true, owner: { select: { email: true } } } })
      ).map((p) => [p.id, p]),
    );

    const entradas: FinanceEntry[] = [
      ...payments.map((payment): FinanceEntry => {
        const partner = partners.get(payment.partnerId);
        return {
          id: payment.id,
          tipo: "mensalidade",
          origem: "stripe",
          descricao: `Mensalidade ${partner?.legalName ?? "loja/imobiliária"}`,
          cliente: partner ? { nome: partner.legalName, documento: partner.document, email: partner.owner.email } : undefined,
          valor: money(payment.amount),
          data: payment.paidAt.toISOString(),
          referencia: payment.stripeInvoiceId,
          estornado: Number(payment.refundedAmount) > 0,
          valorEstornado: money(payment.refundedAmount),
          estornadoEm: iso(payment.refundedAt),
        };
      }),
      ...boosts.map(
        (boost): FinanceEntry => ({
          id: boost.id,
          tipo: "plano_anuncio",
          origem: "stripe",
          descricao: `Plano ${boost.tier} do anúncio "${boost.listing.title}"`,
          cliente: { nome: boost.listing.owner.name, email: boost.listing.owner.email },
          valor: money(boost.amount),
          data: (boost.paidAt ?? boost.createdAt).toISOString(),
          referencia: boost.stripeSessionId ?? undefined,
          estornado: boost.status === "refunded",
          valorEstornado: boost.status === "refunded" ? money(boost.amount) : 0,
          estornadoEm: iso(boost.refundedAt),
        }),
      ),
      ...deals
        .filter((deal) => deal.commissionReceivedAt)
        .map(
          (deal): FinanceEntry => ({
            id: deal.id,
            tipo: "comissao_financiamento",
            origem: "banco",
            descricao: `Comissão de financiamento (${deal.financingProvider})${deal.externalRef ? ` ref. ${deal.externalRef}` : ""}`,
            valor: money(deal.commissionAmount),
            data: deal.commissionReceivedAt!.toISOString(),
            referencia: deal.externalRef ?? undefined,
            estornado: false,
            valorEstornado: 0,
          }),
        ),
      ...stores.map(
        (store): FinanceEntry => ({
          id: store.id,
          tipo: "comissao_lojas_parceiras",
          origem: "manual",
          descricao: `Comissão ${store.store} (${store.month})${store.note ? ` — ${store.note}` : ""}`,
          valor: money(store.amount),
          data: `${store.month}-01T12:00:00.000Z`,
          estornado: false,
          valorEstornado: 0,
        }),
      ),
    ].sort((a, b) => b.data.localeCompare(a.data));

    const saidas: FinanceExit[] = [
      ...commissions.map(
        (commission): FinanceExit => ({
          id: commission.id,
          tipo: "comissao_afiliado",
          descricao: commission.description,
          favorecido: commission.affiliate.user.name,
          valor: money(commission.amount),
          status: COMMISSION_STATUS[commission.status] ?? "aguardando",
          disponivelEm: commission.availableAt.toISOString(),
          pagoEm: iso(commission.paidAt),
          criadoEm: commission.createdAt.toISOString(),
        }),
      ),
      ...deals
        .filter((deal) => Number(deal.rebateAmount) > 0)
        .map(
          (deal): FinanceExit => ({
            id: deal.id,
            tipo: "cashback_financiamento",
            descricao: `Cashback do financiamento (${deal.financingProvider})`,
            favorecido: deal.buyerName || "Cliente do financiamento",
            valor: money(deal.rebateAmount),
            status: deal.status === "paid" ? "pago" : deal.commissionReceivedAt ? "a_pagar" : "aguardando",
            disponivelEm: iso(deal.commissionReceivedAt),
            pagoEm: iso(deal.paidAt),
            criadoEm: deal.createdAt.toISOString(),
          }),
        ),
    ];

    const assinaturas = subscriptions.map(
      (sub): FinanceSubscription => ({
        id: sub.id,
        empresa: sub.partner.legalName,
        cnpj: sub.partner.document,
        email: sub.partner.owner.email,
        plano: sub.plan.name,
        valorMensal: money(sub.plan.priceMonth),
        status: SUBSCRIPTION_STATUS[sub.status] ?? "ativa",
        mudouEm: sub.statusChangedAt.toISOString(),
        periodoAte: sub.currentPeriodEnd.toISOString(),
      }),
    );

    return { geradoEm: new Date().toISOString(), desde: since.toISOString(), entradas, saidas, assinaturas };
  }
}

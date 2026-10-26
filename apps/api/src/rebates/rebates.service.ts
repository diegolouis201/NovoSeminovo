import { BadRequestException, Injectable, Logger, NotFoundException, type OnModuleInit } from "@nestjs/common";
import { Prisma } from "@novoseminovo/db";
import {
  CASHBACK_PERCENT,
  formatBRL,
  type CashbackStage,
  type FinancingDeal,
  type MyCashbackSummary,
} from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";

// Cashback no financiamento: quem contrata (carro ou imóvel) recebe
// CASHBACK_PERCENT da comissão bruta do NovoSeminovo, só depois que o
// banco/Credihome paga essa comissão. O negócio nasce quando o lead do
// quadro de financiamentos vai para "Concluído" (ver
// AgentsService.updateFinancingLead). Até 26/10/2026 este programa pagava
// o anunciante — os campos rebate* do banco guardam o cashback agora.

const dealInclude = Prisma.validator<Prisma.FinancingDealInclude>()({
  listing: { select: { title: true } },
  buyerUser: { select: { cpf: true } },
});
type DealRow = Prisma.FinancingDealGetPayload<{ include: typeof dealInclude }>;

export function cashbackStage(deal: { status: string; commissionReceivedAt: Date | null }): CashbackStage {
  if (deal.status === "paid") return "paid";
  return deal.commissionReceivedAt ? "to_pay" : "awaiting_commission";
}

function toFinancingDeal(deal: DealRow, forAdmin: boolean): FinancingDeal {
  const cashbackAmount = Number(deal.rebateAmount);
  return {
    id: deal.id,
    listingId: deal.listingId ?? undefined,
    listingTitle: deal.listing?.title,
    buyerName: deal.buyerName,
    buyerEmail: deal.buyerEmail ?? undefined,
    buyerPhone: deal.buyerPhone ?? undefined,
    buyerLinked: Boolean(deal.buyerUserId),
    buyerCpf: forAdmin ? deal.buyerUser?.cpf ?? undefined : undefined,
    financingProvider: deal.financingProvider,
    assetValueLabel: formatBRL(Number(deal.assetValue)),
    financedAmountLabel: formatBRL(Number(deal.financedAmount)),
    commissionRateLabel: `${Number(deal.commissionRate)}%`,
    commissionAmountLabel: formatBRL(Number(deal.commissionAmount)),
    cashbackPercentLabel: `${Number(deal.rebatePercent)}%`,
    cashbackAmount,
    cashbackAmountLabel: formatBRL(cashbackAmount),
    status: deal.status,
    stage: cashbackStage(deal),
    commissionReceivedAt: deal.commissionReceivedAt?.toISOString(),
    paidAt: deal.paidAt?.toISOString(),
    paidNote: deal.paidNote ?? undefined,
    createdAt: deal.createdAt.toISOString(),
  };
}

export type RegisterCashbackInput = {
  leadId: string;
  listingId?: string;
  financingProvider: string;
  assetValue: number;
  financedAmount: number;
  commissionRate: number;
};

@Injectable()
export class RebatesService implements OnModuleInit {
  private readonly logger = new Logger(RebatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    void this.backfillBuyers().catch((error) => this.logger.error(`Falha ao completar clientes do cashback: ${error}`));
  }

  // Negócios registrados antes do cashback (26/10/2026) não guardavam quem
  // contratou: completa com os dados do lead de financiamento ligado a eles.
  async backfillBuyers(): Promise<number> {
    const deals = await this.prisma.financingDeal.findMany({
      where: { buyerName: "", financingLead: { isNot: null } },
      select: { id: true, financingLead: { select: { id: true, name: true, email: true, phone: true, buyerUserId: true, conversationId: true } } },
      take: 500,
    });
    for (const deal of deals) {
      const lead = deal.financingLead!;
      await this.prisma.financingDeal.update({
        where: { id: deal.id },
        data: { buyerName: lead.name, buyerEmail: lead.email, buyerPhone: lead.phone, buyerUserId: (await this.resolveBuyer(lead)) ?? null },
      });
    }
    return deals.length;
  }

  // Conta do site de quem contratou: a do próprio pedido (chat ou simulador
  // logado); senão, uma conta com o mesmo e-mail ou celular.
  private async resolveBuyer(lead: { buyerUserId: string | null; conversationId: string | null; email: string | null; phone: string }) {
    if (lead.buyerUserId) return lead.buyerUserId;
    if (lead.conversationId) {
      const conversation = await this.prisma.agentConversation.findUnique({ where: { id: lead.conversationId }, select: { userId: true } });
      if (conversation?.userId) return conversation.userId;
    }
    if (lead.email) {
      const byEmail = await this.prisma.user.findUnique({ where: { email: lead.email.toLowerCase() }, select: { id: true } });
      if (byEmail) return byEmail.id;
    }
    const digits = lead.phone.replace(/\D/g, "");
    const local = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
    if (local.length >= 10) {
      const byPhone = await this.prisma.user.findFirst({ where: { phone: { in: [local, `55${local}`] } }, select: { id: true } });
      if (byPhone) return byPhone.id;
    }
    return undefined;
  }

  // Financiamento fechado (lead em "Concluído"): registra o cashback de quem
  // contratou. Percentual e valor são um retrato do momento do registro.
  async registerCashback(adminUserId: string, input: RegisterCashbackInput): Promise<{ id: string }> {
    if (input.financedAmount > input.assetValue) {
      throw new BadRequestException("O valor financiado não pode ser maior que o valor do bem.");
    }
    const lead = await this.prisma.financingLead.findUnique({ where: { id: input.leadId } });
    if (!lead) throw new NotFoundException("Lead não encontrado.");
    const buyerUserId = await this.resolveBuyer(lead);

    const commissionAmount = Math.round(input.financedAmount * input.commissionRate) / 100;
    const cashbackAmount = Math.round(commissionAmount * CASHBACK_PERCENT) / 100;
    const deal = await this.prisma.financingDeal.create({
      data: {
        listingId: input.listingId,
        buyerUserId,
        buyerName: lead.name,
        buyerEmail: lead.email,
        buyerPhone: lead.phone,
        financingProvider: input.financingProvider,
        externalRef: `lead:${lead.id}`,
        assetValue: input.assetValue,
        financedAmount: input.financedAmount,
        commissionRate: input.commissionRate,
        commissionAmount,
        rebatePercent: CASHBACK_PERCENT,
        rebateAmount: cashbackAmount,
        registeredByUserId: adminUserId,
      },
      select: { id: true },
    });
    if (buyerUserId && !lead.buyerUserId) {
      await this.prisma.financingLead.update({ where: { id: lead.id }, data: { buyerUserId } });
    }
    await this.notifyBuyer(buyerUserId, "cashback_registered", { amountLabel: formatBRL(cashbackAmount) });
    return deal;
  }

  // Lead que saiu de "Concluído" antes do pagamento: o cashback registrado
  // some junto. Pago não pode ser desfeito.
  async deleteUnpaidDeal(dealId: string): Promise<void> {
    const deal = await this.prisma.financingDeal.findUnique({ where: { id: dealId } });
    if (!deal) return;
    if (deal.status === "paid") {
      throw new BadRequestException("O cashback deste financiamento já foi pago — ele não pode sair de Concluído.");
    }
    await this.prisma.financingDeal.delete({ where: { id: dealId } });
  }

  // Banco/Credihome pagou a comissão: o cashback fica liberado para pagar.
  async markCommissionReceived(dealId: string): Promise<FinancingDeal> {
    const deal = await this.prisma.financingDeal.findUnique({ where: { id: dealId } });
    if (!deal) throw new NotFoundException("Negócio não encontrado.");
    if (deal.commissionReceivedAt) throw new BadRequestException("A comissão deste financiamento já foi marcada como recebida.");
    const updated = await this.prisma.financingDeal.update({
      where: { id: dealId },
      data: { commissionReceivedAt: new Date() },
      include: dealInclude,
    });
    await this.notifyBuyer(updated.buyerUserId, "cashback_released", { amountLabel: formatBRL(Number(updated.rebateAmount)) });
    return toFinancingDeal(updated, true);
  }

  async markPaid(dealId: string, note?: string): Promise<FinancingDeal> {
    const existing = await this.prisma.financingDeal.findUnique({ where: { id: dealId } });
    if (!existing) throw new NotFoundException("Negócio não encontrado.");
    if (existing.status === "paid") throw new BadRequestException("Esse cashback já está marcado como pago.");
    if (!existing.commissionReceivedAt) {
      throw new BadRequestException("A comissão ainda não foi recebida — o cashback só é pago depois que o banco paga o NovoSeminovo.");
    }
    const updated = await this.prisma.financingDeal.update({
      where: { id: dealId },
      data: { status: "paid", paidAt: new Date(), paidNote: note },
      include: dealInclude,
    });
    await this.notifyBuyer(updated.buyerUserId, "cashback_paid", { amountLabel: formatBRL(Number(updated.rebateAmount)) });
    return toFinancingDeal(updated, true);
  }

  async listDeals(stage?: CashbackStage): Promise<FinancingDeal[]> {
    const where: Prisma.FinancingDealWhereInput =
      stage === "paid"
        ? { status: "paid" }
        : stage === "to_pay"
          ? { status: "registered", commissionReceivedAt: { not: null } }
          : stage === "awaiting_commission"
            ? { status: "registered", commissionReceivedAt: null }
            : {};
    const deals = await this.prisma.financingDeal.findMany({ where, orderBy: { createdAt: "desc" }, include: dealInclude });
    return deals.map((deal) => toFinancingDeal(deal, true));
  }

  // Fechamento mensal: financiamentos registrados no mês, com quem recebe o
  // cashback e o CPF (chave Pix).
  async monthlyReport(month: string) {
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match) throw new BadRequestException("Mês inválido — use AAAA-MM.");
    // Mês no horário de Brasília (UTC−3, sem horário de verão desde 2019).
    const start = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1, 3));
    const end = new Date(Date.UTC(Number(match[1]), Number(match[2]), 1, 3));

    const deals = await this.prisma.financingDeal.findMany({
      where: { createdAt: { gte: start, lt: end } },
      orderBy: { createdAt: "asc" },
      include: { listing: { select: { title: true, type: true } }, buyerUser: { select: { cpf: true } } },
    });

    return deals.map((deal) => ({
      date: deal.createdAt.toISOString(),
      client: deal.buyerName,
      clientPhone: deal.buyerPhone ?? "",
      clientEmail: deal.buyerEmail ?? "",
      // CPF de quem contratou — chave Pix do cashback. Vazio se a pessoa não
      // tem conta ou ainda não preencheu o perfil.
      clientCpf: deal.buyerUser?.cpf ?? "",
      listingTitle: deal.listing?.title ?? "",
      assetType: deal.listing?.type ?? "",
      bank: deal.financingProvider,
      financedAmount: Number(deal.financedAmount),
      commissionRate: Number(deal.commissionRate),
      commissionAmount: Number(deal.commissionAmount),
      commissionReceivedAt: deal.commissionReceivedAt?.toISOString() ?? "",
      cashbackPercent: Number(deal.rebatePercent),
      cashbackAmount: Number(deal.rebateAmount),
      netAmount: Number(deal.commissionAmount) - Number(deal.rebateAmount),
      stage: cashbackStage(deal),
      paidAt: deal.paidAt?.toISOString() ?? "",
      paidNote: deal.paidNote ?? "",
    }));
  }

  // "Meu cashback" do cliente. Liga à conta os negócios feitos antes do
  // cadastro com o mesmo e-mail.
  async myCashback(userId: string): Promise<MyCashbackSummary> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, cpf: true } });
    if (!user) throw new NotFoundException("Usuário não encontrado.");
    await this.prisma.financingDeal.updateMany({
      where: { buyerUserId: null, buyerEmail: { equals: user.email, mode: "insensitive" } },
      data: { buyerUserId: userId },
    });
    const deals = await this.prisma.financingDeal.findMany({ where: { buyerUserId: userId }, orderBy: { createdAt: "desc" }, include: dealInclude });
    const total = (stage: CashbackStage) =>
      formatBRL(deals.filter((deal) => cashbackStage(deal) === stage).reduce((sum, deal) => sum + Number(deal.rebateAmount), 0));
    return {
      percentLabel: `${CASHBACK_PERCENT}%`,
      totalAwaitingLabel: total("awaiting_commission"),
      totalToPayLabel: total("to_pay"),
      totalPaidLabel: total("paid"),
      cpfMissing: !user.cpf,
      deals: deals.map((deal) => toFinancingDeal(deal, false)),
    };
  }

  private async notifyBuyer(userId: string | null | undefined, type: "cashback_registered" | "cashback_released" | "cashback_paid", payload: Record<string, unknown>) {
    if (!userId) return;
    await this.notifications
      .notify(userId, type, payload)
      .catch((error) => this.logger.error(`Falha ao avisar o cliente sobre o cashback: ${error}`));
  }
}

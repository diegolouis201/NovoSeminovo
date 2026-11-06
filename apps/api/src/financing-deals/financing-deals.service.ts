import { BadRequestException, Injectable, Logger, NotFoundException, type OnModuleInit } from "@nestjs/common";
import { Prisma } from "@novoseminovo/db";
import { formatBRL, type FinancingCommissionStage, type FinancingDeal } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";

// Financiamento fechado: quando o lead do quadro de financiamentos vai para
// "Concluído" (ver AgentsService.updateFinancingLead), o negócio é
// registrado com a comissão que o banco/Credihome paga ao NovoSeminovo —
// toda ela fica com a empresa. Etapas: aguardando a comissão → comissão
// recebida (commissionReceivedAt). Até 06/11/2026 parte dessa comissão
// voltava ao cliente; os campos rebate*/paid* do banco ficam só como
// histórico e os negócios novos gravam 0 neles.

const dealInclude = Prisma.validator<Prisma.FinancingDealInclude>()({
  listing: { select: { title: true } },
});
type DealRow = Prisma.FinancingDealGetPayload<{ include: typeof dealInclude }>;

export function commissionStage(deal: { commissionReceivedAt: Date | null }): FinancingCommissionStage {
  return deal.commissionReceivedAt ? "received" : "awaiting_commission";
}

function toFinancingDeal(deal: DealRow): FinancingDeal {
  const commissionAmount = Number(deal.commissionAmount);
  return {
    id: deal.id,
    listingId: deal.listingId ?? undefined,
    listingTitle: deal.listing?.title,
    buyerName: deal.buyerName,
    buyerEmail: deal.buyerEmail ?? undefined,
    buyerPhone: deal.buyerPhone ?? undefined,
    financingProvider: deal.financingProvider,
    assetValueLabel: formatBRL(Number(deal.assetValue)),
    financedAmountLabel: formatBRL(Number(deal.financedAmount)),
    commissionRateLabel: `${Number(deal.commissionRate)}%`,
    commissionAmount,
    commissionAmountLabel: formatBRL(commissionAmount),
    stage: commissionStage(deal),
    commissionReceivedAt: deal.commissionReceivedAt?.toISOString(),
    createdAt: deal.createdAt.toISOString(),
  };
}

export type RegisterFinancingDealInput = {
  leadId: string;
  listingId?: string;
  financingProvider: string;
  assetValue: number;
  financedAmount: number;
  commissionRate: number;
};

@Injectable()
export class FinancingDealsService implements OnModuleInit {
  private readonly logger = new Logger(FinancingDealsService.name);

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    void this.backfillBuyers().catch((error) => this.logger.error(`Falha ao completar clientes dos financiamentos: ${error}`));
  }

  // Negócios registrados antes de 26/10/2026 não guardavam quem contratou:
  // completa com os dados do lead de financiamento ligado a eles.
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

  // Financiamento fechado (lead em "Concluído"): registra o negócio e a
  // comissão da empresa. Valores são um retrato do momento do registro.
  async registerDeal(adminUserId: string, input: RegisterFinancingDealInput): Promise<{ id: string }> {
    if (input.financedAmount > input.assetValue) {
      throw new BadRequestException("O valor financiado não pode ser maior que o valor do bem.");
    }
    const lead = await this.prisma.financingLead.findUnique({ where: { id: input.leadId } });
    if (!lead) throw new NotFoundException("Lead não encontrado.");
    const buyerUserId = await this.resolveBuyer(lead);

    const commissionAmount = Math.round(input.financedAmount * input.commissionRate) / 100;
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
        // Colunas antigas (sem uso): nada é devolvido a ninguém.
        rebatePercent: 0,
        rebateAmount: 0,
        registeredByUserId: adminUserId,
      },
      select: { id: true },
    });
    if (buyerUserId && !lead.buyerUserId) {
      await this.prisma.financingLead.update({ where: { id: lead.id }, data: { buyerUserId } });
    }
    return deal;
  }

  // Lead que saiu de "Concluído" (ou mudou valor/comissão/banco) antes de o
  // banco pagar: o negócio registrado some junto. Com a comissão já
  // recebida, o negócio está na receita e não pode ser desfeito.
  async deleteOpenDeal(dealId: string): Promise<void> {
    const deal = await this.prisma.financingDeal.findUnique({ where: { id: dealId } });
    if (!deal) return;
    if (deal.commissionReceivedAt) {
      throw new BadRequestException("A comissão deste financiamento já foi recebida — ele não pode sair de Concluído nem mudar de valor.");
    }
    await this.prisma.financingDeal.delete({ where: { id: dealId } });
  }

  // Banco/Credihome pagou a comissão ao NovoSeminovo.
  async markCommissionReceived(dealId: string): Promise<FinancingDeal> {
    const deal = await this.prisma.financingDeal.findUnique({ where: { id: dealId } });
    if (!deal) throw new NotFoundException("Negócio não encontrado.");
    if (deal.commissionReceivedAt) throw new BadRequestException("A comissão deste financiamento já foi marcada como recebida.");
    const updated = await this.prisma.financingDeal.update({
      where: { id: dealId },
      data: { commissionReceivedAt: new Date() },
      include: dealInclude,
    });
    return toFinancingDeal(updated);
  }

  async listDeals(stage?: FinancingCommissionStage): Promise<FinancingDeal[]> {
    const where: Prisma.FinancingDealWhereInput =
      stage === "received"
        ? { commissionReceivedAt: { not: null } }
        : stage === "awaiting_commission"
          ? { commissionReceivedAt: null }
          : {};
    const deals = await this.prisma.financingDeal.findMany({ where, orderBy: { createdAt: "desc" }, include: dealInclude, take: 500 });
    return deals.map(toFinancingDeal);
  }

  // Fechamento mensal: financiamentos registrados no mês e a comissão de
  // cada um.
  async monthlyReport(month: string) {
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) throw new BadRequestException("Mês inválido — use AAAA-MM.");
    // Mês no horário de Brasília (UTC−3, sem horário de verão desde 2019).
    const start = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1, 3));
    const end = new Date(Date.UTC(Number(match[1]), Number(match[2]), 1, 3));

    const deals = await this.prisma.financingDeal.findMany({
      where: { createdAt: { gte: start, lt: end } },
      orderBy: { createdAt: "asc" },
      include: { listing: { select: { title: true, type: true } } },
    });

    return deals.map((deal) => ({
      date: deal.createdAt.toISOString(),
      client: deal.buyerName,
      clientPhone: deal.buyerPhone ?? "",
      clientEmail: deal.buyerEmail ?? "",
      listingTitle: deal.listing?.title ?? "",
      assetType: deal.listing?.type ?? "",
      bank: deal.financingProvider,
      financedAmount: Number(deal.financedAmount),
      commissionRate: Number(deal.commissionRate),
      commissionAmount: Number(deal.commissionAmount),
      commissionReceivedAt: deal.commissionReceivedAt?.toISOString() ?? "",
      stage: commissionStage(deal),
    }));
  }
}

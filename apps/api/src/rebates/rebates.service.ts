import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type PartnerType } from "@novoseminovo/db";
import {
  formatBRL,
  type EligibleListing,
  type FinancingDeal,
  type FinancingDealStatus,
  type MyRebatesSummary,
  type RebateReceiverType,
  type RebateTier,
  type RegisterFinancingDealInput,
  type UpdateRebateTierInput,
} from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";

// PF recebe uma fatia fixa — por decisão de negócio (ver conversa com o
// Diego), diferente de corretor/imobiliária/lojista, que evoluem de nível.
// Não é editável no admin porque não há progressão nenhuma aqui.
const INDIVIDUAL_REBATE_PERCENT = 20;

type EligiblePartnerType = "dealership" | "real_estate_agency" | "broker";
const ELIGIBLE_PARTNER_TYPES: EligiblePartnerType[] = ["dealership", "real_estate_agency", "broker"];

function isEligiblePartnerType(type: string): type is EligiblePartnerType {
  return (ELIGIBLE_PARTNER_TYPES as string[]).includes(type);
}

// Pontos de partida sugeridos — ver RebatesController.updateTier: o admin
// pode reajustar nome/volume mínimo/percentual de cada nível sem precisar de
// deploy nenhum, então os números abaixo só importam na primeira vez que o
// programa roda (ver ensureDefaultTiers).
const DEFAULT_TIERS: Array<{ tierOrder: number; tierName: string; minVolume: number; rebatePercent: number }> = [
  { tierOrder: 1, tierName: "Bronze", minVolume: 0, rebatePercent: 20 },
  { tierOrder: 2, tierName: "Prata", minVolume: 500_000, rebatePercent: 25 },
  { tierOrder: 3, tierName: "Ouro", minVolume: 1_500_000, rebatePercent: 30 },
];

const PARTNER_TYPE_LABEL: Record<string, string> = {
  dealership: "Loja de veículos",
  real_estate_agency: "Imobiliária",
  broker: "Corretor(a) autônomo(a)",
};

const dealWithListing = Prisma.validator<Prisma.FinancingDealDefaultArgs>()({
  include: {
    listing: {
      select: {
        title: true,
        ownerUserId: true,
        owner: { select: { name: true } },
        partnerId: true,
        partner: { select: { legalName: true, type: true } },
      },
    },
  },
});
type DealWithListing = Prisma.FinancingDealGetPayload<typeof dealWithListing>;
const dealInclude = dealWithListing.include;

function toFinancingDeal(deal: DealWithListing): FinancingDeal {
  const receiverType: RebateReceiverType = deal.listing.partner
    ? (deal.listing.partner.type as RebateReceiverType)
    : "individual";
  const receiverLabel = deal.listing.partner
    ? `${deal.listing.partner.legalName} (${PARTNER_TYPE_LABEL[deal.listing.partner.type] ?? deal.listing.partner.type})`
    : `${deal.listing.owner.name} (pessoa física)`;

  return {
    id: deal.id,
    listingId: deal.listingId,
    listingTitle: deal.listing.title,
    receiverLabel,
    receiverType,
    financingProvider: deal.financingProvider,
    externalRef: deal.externalRef ?? undefined,
    assetValueLabel: formatBRL(Number(deal.assetValue)),
    financedAmountLabel: formatBRL(Number(deal.financedAmount)),
    commissionRateLabel: `${Number(deal.commissionRate)}%`,
    commissionAmountLabel: formatBRL(Number(deal.commissionAmount)),
    rebatePercentLabel: `${Number(deal.rebatePercent)}%`,
    rebateAmountLabel: formatBRL(Number(deal.rebateAmount)),
    status: deal.status,
    paidAt: deal.paidAt?.toISOString(),
    paidNote: deal.paidNote ?? undefined,
    createdAt: deal.createdAt.toISOString(),
  };
}

function toRebateTier(tier: {
  id: string;
  partnerType: PartnerType;
  tierOrder: number;
  tierName: string;
  minVolume: Prisma.Decimal;
  rebatePercent: Prisma.Decimal;
}): RebateTier {
  return {
    id: tier.id,
    partnerType: tier.partnerType,
    tierOrder: tier.tierOrder,
    tierName: tier.tierName,
    minVolume: Number(tier.minVolume),
    minVolumeLabel: formatBRL(Number(tier.minVolume)),
    rebatePercent: Number(tier.rebatePercent),
    rebatePercentLabel: `${Number(tier.rebatePercent)}%`,
  };
}

@Injectable()
export class RebatesService {
  constructor(private readonly prisma: PrismaService) {}

  // Garante que toda categoria elegível (lojista, imobiliária, corretor)
  // tenha ao menos os níveis padrão — idempotente, mesmo padrão de
  // PaymentsService.ensureStripeCatalog: sem isso, a primeira vez que o
  // programa roda em produção não teria nenhum nível cadastrado.
  private async ensureDefaultTiers(): Promise<void> {
    for (const partnerType of ELIGIBLE_PARTNER_TYPES) {
      const existing = await this.prisma.partnerRebateTier.count({ where: { partnerType } });
      if (existing > 0) continue;
      await this.prisma.partnerRebateTier.createMany({
        data: DEFAULT_TIERS.map((tier) => ({ partnerType, ...tier })),
      });
    }
  }

  async listTiers(): Promise<RebateTier[]> {
    await this.ensureDefaultTiers();
    const tiers = await this.prisma.partnerRebateTier.findMany({
      orderBy: [{ partnerType: "asc" }, { tierOrder: "asc" }],
    });
    return tiers.map(toRebateTier);
  }

  async updateTier(tierId: string, input: UpdateRebateTierInput): Promise<RebateTier> {
    const tier = await this.prisma.partnerRebateTier.update({
      where: { id: tierId },
      data: {
        tierName: input.tierName,
        minVolume: input.minVolume,
        rebatePercent: input.rebatePercent,
      },
    });
    return toRebateTier(tier);
  }

  // Volume financiado acumulado (histórico, todo negócio registrado — pago ou
  // não) pra um parceiro: define o nível atual dele. O rebate já é devido
  // assim que o financiamento fecha, então conta mesmo antes de ser pago.
  private async cumulativeVolume(partnerId: string): Promise<number> {
    const result = await this.prisma.financingDeal.aggregate({
      _sum: { financedAmount: true },
      where: { listing: { partnerId } },
    });
    return Number(result._sum.financedAmount ?? 0);
  }

  private async currentTierFor(partnerType: EligiblePartnerType, volume: number) {
    await this.ensureDefaultTiers();
    const tiers = await this.prisma.partnerRebateTier.findMany({
      where: { partnerType },
      orderBy: { tierOrder: "asc" },
    });

    let current = tiers[0];
    let next: (typeof tiers)[number] | undefined;
    for (const tier of tiers) {
      if (volume >= Number(tier.minVolume)) {
        current = tier;
      } else {
        next = tier;
        break;
      }
    }
    return { current, next };
  }

  private async resolveReceiver(listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, partnerId: true, partner: { select: { type: true } } },
    });
    if (!listing) throw new NotFoundException("Anúncio não encontrado.");
    return listing;
  }

  // Anúncios marcados como "vendido" — candidatos a registrar negócio
  // fechado (ver formulário em /admin/recompensas). Sem isso o admin
  // precisava digitar o id/link do anúncio à mão.
  async listEligibleListings(): Promise<EligibleListing[]> {
    const listings = await this.prisma.listing.findMany({
      where: { status: "sold" },
      select: {
        id: true,
        title: true,
        price: true,
        owner: { select: { name: true } },
        partner: { select: { legalName: true, type: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return listings.map((listing) => ({
      id: listing.id,
      title: listing.title,
      priceLabel: formatBRL(Number(listing.price)),
      receiverLabel: listing.partner
        ? `${listing.partner.legalName} (${PARTNER_TYPE_LABEL[listing.partner.type] ?? listing.partner.type})`
        : `${listing.owner.name} (pessoa física)`,
    }));
  }

  async registerDeal(adminUserId: string, input: RegisterFinancingDealInput): Promise<FinancingDeal> {
    const listing = await this.resolveReceiver(input.listingId);

    if (input.financedAmount > input.assetValue) {
      throw new BadRequestException("O valor financiado não pode ser maior que o valor do bem.");
    }

    const commissionRate = input.commissionRate ?? 1;
    const commissionAmount = (input.financedAmount * commissionRate) / 100;

    let rebatePercent = INDIVIDUAL_REBATE_PERCENT;
    if (listing.partnerId && listing.partner && isEligiblePartnerType(listing.partner.type)) {
      const volumeBefore = await this.cumulativeVolume(listing.partnerId);
      const { current } = await this.currentTierFor(listing.partner.type, volumeBefore);
      rebatePercent = Number(current?.rebatePercent ?? INDIVIDUAL_REBATE_PERCENT);
    }
    const rebateAmount = (commissionAmount * rebatePercent) / 100;

    const deal = await this.prisma.financingDeal.create({
      data: {
        listingId: listing.id,
        financingProvider: input.financingProvider,
        externalRef: input.externalRef,
        assetValue: input.assetValue,
        financedAmount: input.financedAmount,
        commissionRate,
        commissionAmount,
        rebatePercent,
        rebateAmount,
        registeredByUserId: adminUserId,
      },
      include: dealInclude,
    });

    return toFinancingDeal(deal);
  }

  // Percentual que o anunciante receberia se o financiamento fechasse hoje —
  // usado no quadro de financiamentos pra mostrar o repasse previsto antes
  // de existir negócio registrado. Mesma regra de registerDeal.
  async previewRebate(listingId: string): Promise<{ percent: number; receiverLabel: string } | undefined> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { partnerId: true, owner: { select: { name: true } }, partner: { select: { legalName: true, type: true } } },
    });
    if (!listing) return undefined;
    let percent = INDIVIDUAL_REBATE_PERCENT;
    if (listing.partnerId && listing.partner && isEligiblePartnerType(listing.partner.type)) {
      const { current } = await this.currentTierFor(listing.partner.type, await this.cumulativeVolume(listing.partnerId));
      percent = Number(current?.rebatePercent ?? INDIVIDUAL_REBATE_PERCENT);
    }
    return {
      percent,
      receiverLabel: listing.partner ? listing.partner.legalName : `${listing.owner.name} (pessoa física)`,
    };
  }

  // Lead que saiu de "Concluído" antes do pagamento: o negócio registrado
  // automaticamente some junto (senão entraria no fechamento um repasse de
  // financiamento que não aconteceu). Pago não pode ser desfeito.
  async deleteUnpaidDeal(dealId: string): Promise<void> {
    const deal = await this.prisma.financingDeal.findUnique({ where: { id: dealId } });
    if (!deal) return;
    if (deal.status === "paid") {
      throw new BadRequestException("O repasse deste negócio já foi pago — ele não pode sair de Concluído.");
    }
    await this.prisma.financingDeal.delete({ where: { id: dealId } });
  }

  // Fechamento mensal: todo negócio registrado no mês (pelo quadro ou à mão
  // em /admin/recompensas), com quem recebe e os dados pra fazer o Pix.
  async monthlyReport(month: string) {
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match) throw new BadRequestException("Mês inválido — use AAAA-MM.");
    // Mês no horário de Brasília (UTC−3, sem horário de verão desde 2019):
    // o servidor roda em UTC, e um negócio das 22h do dia 31 é do mês 31.
    const start = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1, 3));
    const end = new Date(Date.UTC(Number(match[1]), Number(match[2]), 1, 3));

    const deals = await this.prisma.financingDeal.findMany({
      where: { createdAt: { gte: start, lt: end } },
      orderBy: { createdAt: "asc" },
      include: {
        financingLead: { select: { name: true, phone: true } },
        listing: {
          select: {
            title: true,
            type: true,
            owner: { select: { name: true, email: true, phone: true, cpf: true } },
            partner: { select: { id: true, legalName: true, type: true, document: true, owner: { select: { email: true, phone: true } } } },
          },
        },
      },
    });

    return deals.map((deal) => {
      const partner = deal.listing.partner;
      return {
        date: deal.createdAt.toISOString(),
        client: deal.financingLead?.name ?? "",
        clientPhone: deal.financingLead?.phone ?? "",
        listingTitle: deal.listing.title,
        assetType: deal.listing.type,
        bank: deal.financingProvider,
        financedAmount: Number(deal.financedAmount),
        commissionRate: Number(deal.commissionRate),
        commissionAmount: Number(deal.commissionAmount),
        receiverKey: partner ? `partner:${partner.id}` : `user:${deal.listing.owner.email}`,
        receiverName: partner ? partner.legalName : deal.listing.owner.name,
        receiverType: partner ? PARTNER_TYPE_LABEL[partner.type] ?? partner.type : "Pessoa física",
        // CNPJ/CPF da loja ou CPF da pessoa física — chave Pix mais comum e
        // necessário pro recibo. Vazio se a pessoa ainda não preencheu o perfil.
        receiverDocument: partner ? partner.document : deal.listing.owner.cpf ?? "",
        receiverEmail: partner ? partner.owner.email : deal.listing.owner.email,
        receiverPhone: (partner ? partner.owner.phone : deal.listing.owner.phone) ?? "",
        rebatePercent: Number(deal.rebatePercent),
        rebateAmount: Number(deal.rebateAmount),
        netAmount: Number(deal.commissionAmount) - Number(deal.rebateAmount),
        status: deal.status,
        paidAt: deal.paidAt?.toISOString() ?? "",
        paidNote: deal.paidNote ?? "",
      };
    });
  }

  async listDeals(status?: FinancingDealStatus): Promise<FinancingDeal[]> {
    const deals = await this.prisma.financingDeal.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      include: dealInclude,
    });
    return deals.map(toFinancingDeal);
  }

  async markPaid(dealId: string, note?: string): Promise<FinancingDeal> {
    const existing = await this.prisma.financingDeal.findUnique({ where: { id: dealId } });
    if (!existing) throw new NotFoundException("Negócio não encontrado.");
    if (existing.status === "paid") throw new BadRequestException("Esse negócio já está marcado como pago.");

    const updated = await this.prisma.financingDeal.update({
      where: { id: dealId },
      data: { status: "paid", paidAt: new Date(), paidNote: note },
      include: dealInclude,
    });
    return toFinancingDeal(updated);
  }

  // "Meus ganhos": funciona tanto pra quem anuncia como PF quanto pra dono/
  // agente de uma loja/imobiliária/corretor — identifica qual dos dois casos
  // é esse usuário e monta o resumo certo.
  async myRebates(userId: string): Promise<MyRebatesSummary> {
    const partner = await this.prisma.partner.findFirst({
      where: { OR: [{ ownerUserId: userId }, { members: { some: { userId } } }] },
    });

    if (partner && isEligiblePartnerType(partner.type)) {
      const volume = await this.cumulativeVolume(partner.id);
      const { current, next } = await this.currentTierFor(partner.type, volume);

      const deals = await this.prisma.financingDeal.findMany({
        where: { listing: { partnerId: partner.id } },
        orderBy: { createdAt: "desc" },
        include: dealInclude,
      });

      const currentMin = Number(current?.minVolume ?? 0);
      const nextMin = next ? Number(next.minVolume) : undefined;
      const progressToNextTierPct =
        next && nextMin !== undefined && nextMin > currentMin
          ? Math.min(100, Math.round(((volume - currentMin) / (nextMin - currentMin)) * 100))
          : 100;

      return {
        receiverType: partner.type as RebateReceiverType,
        currentTierName: current?.tierName,
        currentRebatePercentLabel: `${Number(current?.rebatePercent ?? 0)}%`,
        cumulativeVolumeLabel: formatBRL(volume),
        nextTierName: next?.tierName,
        nextTierMinVolumeLabel: next ? formatBRL(Number(next.minVolume)) : undefined,
        progressToNextTierPct,
        totalPendingLabel: formatBRL(sumRebate(deals, "registered")),
        totalPaidLabel: formatBRL(sumRebate(deals, "paid")),
        deals: deals.map(toFinancingDeal),
      };
    }

    const deals = await this.prisma.financingDeal.findMany({
      where: { listing: { ownerUserId: userId, partnerId: null } },
      orderBy: { createdAt: "desc" },
      include: dealInclude,
    });

    return {
      receiverType: "individual",
      currentRebatePercentLabel: `${INDIVIDUAL_REBATE_PERCENT}%`,
      totalPendingLabel: formatBRL(sumRebate(deals, "registered")),
      totalPaidLabel: formatBRL(sumRebate(deals, "paid")),
      deals: deals.map(toFinancingDeal),
    };
  }
}

function sumRebate(deals: DealWithListing[], status: FinancingDealStatus): number {
  return deals.filter((deal) => deal.status === status).reduce((total, deal) => total + Number(deal.rebateAmount), 0);
}

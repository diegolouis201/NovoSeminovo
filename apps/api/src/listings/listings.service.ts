import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@novoseminovo/db";
import {
  formatBRL,
  type CreateListingInput,
  type FinancingSimulationResult,
  type ListingSummary,
  type MyListingSummary,
  type Role,
  type UpdateListingStatusInput,
} from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import {
  DEFAULT_RATE,
  listingInclude,
  priceAmortization,
  toListingDetail,
  toListingSummary,
  toMyListingSummary,
} from "./listings.mapper";

export type ListingSearchQuery = {
  assetType?: string;
  q?: string;
  city?: string;
  priceMin?: string;
  priceMax?: string;
  yearMin?: string;
  yearMax?: string;
  bedroomsMin?: string;
};

function toNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

@Injectable()
export class ListingsService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: ListingSearchQuery): Promise<ListingSummary[]> {
    const priceMin = toNumber(query.priceMin);
    const priceMax = toNumber(query.priceMax);
    const yearMin = toNumber(query.yearMin);
    const yearMax = toNumber(query.yearMax);
    const bedroomsMin = toNumber(query.bedroomsMin);

    const where: Prisma.ListingWhereInput = {
      status: "active",
      ...(query.assetType === "vehicle" || query.assetType === "property"
        ? { type: query.assetType }
        : {}),
      ...(query.city ? { city: { equals: query.city, mode: "insensitive" } } : {}),
      ...(priceMin !== undefined || priceMax !== undefined
        ? { price: { ...(priceMin !== undefined ? { gte: priceMin } : {}), ...(priceMax !== undefined ? { lte: priceMax } : {}) } }
        : {}),
      ...(query.q
        ? { title: { contains: query.q, mode: "insensitive" } }
        : {}),
      ...(yearMin !== undefined || yearMax !== undefined
        ? {
            vehicleDetails: {
              yearModel: { ...(yearMin !== undefined ? { gte: yearMin } : {}), ...(yearMax !== undefined ? { lte: yearMax } : {}) },
            },
          }
        : {}),
      ...(bedroomsMin !== undefined ? { propertyDetails: { bedrooms: { gte: bedroomsMin } } } : {}),
    };

    const listings = await this.prisma.listing.findMany({
      where,
      include: listingInclude,
      orderBy: [{ highlightedUntil: "desc" }, { publishedAt: "desc" }],
      take: 60,
    });

    return listings.map(toListingSummary);
  }

  async getDetail(id: string, viewer?: { id: string; role: Role }) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      include: listingInclude,
    });
    if (!listing) throw new NotFoundException(`Anúncio ${id} não encontrado`);

    // Antes de aprovado (ou depois de recusado/vendido/expirado), só o dono e
    // um admin podem ver — pra qualquer outra pessoa, isso não existe. 404 em
    // vez de 403 pra não confirmar que o id é válido.
    const isOwner = viewer?.id === listing.ownerUserId;
    const isAdmin = viewer?.role === "admin";
    if (listing.status !== "active" && !isOwner && !isAdmin) {
      throw new NotFoundException(`Anúncio ${id} não encontrado`);
    }

    if (listing.status === "active") {
      await this.prisma.listing.update({ where: { id }, data: { viewsCount: { increment: 1 } } });
    }

    return toListingDetail(listing);
  }

  async simulateFinancing(
    listingId: string,
    input: { assetPrice: number; downPaymentPct: number; installments: number },
  ): Promise<FinancingSimulationResult> {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException(`Anúncio ${listingId} não encontrado`);

    const rateInfo = DEFAULT_RATE[listing.type];
    const downPayment = input.assetPrice * input.downPaymentPct;
    const installmentValue = priceAmortization(
      input.assetPrice - downPayment,
      rateInfo.monthly,
      input.installments,
    );

    const result: FinancingSimulationResult = {
      downPaymentLabel: `${formatBRL(downPayment)} (${Math.round(input.downPaymentPct * 100)}%)`,
      installmentLabel: `${input.installments}x de ${formatBRL(installmentValue)}`,
      rateLabel: rateInfo.label,
    };

    await this.prisma.financingSimulation.create({
      data: {
        listingId,
        simType: listing.type === "vehicle" ? "vehicle_cdc" : "real_estate_financing",
        downPayment,
        installments: input.installments,
        estimatedRate: rateInfo.monthly * 100,
        result: result as unknown as Prisma.InputJsonValue,
      },
    });

    return result;
  }

  // Clique em "Chamar no WhatsApp" na página do anúncio. Sem corpo/estado —
  // só registra o lead pro funil do parceiro (buyerId fica null se quem
  // clicou não estiver logado; o painel já trata isso como "Contato anônimo").
  // Anúncio de vendedor individual não gera lead (Lead exige partnerId),
  // igual ao chat em ConversationsService.startConversation.
  async registerWhatsappClick(listingId: string, buyerId?: string): Promise<void> {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException(`Anúncio ${listingId} não encontrado`);
    if (!listing.partnerId) return;

    const existing = await this.prisma.lead.findFirst({
      where: { listingId, partnerId: listing.partnerId, source: "whatsapp", buyerId: buyerId ?? null },
    });
    if (existing) return;

    await this.prisma.lead.create({
      data: { partnerId: listing.partnerId, listingId, buyerId, source: "whatsapp", status: "new" },
    });
  }

  // Denúncia de anúncio. Sem dedupe por enquanto: se a mesma pessoa denunciar
  // duas vezes, vira duas linhas na fila do admin (menos código, e o admin já
  // vê o autor/anúncio repetidos de cara).
  async createReport(listingId: string, reporterId: string, reason: string): Promise<void> {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException(`Anúncio ${listingId} não encontrado`);
    if (listing.ownerUserId === reporterId) {
      throw new BadRequestException("Você não pode denunciar o seu próprio anúncio.");
    }

    await this.prisma.report.create({
      data: { listingId, reporterId, reason, status: "open" },
    });
  }

  async listMine(ownerUserId: string): Promise<MyListingSummary[]> {
    const listings = await this.prisma.listing.findMany({
      where: { ownerUserId },
      include: listingInclude,
      orderBy: { createdAt: "desc" },
    });
    return listings.map(toMyListingSummary);
  }

  async create(ownerUserId: string, input: CreateListingInput): Promise<MyListingSummary> {
    const { assetType, title, description, price, city, state, neighborhood } = input;

    // Quem tem uma loja/imobiliária cadastrada anuncia sempre em nome dela —
    // é isso que liga o anúncio ao painel do parceiro (estoque, leads, vitrine).
    const partner = await this.prisma.partner.findFirst({ where: { ownerUserId } });

    const listing = await this.prisma.listing.create({
      data: {
        type: assetType,
        ownerUserId,
        partnerId: partner?.id,
        title,
        description,
        price,
        city,
        state,
        neighborhood,
        // Vai para a fila do painel do admin — só fica visível na busca
        // depois de aprovado (ver AdminModule), quando publishedAt é definido.
        status: "pending_review",
        ...(assetType === "vehicle"
          ? {
              vehicleDetails: {
                create: {
                  ...(await this.resolveBrandAndModel(input.brand, input.model)),
                  version: input.version,
                  yearManufacture: input.yearManufacture,
                  yearModel: input.yearModel,
                  mileage: input.mileage,
                  transmission: input.transmission,
                  fuelType: input.fuelType,
                  color: input.color,
                  doors: input.doors,
                  condition: "used",
                },
              },
            }
          : {
              propertyDetails: {
                create: {
                  propertyType: input.propertyType,
                  purpose: input.purpose,
                  bedrooms: input.bedrooms,
                  bathrooms: input.bathrooms,
                  parkingSpots: input.parkingSpots,
                  areaM2: input.areaM2,
                  condoFee: input.condoFee,
                  iptu: input.iptu,
                  streetAddress: input.streetAddress,
                },
              },
            }),
      },
      include: listingInclude,
    });

    return toMyListingSummary(listing);
  }

  async updateStatus(
    listingId: string,
    ownerUserId: string,
    input: UpdateListingStatusInput,
  ): Promise<MyListingSummary> {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException(`Anúncio ${listingId} não encontrado`);
    if (listing.ownerUserId !== ownerUserId) {
      throw new ForbiddenException("Você só pode editar os seus próprios anúncios.");
    }

    // O dono só sai de ativo/pausado por aqui — nunca de pending_review/
    // rejected/expired (isso é moderação, ver AdminModule.moderateListing) e
    // nunca de "sold" (é terminal: uma vez vendido, o anúncio não volta a
    // ativo/pausado — quem quiser vender de novo cria um anúncio novo).
    const validTransition =
      (listing.status === "active" && (input.status === "paused" || input.status === "sold")) ||
      (listing.status === "paused" && (input.status === "active" || input.status === "sold"));
    if (!validTransition) {
      throw new ConflictException(
        "Este anúncio precisa estar ativo ou pausado pra isso — anúncios em análise ou recusados só mudam de status pela moderação, e um anúncio vendido não volta atrás.",
      );
    }

    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data: { status: input.status },
      include: listingInclude,
    });
    return toMyListingSummary(updated);
  }

  // Marca/modelo são texto livre no formulário (Etapa 1: sem consulta a
  // Detran/FIPE no MVP) — a primeira pessoa a citar "Fiat Argo" cria as duas
  // linhas do catálogo, as próximas só reaproveitam (busca por nome
  // case-insensitive; connectOrCreate não serve aqui porque a constraint de
  // unicidade do Postgres é case-sensitive).
  private async resolveBrandAndModel(brandName: string, modelName: string) {
    let brand = await this.prisma.vehicleBrand.findFirst({
      where: { name: { equals: brandName, mode: "insensitive" } },
    });
    if (!brand) {
      try {
        brand = await this.prisma.vehicleBrand.create({ data: { name: brandName } });
      } catch (error) {
        // Duas pessoas anunciando a mesma marca nova ao mesmo tempo: quem
        // perder a corrida do create() só reaproveita o que a outra criou,
        // em vez de estourar um 500 por violar o @unique de VehicleBrand.name.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          brand = await this.prisma.vehicleBrand.findFirstOrThrow({
            where: { name: { equals: brandName, mode: "insensitive" } },
          });
        } else {
          throw error;
        }
      }
    }

    let model = await this.prisma.vehicleModel.findFirst({
      where: { brandId: brand.id, name: { equals: modelName, mode: "insensitive" } },
    });
    if (!model) {
      try {
        model = await this.prisma.vehicleModel.create({ data: { name: modelName, brandId: brand.id } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          model = await this.prisma.vehicleModel.findFirstOrThrow({
            where: { brandId: brand.id, name: { equals: modelName, mode: "insensitive" } },
          });
        } else {
          throw error;
        }
      }
    }

    return {
      brand: { connect: { id: brand.id } },
      model: { connect: { id: model.id } },
    };
  }
}

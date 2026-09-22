import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@novoseminovo/db";
import {
  formatBRL,
  type CreateListingInput,
  type FinancingSimulationResult,
  type ListingSummary,
  type MyListingSummary,
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

  async getDetail(id: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      include: listingInclude,
    });
    if (!listing) throw new NotFoundException(`Anúncio ${id} não encontrado`);

    await this.prisma.listing.update({ where: { id }, data: { viewsCount: { increment: 1 } } });

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

    const listing = await this.prisma.listing.create({
      data: {
        type: assetType,
        ownerUserId,
        title,
        description,
        price,
        city,
        state,
        neighborhood,
        // MVP: sem fila de moderação ainda (ver Etapa 1 — painel do admin),
        // então o anúncio já nasce ativo e visível na busca.
        status: "active",
        publishedAt: new Date(),
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
      brand = await this.prisma.vehicleBrand.create({ data: { name: brandName } });
    }

    let model = await this.prisma.vehicleModel.findFirst({
      where: { brandId: brand.id, name: { equals: modelName, mode: "insensitive" } },
    });
    if (!model) {
      model = await this.prisma.vehicleModel.create({ data: { name: modelName, brandId: brand.id } });
    }

    return {
      brand: { connect: { id: brand.id } },
      model: { connect: { id: model.id } },
    };
  }
}

import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@novoseminovo/db";
import { formatBRL, type FinancingSimulationResult, type ListingSummary } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import {
  DEFAULT_RATE,
  listingInclude,
  priceAmortization,
  toListingDetail,
  toListingSummary,
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
}

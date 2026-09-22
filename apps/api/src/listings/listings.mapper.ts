import { Prisma } from "@novoseminovo/db";
import {
  formatBRL,
  type Badge,
  type ListingDetail,
  type ListingSummary,
  type MyListingSummary,
  type SellerType,
  type SpecItem,
} from "@novoseminovo/shared-types";

const listingWithDetails = Prisma.validator<Prisma.ListingDefaultArgs>()({
  include: {
    vehicleDetails: { include: { brand: true, model: true } },
    propertyDetails: true,
    photos: { orderBy: { position: "asc" } },
    partner: true,
  },
});

export type ListingWithDetails = Prisma.ListingGetPayload<typeof listingWithDetails>;

export const listingInclude = listingWithDetails.include;

const TRANSMISSION_LABEL: Record<string, string> = {
  manual: "Manual",
  automatic: "Automático",
};

const FUEL_LABEL: Record<string, string> = {
  flex: "Flex",
  gasoline: "Gasolina",
  ethanol: "Etanol",
  diesel: "Diesel",
  electric: "Elétrico",
  hybrid: "Híbrido",
};

const PROPERTY_TYPE_LABEL: Record<string, string> = {
  house: "Casa",
  apartment: "Apartamento",
  land: "Terreno",
  commercial: "Comercial",
};

function sellerType(listing: ListingWithDetails): SellerType {
  return listing.partnerId ? "partner" : "individual";
}

function location(listing: ListingWithDetails): string {
  return listing.neighborhood
    ? `${listing.neighborhood}, ${listing.city} - ${listing.state}`
    : `${listing.city} - ${listing.state}`;
}

function badge(listing: ListingWithDetails): Badge | undefined {
  const now = new Date();
  if (listing.highlightedUntil && listing.highlightedUntil > now) {
    return { label: "Destaque", tone: "purple" };
  }
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  if (listing.publishedAt && listing.publishedAt > twoWeeksAgo) {
    return { label: "Novo", tone: "green" };
  }
  return undefined;
}

function subtitle(listing: ListingWithDetails): string | undefined {
  if (listing.type === "vehicle" && listing.vehicleDetails) {
    const v = listing.vehicleDetails;
    const km = new Intl.NumberFormat("pt-BR").format(v.mileage);
    return `${km} km · ${TRANSMISSION_LABEL[v.transmission] ?? v.transmission} · ${FUEL_LABEL[v.fuelType] ?? v.fuelType}`;
  }
  if (listing.type === "property" && listing.propertyDetails) {
    const p = listing.propertyDetails;
    const parts = [`${p.areaM2} m²`];
    if (p.parkingSpots) parts.push(`${p.parkingSpots} vaga${p.parkingSpots > 1 ? "s" : ""}`);
    if (p.condoFee) parts.push(`Condomínio ${formatBRL(Number(p.condoFee))}`);
    return parts.join(" · ");
  }
  return undefined;
}

export function toListingSummary(listing: ListingWithDetails): ListingSummary {
  return {
    id: listing.id,
    assetType: listing.type,
    title: listing.title,
    subtitle: subtitle(listing),
    priceLabel: formatBRL(Number(listing.price)),
    location: location(listing),
    image: listing.photos[0]?.url,
    badge: badge(listing),
    sellerType: sellerType(listing),
    partnerSlug: listing.partner?.slug,
    partnerVerified: listing.partner ? Boolean(listing.partner.verifiedAt) : undefined,
  };
}

export function toMyListingSummary(listing: ListingWithDetails): MyListingSummary {
  return { ...toListingSummary(listing), status: listing.status };
}

function specs(listing: ListingWithDetails): SpecItem[] {
  if (listing.type === "vehicle" && listing.vehicleDetails) {
    const v = listing.vehicleDetails;
    return [
      { label: "Marca / Modelo", value: `${v.brand.name} ${v.model.name}` },
      { label: "Ano", value: `${v.yearManufacture}/${v.yearModel}` },
      { label: "Câmbio", value: TRANSMISSION_LABEL[v.transmission] ?? v.transmission },
      { label: "Combustível", value: FUEL_LABEL[v.fuelType] ?? v.fuelType },
      { label: "Quilometragem", value: `${new Intl.NumberFormat("pt-BR").format(v.mileage)} km` },
      { label: "Cor", value: v.color },
      ...(v.fipePrice
        ? [
            {
              label: "FIPE",
              value: `${formatBRL(Number(v.fipePrice))}${
                Number(v.fipePrice) > Number(listing.price) ? " (anúncio abaixo da FIPE)" : ""
              }`,
            },
          ]
        : []),
    ];
  }
  if (listing.type === "property" && listing.propertyDetails) {
    const p = listing.propertyDetails;
    return [
      { label: "Tipo", value: PROPERTY_TYPE_LABEL[p.propertyType] ?? p.propertyType },
      { label: "Área", value: `${p.areaM2} m²` },
      ...(p.bedrooms ? [{ label: "Quartos", value: String(p.bedrooms) }] : []),
      ...(p.parkingSpots ? [{ label: "Vagas", value: String(p.parkingSpots) }] : []),
      ...(p.condoFee ? [{ label: "Condomínio", value: `${formatBRL(Number(p.condoFee))}/mês` }] : []),
      ...(p.iptu ? [{ label: "IPTU", value: `${formatBRL(Number(p.iptu))}/mês` }] : []),
    ];
  }
  return [];
}

// Taxas padrão para a simulação exibida direto na página do anúncio (Etapa 3:
// calculadora do MVP, sem integração bancária real). A simulação sob medida
// (POST /listings/:id/financing-simulations) usa a mesma taxa por tipo.
export const DEFAULT_RATE = {
  vehicle: { monthly: 0.0139, label: "a partir de 1,39% a.m.", defaultInstallments: 48 },
  property: { monthly: Math.pow(1.109, 1 / 12) - 1, label: "a partir de 10,9% a.a. + TR", defaultInstallments: 360 },
} as const;

export function priceAmortization(principal: number, monthlyRate: number, installments: number): number {
  if (monthlyRate === 0) return principal / installments;
  const factor = Math.pow(1 + monthlyRate, installments);
  return (principal * monthlyRate * factor) / (factor - 1);
}

export function toListingDetail(listing: ListingWithDetails): ListingDetail {
  const price = Number(listing.price);
  const rateInfo = DEFAULT_RATE[listing.type];
  const downPaymentPct = 0.2;
  const downPayment = price * downPaymentPct;
  const installment = priceAmortization(price - downPayment, rateInfo.monthly, rateInfo.defaultInstallments);

  return {
    ...toListingSummary(listing),
    description: listing.description,
    specs: specs(listing),
    ownerUserId: listing.ownerUserId,
    financing: {
      price: formatBRL(price),
      downPayment: `${formatBRL(downPayment)} (${Math.round(downPaymentPct * 100)}%)`,
      installments: `${rateInfo.defaultInstallments}x de ${formatBRL(installment)}`,
      rate: rateInfo.label,
    },
  };
}

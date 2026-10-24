import { Prisma, type FuelType, type PropertyType, type Transmission } from "@novoseminovo/db";
import {
  PARTNER_LISTING_TIER,
  listingTier,
  VEHICLE_BODY_TYPE_OPTIONS,
  VEHICLE_STEERING_OPTIONS,
  youtubeVideoId,
  VEHICLE_CONDITION_OPTIONS,
  VEHICLE_FEATURE_OPTIONS,
  formatBRL,
  type Badge,
  type ListingDetail,
  type ListingSummary,
  type MyListingSummary,
  type SellerType,
  type SpecItem,
  PARTNER_HIGHLIGHT_RANK,
  highlightLevelFromRank,
  vehicleBrandVariants,
} from "@novoseminovo/shared-types";

const listingWithDetails = Prisma.validator<Prisma.ListingDefaultArgs>()({
  include: {
    vehicleDetails: { include: { brand: true, model: true } },
    propertyDetails: true,
    // Capa primeiro (isCover), depois por posição — photos[0] é sempre a
    // capa quando existe, com fallback pra primeira enviada.
    photos: { orderBy: [{ isCover: "desc" }, { position: "asc" }] },
    partner: true,
    // Só o telefone (nunca e-mail) — usado em toListingDetail para o botão
    // "Chamar no WhatsApp"; omitido quando o dono não cadastrou telefone.
    owner: { select: { phone: true } },
  },
});

export type ListingWithDetails = Prisma.ListingGetPayload<typeof listingWithDetails>;

export const listingInclude = listingWithDetails.include;

export type ListingFilterValues = {
  q?: string;
  city?: string;
  priceMin?: number;
  priceMax?: number;
  yearMin?: number;
  yearMax?: number;
  bedroomsMin?: number;
  brand?: string;
  model?: string;
  transmission?: string;
  fuelType?: string;
  mileageMax?: number;
  propertyType?: string;
  purpose?: string;
  neighborhood?: string;
  features?: string[];
  conditions?: string[];
  noAuction?: boolean;
  bodyType?: string;
};

// Compartilhado entre a busca pública (ListingsService.search, que faz o
// parse de string pra number antes de chamar isto) e o alerta de busca
// salva (SavedSearchesService.notifyMatches, que já recebe os valores
// tipados vindos do JSON salvo) — mesma regra de filtro nos dois lugares,
// uma pessoa só recebe alerta de anúncio que bateria nos filtros dela.
export function buildListingFilterWhere(
  assetType: "vehicle" | "property" | undefined,
  filters: ListingFilterValues,
): Prisma.ListingWhereInput {
  const {
    q,
    city,
    priceMin,
    priceMax,
    yearMin,
    yearMax,
    bedroomsMin,
    brand,
    model,
    transmission,
    fuelType,
    mileageMax,
    propertyType,
    purpose,
    neighborhood,
    features,
    conditions,
    noAuction,
    bodyType,
  } = filters;

  // vehicleDetails e propertyDetails acumulam condições em vez de serem
  // setados de uma vez só — "yearMin" (geral) e "brand"/"transmission"/etc.
  // (Etapa de categorias rápidas) são filtros independentes que podem vir
  // juntos, e um Prisma where só aceita uma chave "vehicleDetails" por nível.
  const vehicleDetails: Prisma.VehicleDetailsWhereInput = {};
  if (yearMin !== undefined || yearMax !== undefined) {
    vehicleDetails.yearModel = { ...(yearMin !== undefined ? { gte: yearMin } : {}), ...(yearMax !== undefined ? { lte: yearMax } : {}) };
  }
  if (brand) {
    vehicleDetails.brand = { OR: vehicleBrandVariants(brand).map((name) => ({ name: { equals: name, mode: "insensitive" as const } })) };
  }
  if (model) vehicleDetails.model = { name: { equals: model, mode: "insensitive" } };
  if (transmission) vehicleDetails.transmission = transmission as Transmission;
  if (fuelType) vehicleDetails.fuelType = fuelType as FuelType;
  if (mileageMax !== undefined) vehicleDetails.mileage = { lte: mileageMax };
  if (features?.length) vehicleDetails.features = { hasEvery: features };
  if (conditions?.length) vehicleDetails.conditions = { hasEvery: conditions };
  if (bodyType) vehicleDetails.bodyType = bodyType;
  if (noAuction) vehicleDetails.NOT = { conditions: { has: "auction" } };

  const propertyDetails: Prisma.PropertyDetailsWhereInput = {};
  if (bedroomsMin !== undefined) propertyDetails.bedrooms = { gte: bedroomsMin };
  if (propertyType) propertyDetails.propertyType = propertyType as PropertyType;
  if (purpose === "sale" || purpose === "rent") propertyDetails.purpose = purpose;

  return {
    ...(assetType ? { type: assetType } : {}),
    ...(city ? { city: { equals: city, mode: "insensitive" } } : {}),
    ...(neighborhood ? { neighborhood: { equals: neighborhood, mode: "insensitive" } } : {}),
    ...(priceMin !== undefined || priceMax !== undefined
      ? { price: { ...(priceMin !== undefined ? { gte: priceMin } : {}), ...(priceMax !== undefined ? { lte: priceMax } : {}) } }
      : {}),
    ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
    ...(Object.keys(vehicleDetails).length ? { vehicleDetails } : {}),
    ...(Object.keys(propertyDetails).length ? { propertyDetails } : {}),
  };
}

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
  penthouse: "Cobertura",
  farm: "Sítio/Chácara",
  warehouse: "Galpão",
  condo_house: "Casa em condomínio",
  studio: "Kitnet/Studio",
  store: "Loja",
  garage: "Garagem",
};

const VEHICLE_BODY_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  VEHICLE_BODY_TYPE_OPTIONS.map((option) => [option.value, option.label]),
);
const VEHICLE_STEERING_LABEL: Record<string, string> = Object.fromEntries(
  VEHICLE_STEERING_OPTIONS.map((option) => [option.value, option.label]),
);
const VEHICLE_FEATURE_LABEL: Record<string, string> = Object.fromEntries(
  VEHICLE_FEATURE_OPTIONS.map((option) => [option.value, option.label]),
);
const VEHICLE_CONDITION_LABEL: Record<string, string> = Object.fromEntries(
  VEHICLE_CONDITION_OPTIONS.map((option) => [option.value, option.label]),
);

const PROPERTY_FEATURE_LABEL: Record<string, string> = {
  pool: "Piscina",
  balcony: "Varanda/Sacada",
  barbecue: "Churrasqueira",
  elevator: "Elevador",
  gourmet_area: "Área gourmet",
  garden: "Jardim",
  furnished: "Mobiliado",
  concierge: "Portaria 24h",
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
  if (listing.partnerId && listing.tierRank >= PARTNER_HIGHLIGHT_RANK.super) return { label: "Super destaque", tone: "purple" };
  if ((listing.partnerId && listing.tierRank >= PARTNER_HIGHLIGHT_RANK.highlight) || (listing.highlightedUntil && listing.highlightedUntil > now)) {
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

// Ponto aproximado pro mapa: desloca a coordenada real até ~150 m, sempre
// igual pro mesmo anúncio (vem do id) — o marcador não pula a cada busca e
// ninguém chega na porta pelo mapa (o endereço completo é privado).
export function approximatePoint(id: string, lat: number, lng: number): { lat: number; lng: number } {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  const angle = ((hash >>> 0) % 360) * (Math.PI / 180);
  const distance = 60 + ((hash >>> 9) % 90); // metros
  const dLat = (distance * Math.cos(angle)) / 111_320;
  const dLng = (distance * Math.sin(angle)) / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { lat: Math.round((lat + dLat) * 1e5) / 1e5, lng: Math.round((lng + dLng) * 1e5) / 1e5 };
}

export function toListingSummary(listing: ListingWithDetails): ListingSummary {
  const point =
    listing.type === "property" && listing.latitude != null && listing.longitude != null
      ? approximatePoint(listing.id, listing.latitude, listing.longitude)
      : undefined;
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
    price: Number(listing.price),
    ...point,
  };
}

export function toMyListingSummary(listing: ListingWithDetails): MyListingSummary {
  return {
    ...toListingSummary(listing),
    status: listing.status,
    planTier: listing.partnerId ? undefined : listingTier(listing.planTier).id,
    highlightLevel: listing.partnerId ? highlightLevelFromRank(listing.tierRank) : undefined,
  };
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
      ...(v.bodyType ? [{ label: "Carroceria", value: VEHICLE_BODY_TYPE_LABEL[v.bodyType] ?? v.bodyType }] : []),
      ...(v.engine ? [{ label: "Motor", value: v.engine }] : []),
      ...(v.steering ? [{ label: "Direção", value: VEHICLE_STEERING_LABEL[v.steering] ?? v.steering }] : []),
      ...(v.doors ? [{ label: "Portas", value: String(v.doors) }] : []),
      ...(v.features.length ? [{ label: "Opcionais", value: v.features.map((f) => VEHICLE_FEATURE_LABEL[f] ?? f).join(", ") }] : []),
      ...(v.conditions.length
        ? [{ label: "Condições", value: v.conditions.map((c) => VEHICLE_CONDITION_LABEL[c] ?? c).join(", ") }]
        : []),
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
      ...(p.totalAreaM2 ? [{ label: "Área total do terreno", value: `${p.totalAreaM2} m²` }] : []),
      ...(p.bedrooms ? [{ label: "Quartos", value: String(p.bedrooms) }] : []),
      ...(p.suites ? [{ label: "Suítes", value: String(p.suites) }] : []),
      ...(p.bathrooms ? [{ label: "Banheiros", value: String(p.bathrooms) }] : []),
      ...(p.parkingSpots ? [{ label: "Vagas", value: String(p.parkingSpots) }] : []),
      ...(p.floor ? [{ label: "Andar", value: String(p.floor) }] : []),
      ...(p.condoFee ? [{ label: "Condomínio", value: `${formatBRL(Number(p.condoFee))}/mês` }] : []),
      ...(p.iptu ? [{ label: "IPTU", value: `${formatBRL(Number(p.iptu))}/mês` }] : []),
      ...(p.features.length
        ? [{ label: "Diferenciais", value: p.features.map((f) => PROPERTY_FEATURE_LABEL[f] ?? f).join(", ") }]
        : []),
    ];
  }
  return [];
}

// Taxas padrão para a simulação exibida direto na página do anúncio (Etapa 3:
// calculadora do MVP, sem integração bancária real). A simulação sob medida
// (POST /listings/:id/financing-simulations) usa a mesma taxa por tipo.
// defaultDownPaymentPct é só o chute inicial mostrado antes da pessoa mexer
// em qualquer coisa — financiamento de veículo no Brasil costuma ser
// anunciado "sem entrada"; imóvel usa o padrão de mercado de 20%.
export const DEFAULT_RATE = {
  vehicle: { monthly: 0.0139, label: "a partir de 1,39% a.m.", defaultInstallments: 48, defaultDownPaymentPct: 0 },
  property: {
    monthly: Math.pow(1.109, 1 / 12) - 1,
    label: "a partir de 10,9% a.a. + TR",
    defaultInstallments: 360,
    defaultDownPaymentPct: 0.2,
  },
} as const;

export function priceAmortization(principal: number, monthlyRate: number, installments: number): number {
  if (monthlyRate === 0) return principal / installments;
  const factor = Math.pow(1 + monthlyRate, installments);
  return (principal * monthlyRate * factor) / (factor - 1);
}

// Inverso de priceAmortization — usado pelo recomendador de veículo por
// perfil (ListingsService.recommendVehicle): a pessoa informa quanto cabe no
// orçamento por mês, isso vira o preço máximo de veículo que essa parcela
// financia.
// Photo.url nunca guarda o content-type original — mas o nome do arquivo
// salvo preserva a extensão de quando foi enviado (ver PhotoStorage.save),
// e o upload só aceita jpeg/png/webp (ver photosInterceptor), então a
// extensão já basta pra inferir de volta o mimetype pra reclassificação por
// IA (AiService.classifyVehiclePhotos).
export function mimeTypeFromUrl(url: string): "image/jpeg" | "image/png" | "image/webp" {
  const ext = url.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

export function principalFromInstallment(installment: number, monthlyRate: number, installments: number): number {
  if (installment <= 0) return 0;
  if (monthlyRate === 0) return installment * installments;
  const factor = Math.pow(1 + monthlyRate, installments);
  return (installment * (factor - 1)) / (monthlyRate * factor);
}

// O que o plano do anúncio libera (fotos/vídeo/posição). Anúncio de loja
// sempre tem o pacote do plano mensal (ver PARTNER_LISTING_TIER).
export function listingBenefits(listing: { partnerId: string | null; planTier: string }) {
  return listing.partnerId ? PARTNER_LISTING_TIER : listingTier(listing.planTier);
}

export function toListingDetail(
  listing: ListingWithDetails,
  reviewStatus: ListingDetail["reviewStatus"],
  // Dono/admin vê todas as fotos (e quantas o plano esconde); o público vê
  // só as que o plano libera.
  fullView = false,
): ListingDetail {
  const benefits = listingBenefits(listing);
  const visiblePhotos = fullView ? listing.photos : listing.photos.slice(0, benefits.photos);
  const hiddenPhotosCount = Math.max(0, listing.photos.length - benefits.photos);
  const price = Number(listing.price);
  const rateInfo = DEFAULT_RATE[listing.type];
  const downPaymentPct = rateInfo.defaultDownPaymentPct;
  const downPayment = price * downPaymentPct;
  const installment = priceAmortization(price - downPayment, rateInfo.monthly, rateInfo.defaultInstallments);

  return {
    ...toListingSummary(listing),
    description: listing.description,
    specs: specs(listing),
    ownerUserId: listing.ownerUserId,
    status: listing.status,
    // O vendedor pode esconder o WhatsApp no cadastro — aí só o chat fica.
    sellerPhone: listing.showPhone ? listing.owner.phone ?? undefined : undefined,
    reviewStatus,
    photos: visiblePhotos.map((photo) => ({ id: photo.id, url: photo.url })),
    vehicleId: listing.type === "vehicle" ? listing.vehicleDetails?.vehicleId ?? undefined : undefined,
    youtubeVideoId: benefits.video || fullView ? youtubeVideoId(listing.videoUrl ?? undefined) : undefined,
    planTier: listingTier(listing.planTier).id,
    isPartnerListing: Boolean(listing.partnerId),
    hiddenPhotosCount: fullView && hiddenPhotosCount > 0 ? hiddenPhotosCount : undefined,
    financingEnabled: listing.financingEnabled,
    financing: {
      price: formatBRL(price),
      priceValue: price,
      downPayment: `${formatBRL(downPayment)} (${Math.round(downPaymentPct * 100)}%)`,
      installments: `${rateInfo.defaultInstallments}x de ${formatBRL(installment)}`,
      rate: rateInfo.label,
    },
  };
}

import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type PropertyType } from "@novoseminovo/db";
import {
  formatBRL,
  type CreateListingInput,
  type CreateReviewInput,
  type FinancingSimulationResult,
  type ListingDetail,
  type ListingSummary,
  type MyListingSummary,
  type Photo,
  type PriceSuggestion,
  type Role,
  type UpdateListingStatusInput,
  type Priority,
  type PropertyPriority,
  type PropertyProfileInput,
  type PropertyRecommendation,
  type VehicleProfileInput,
  type VehicleRecommendation,
} from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { VehiclesService } from "../vehicles/vehicles.service";
import { FipeService } from "../vehicles/fipe.service";
import { getPhotoStorage } from "../common/storage";
import { LISTING_STATUSES_COUNTED_IN_PLAN_QUOTA } from "../partners/partners.service";
import { AiService } from "./ai.service";
import {
  DEFAULT_RATE,
  buildListingFilterWhere,
  listingInclude,
  mimeTypeFromUrl,
  priceAmortization,
  principalFromInstallment,
  toListingDetail,
  toListingSummary,
  toMyListingSummary,
  type ListingWithDetails,
} from "./listings.mapper";

// Não existe campo de "tipo de carroceria" (SUV/hatch/sedã) no schema (ver
// comentário em popularBrands acima) — esses atributos de VehicleDetails são
// o proxy mais próximo que já temos pra cada prioridade de perfil, usados
// tanto pra ordenar o fallback sem IA quanto, via candidateInfo, pro
// AiService.recommendVehicle levar isso em conta na escolha.
function vehicleProfileScore(listing: ListingWithDetails, budgetRangeMax: number, priority: Priority): number {
  const priceScore = Math.abs(Number(listing.price) - budgetRangeMax);
  const details = listing.vehicleDetails;
  if (!details) return priceScore;

  const ECONOMY_FUEL = new Set(["flex", "ethanol", "hybrid", "electric"]);
  let bonus = 0;
  if (priority === "economy" && ECONOMY_FUEL.has(details.fuelType)) bonus -= 3000;
  if (priority === "space" && (details.doors ?? 0) >= 4) bonus -= 3000;
  if (priority === "comfort" && details.transmission === "automatic") bonus -= 3000;
  if (priority === "reliability") bonus -= Math.max(0, 5000 - details.mileage * 0.02);

  return priceScore + bonus;
}

// Mesma ideia de vehicleProfileScore acima, pra imóvel. Sem campo de
// distância/trânsito no schema, "location" não tem proxy melhor que preço —
// cai de volta pro mesmo critério de proximidade do teto do orçamento.
function propertyProfileScore(listing: ListingWithDetails, budgetRangeMax: number, priority: PropertyPriority): number {
  const price = Number(listing.price);
  if (priority === "price") return price;

  const priceScore = Math.abs(price - budgetRangeMax);
  const details = listing.propertyDetails;
  if (!details) return priceScore;

  let bonus = 0;
  if (priority === "space") bonus -= Number(details.areaM2) * 10;
  if (priority === "condo_amenities" && details.condoFee) bonus -= 3000;
  if (priority === "low_maintenance") {
    if (details.propertyType === "apartment") bonus -= 2000;
    if (details.condoFee) bonus += Number(details.condoFee) * 2;
  }

  return priceScore + bonus;
}

export type ListingSearchQuery = {
  assetType?: string;
  q?: string;
  city?: string;
  priceMin?: string;
  priceMax?: string;
  yearMin?: string;
  yearMax?: string;
  bedroomsMin?: string;
  brand?: string;
  model?: string;
  transmission?: string;
  fuelType?: string;
  mileageMax?: string;
  propertyType?: string;
};

function toNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// Query string é texto livre — nunca confiar que "transmission=qualquercoisa"
// bate com o enum do Prisma. Valor fora da lista vira "sem filtro" em vez de
// estourar erro 500 no banco.
const TRANSMISSION_VALUES = new Set(["manual", "automatic"]);
const FUEL_TYPE_VALUES = new Set(["flex", "gasoline", "ethanol", "diesel", "electric", "hybrid"]);
const PROPERTY_TYPE_VALUES = new Set(["house", "apartment", "land", "commercial", "penthouse", "farm", "warehouse"]);

function toEnum<T extends string>(value: string | undefined, allowed: Set<T>): T | undefined {
  return value && allowed.has(value as T) ? (value as T) : undefined;
}

@Injectable()
export class ListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly vehicles: VehiclesService,
    private readonly fipe: FipeService,
    private readonly ai: AiService,
  ) {}

  async search(query: ListingSearchQuery): Promise<ListingSummary[]> {
    const assetType = query.assetType === "vehicle" || query.assetType === "property" ? query.assetType : undefined;
    const where: Prisma.ListingWhereInput = {
      status: "active",
      ...buildListingFilterWhere(assetType, {
        q: query.q,
        city: query.city,
        priceMin: toNumber(query.priceMin),
        priceMax: toNumber(query.priceMax),
        yearMin: toNumber(query.yearMin),
        yearMax: toNumber(query.yearMax),
        bedroomsMin: toNumber(query.bedroomsMin),
        brand: query.brand,
        model: query.model,
        transmission: toEnum(query.transmission, TRANSMISSION_VALUES),
        fuelType: toEnum(query.fuelType, FUEL_TYPE_VALUES),
        mileageMax: toNumber(query.mileageMax),
        propertyType: toEnum(query.propertyType, PROPERTY_TYPE_VALUES),
      }),
    };

    const listings = await this.prisma.listing.findMany({
      where,
      include: listingInclude,
      orderBy: [{ highlightedUntil: "desc" }, { publishedAt: "desc" }],
      take: 60,
    });

    return listings.map(toListingSummary);
  }

  // "Categorias rápidas" na home — marcas com pelo menos um anúncio ativo,
  // ordenadas pelas mais anunciadas. Sem campo de carroceria no schema
  // (SUV/Hatch/Sedã etc., como a Webmotors usa) pra oferecer algo parecido,
  // marca é o recorte mais próximo que já temos de verdade no banco.
  async popularBrands(limit = 8): Promise<string[]> {
    const brands = await this.prisma.vehicleBrand.findMany({
      where: { details: { some: { listing: { status: "active" } } } },
      orderBy: { details: { _count: "desc" } },
      take: limit,
      select: { name: true },
    });
    return brands.map((brand) => brand.name);
  }

  // "IA" aqui é estatística simples, de propósito: média de anúncios ativos
  // parecidos já na própria base, sem depender de nenhuma chave de API.
  // Menos de 3 anúncios parecidos = amostra pequena demais pra significar
  // algo, devolve undefined (o site esconde a sugestão nesse caso).
  async suggestPrice(query: {
    assetType?: string;
    brand?: string;
    model?: string;
    propertyType?: string;
    city?: string;
  }): Promise<PriceSuggestion | undefined> {
    const assetType = query.assetType === "vehicle" ? "vehicle" : query.assetType === "property" ? "property" : undefined;
    if (!assetType) return undefined;

    const where: Prisma.ListingWhereInput = { status: "active", type: assetType };
    if (assetType === "vehicle") {
      if (!query.brand || !query.model) return undefined;
      where.vehicleDetails = {
        brand: { name: { equals: query.brand, mode: "insensitive" } },
        model: { name: { equals: query.model, mode: "insensitive" } },
      };
    } else {
      const propertyType = toEnum(query.propertyType, PROPERTY_TYPE_VALUES);
      if (!propertyType || !query.city) return undefined;
      where.propertyDetails = { propertyType: propertyType as PropertyType };
      where.city = { equals: query.city, mode: "insensitive" };
    }

    const matches = await this.prisma.listing.findMany({ where, select: { price: true }, take: 200 });
    if (matches.length < 3) return undefined;

    const prices = matches.map((m) => Number(m.price)).sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    const median = prices.length % 2 === 0 ? (prices[mid - 1]! + prices[mid]!) / 2 : prices[mid]!;

    return { suggestedPrice: Math.round(median), sampleSize: prices.length };
  }

  // Botão "qual carro é ideal pra mim?". A faixa de orçamento (regra prática
  // de 10-15% da renda comprometida com o carro, nunca mais que metade do que
  // sobra depois dos gastos fixos) é calculada aqui, sem depender de IA —
  // só a escolha entre os candidatos elegíveis e o resumo consultivo usam
  // AiService, e tudo funciona em modo degradado (sem IA) se a chave não
  // estiver configurada, igual suggestPrice acima.
  async recommendVehicle(profile: VehicleProfileInput): Promise<VehicleRecommendation> {
    const rate = DEFAULT_RATE.vehicle.monthly;
    const disposableIncome = profile.monthlyIncome - profile.monthlyFixedExpenses;
    const ruleOfThumbMax = profile.monthlyIncome * 0.15;
    const safeMonthlyCarBudget = Math.max(0, Math.min(ruleOfThumbMax, disposableIncome * 0.5));
    // Do orçamento mensal com o carro, uma parte vira parcela e o resto cobre
    // seguro + combustível (não dá pra comprometer 100% com a parcela).
    const installmentBudget = safeMonthlyCarBudget * 0.7;
    const principal = principalFromInstallment(installmentBudget, rate, profile.installments);
    const budgetRangeMax = Math.round(principal + profile.availableDownPayment);
    const budgetRangeMin = Math.round(Math.max(0, budgetRangeMax * 0.6));

    const cityFilter = profile.preferredCity ? { city: { equals: profile.preferredCity, mode: "insensitive" as const } } : {};

    let candidates = await this.prisma.listing.findMany({
      where: {
        status: "active",
        type: "vehicle",
        price: { gte: budgetRangeMin * 0.7, lte: Math.max(budgetRangeMax * 1.15, 1) },
        ...cityFilter,
      },
      include: listingInclude,
      orderBy: { price: "asc" },
      take: 25,
    });

    // Faixa calculada pode não ter nenhum anúncio ativo (catálogo pequeno,
    // ou perfil muito apertado) — em vez de devolver vazio, alarga primeiro
    // soltando o preço (mantém a cidade, que foi escolha explícita da
    // pessoa) e, se ainda assim não achar nada, solta tudo.
    const withinBudget = candidates.length > 0;
    if (!withinBudget) {
      candidates = await this.prisma.listing.findMany({
        where: { status: "active", type: "vehicle", ...cityFilter },
        include: listingInclude,
        orderBy: { price: "asc" },
        take: 25,
      });
    }
    if (candidates.length === 0) {
      candidates = await this.prisma.listing.findMany({
        where: { status: "active", type: "vehicle" },
        include: listingInclude,
        orderBy: { price: "asc" },
        take: 25,
      });
    }

    if (this.ai.isEnabled() && candidates.length > 0) {
      const candidateInfo = candidates
        .filter((c) => c.vehicleDetails)
        .map((c) => ({
          id: c.id,
          title: c.title,
          price: Number(c.price),
          year: c.vehicleDetails!.yearModel,
          mileage: c.vehicleDetails!.mileage,
          fuelType: c.vehicleDetails!.fuelType,
          transmission: c.vehicleDetails!.transmission,
          doors: c.vehicleDetails!.doors ?? undefined,
          city: c.city,
        }));
      const summaries = new Map(candidates.map((c) => [c.id, toListingSummary(c)]));
      const { summary, recommendedListingIds } = await this.ai.recommendVehicle(
        profile,
        { min: budgetRangeMin, max: budgetRangeMax },
        candidateInfo,
        withinBudget,
      );
      return {
        budgetRangeMin,
        budgetRangeMax,
        summary,
        recommendations: recommendedListingIds.map((id) => summaries.get(id)).filter((s): s is ListingSummary => Boolean(s)),
      };
    }

    // Sem IA configurada (ou sem nenhum anúncio no catálogo): devolve só a
    // faixa de orçamento calculada + os anúncios mais alinhados ao perfil
    // (preço mais próximo do teto + atributo relevante pra prioridade
    // escolhida), sem o resumo consultivo — nunca quebra por falta de
    // ANTHROPIC_API_KEY.
    const fallbackRecommendations = candidates
      .slice()
      .sort((a, b) => vehicleProfileScore(a, budgetRangeMax, profile.priority) - vehicleProfileScore(b, budgetRangeMax, profile.priority))
      .slice(0, 5)
      .map(toListingSummary);

    return {
      budgetRangeMin,
      budgetRangeMax,
      summary:
        fallbackRecommendations.length === 0
          ? `Com base na sua renda e gastos, o ideal é um carro entre ${formatBRL(budgetRangeMin)} e ${formatBRL(budgetRangeMax)} — não encontramos nenhum anúncio ativo no catálogo agora.`
          : withinBudget
            ? `Com base na sua renda e gastos, o ideal é um carro entre ${formatBRL(budgetRangeMin)} e ${formatBRL(budgetRangeMax)}, considerando ${profile.installments}x de financiamento.`
            : `Com base na sua renda e gastos, o ideal seria um carro entre ${formatBRL(budgetRangeMin)} e ${formatBRL(budgetRangeMax)} — não há anúncios ativos exatamente nessa faixa agora, então mostramos as opções mais próximas do catálogo.`,
      recommendations: fallbackRecommendations,
    };
  }

  // Mesma ideia de recommendVehicle acima, pra imóvel — regra prática
  // diferente (bancos brasileiros costumam limitar a parcela do
  // financiamento imobiliário a ~30% da renda bruta, não os 10-15% do
  // carro) e filtra só imóveis à venda (não faz sentido recomendar aluguel
  // pra quem está calculando financiamento).
  async recommendProperty(profile: PropertyProfileInput): Promise<PropertyRecommendation> {
    const rate = DEFAULT_RATE.property.monthly;
    const disposableIncome = profile.monthlyIncome - profile.monthlyFixedExpenses;
    const ruleOfThumbMax = profile.monthlyIncome * 0.3;
    const safeMonthlyHousingBudget = Math.max(0, Math.min(ruleOfThumbMax, disposableIncome * 0.6));
    // Do orçamento mensal com o imóvel, uma parte vira parcela e o resto
    // cobre condomínio + IPTU.
    const installmentBudget = safeMonthlyHousingBudget * 0.75;
    const principal = principalFromInstallment(installmentBudget, rate, profile.installments);
    const budgetRangeMax = Math.round(principal + profile.availableDownPayment);
    const budgetRangeMin = Math.round(Math.max(0, budgetRangeMax * 0.6));

    const cityFilter = profile.preferredCity ? { city: { equals: profile.preferredCity, mode: "insensitive" as const } } : {};
    const neighborhoodFilter = profile.preferredNeighborhood
      ? { neighborhood: { equals: profile.preferredNeighborhood, mode: "insensitive" as const } }
      : {};
    const bedroomsFilter = profile.minBedrooms !== undefined ? { bedrooms: { gte: profile.minBedrooms } } : {};

    let candidates = await this.prisma.listing.findMany({
      where: {
        status: "active",
        type: "property",
        price: { gte: budgetRangeMin * 0.7, lte: Math.max(budgetRangeMax * 1.15, 1) },
        ...cityFilter,
        ...neighborhoodFilter,
        propertyDetails: { purpose: "sale", ...bedroomsFilter },
      },
      include: listingInclude,
      orderBy: { price: "asc" },
      take: 25,
    });

    // Igual a recommendVehicle, mas em mais estágios: bairro é uma escolha
    // bem mais estreita que cidade, então alarga soltando nessa ordem —
    // preço (calculado pelo sistema) primeiro, depois bairro (mais estreito),
    // depois cidade, e só por último os quartos mínimos — até achar algo ou
    // sobrar só "à venda".
    const withinBudget = candidates.length > 0;
    if (!withinBudget) {
      candidates = await this.prisma.listing.findMany({
        where: { status: "active", type: "property", ...cityFilter, ...neighborhoodFilter, propertyDetails: { purpose: "sale", ...bedroomsFilter } },
        include: listingInclude,
        orderBy: { price: "asc" },
        take: 25,
      });
    }
    if (candidates.length === 0) {
      candidates = await this.prisma.listing.findMany({
        where: { status: "active", type: "property", ...cityFilter, propertyDetails: { purpose: "sale", ...bedroomsFilter } },
        include: listingInclude,
        orderBy: { price: "asc" },
        take: 25,
      });
    }
    if (candidates.length === 0) {
      candidates = await this.prisma.listing.findMany({
        where: { status: "active", type: "property", propertyDetails: { purpose: "sale", ...bedroomsFilter } },
        include: listingInclude,
        orderBy: { price: "asc" },
        take: 25,
      });
    }
    if (candidates.length === 0) {
      candidates = await this.prisma.listing.findMany({
        where: { status: "active", type: "property", propertyDetails: { purpose: "sale" } },
        include: listingInclude,
        orderBy: { price: "asc" },
        take: 25,
      });
    }

    if (this.ai.isEnabled() && candidates.length > 0) {
      const candidateInfo = candidates
        .filter((c) => c.propertyDetails)
        .map((c) => ({
          id: c.id,
          title: c.title,
          price: Number(c.price),
          propertyType: c.propertyDetails!.propertyType,
          areaM2: Number(c.propertyDetails!.areaM2),
          bedrooms: c.propertyDetails!.bedrooms ?? undefined,
          city: c.city,
          neighborhood: c.neighborhood ?? undefined,
        }));
      const summaries = new Map(candidates.map((c) => [c.id, toListingSummary(c)]));
      const { summary, recommendedListingIds } = await this.ai.recommendProperty(
        profile,
        { min: budgetRangeMin, max: budgetRangeMax },
        candidateInfo,
        withinBudget,
      );
      return {
        budgetRangeMin,
        budgetRangeMax,
        summary,
        recommendations: recommendedListingIds.map((id) => summaries.get(id)).filter((s): s is ListingSummary => Boolean(s)),
      };
    }

    const fallbackRecommendations = candidates
      .slice()
      .sort((a, b) => propertyProfileScore(a, budgetRangeMax, profile.priority) - propertyProfileScore(b, budgetRangeMax, profile.priority))
      .slice(0, 5)
      .map(toListingSummary);

    return {
      budgetRangeMin,
      budgetRangeMax,
      summary:
        fallbackRecommendations.length === 0
          ? `Com base na sua renda e gastos, o ideal é um imóvel entre ${formatBRL(budgetRangeMin)} e ${formatBRL(budgetRangeMax)} — não encontramos nenhum anúncio à venda no catálogo agora.`
          : withinBudget
            ? `Com base na sua renda e gastos, o ideal é um imóvel entre ${formatBRL(budgetRangeMin)} e ${formatBRL(budgetRangeMax)}, considerando ${profile.installments}x de financiamento.`
            : `Com base na sua renda e gastos, o ideal seria um imóvel entre ${formatBRL(budgetRangeMin)} e ${formatBRL(budgetRangeMax)} — não há anúncios ativos exatamente nessa faixa agora, então mostramos as opções mais próximas do catálogo.`,
      recommendations: fallbackRecommendations,
    };
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

    const reviewStatus = await this.getReviewStatus(listing.id, listing.ownerUserId, viewer?.id);
    return toListingDetail(listing, reviewStatus);
  }

  // "can_review" exige ter conversado sobre o anúncio — sem isso, qualquer
  // visitante logado poderia avaliar sem nunca ter interagido com o
  // vendedor/loja. Dono do próprio anúncio e visitante anônimo nunca avaliam.
  private async getReviewStatus(
    listingId: string,
    ownerUserId: string,
    viewerId: string | undefined,
  ): Promise<ListingDetail["reviewStatus"]> {
    if (!viewerId || viewerId === ownerUserId) return "not_eligible";

    const hasConversation = await this.prisma.conversation.findFirst({
      where: { listingId, buyerId: viewerId },
    });
    if (!hasConversation) return "not_eligible";

    const existingReview = await this.prisma.review.findFirst({
      where: { listingId, reviewerId: viewerId },
    });
    return existingReview ? "already_reviewed" : "can_review";
  }

  async createReview(listingId: string, reviewerId: string, input: CreateReviewInput): Promise<void> {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException(`Anúncio ${listingId} não encontrado`);
    if (listing.ownerUserId === reviewerId) {
      throw new BadRequestException("Você não pode avaliar o seu próprio anúncio.");
    }

    const hasConversation = await this.prisma.conversation.findFirst({
      where: { listingId, buyerId: reviewerId },
    });
    if (!hasConversation) {
      throw new ForbiddenException("Você precisa ter conversado sobre este anúncio pra avaliar.");
    }

    const existingReview = await this.prisma.review.findFirst({ where: { listingId, reviewerId } });
    if (existingReview) throw new ConflictException("Você já avaliou este anúncio.");

    await this.prisma.review.create({
      data: {
        reviewerId,
        listingId,
        rating: input.rating,
        comment: input.comment,
        reviewedUserId: listing.partnerId ? undefined : listing.ownerUserId,
        reviewedPartnerId: listing.partnerId ?? undefined,
      },
    });

    const recipientId = listing.partnerId
      ? (await this.prisma.partner.findUnique({ where: { id: listing.partnerId } }))?.ownerUserId
      : listing.ownerUserId;
    if (recipientId) {
      await this.notifications.notify(recipientId, "new_review", {
        listingId: listing.id,
        listingTitle: listing.title,
        rating: input.rating,
      });
    }
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

    // Quem tem uma loja/imobiliária cadastrada (dono ou membro da equipe,
    // ver PartnerMember) anuncia sempre em nome dela — é isso que liga o
    // anúncio ao painel do parceiro (estoque, leads, vitrine).
    const partner = await this.prisma.partner.findFirst({
      where: { OR: [{ ownerUserId }, { members: { some: { userId: ownerUserId } } }] },
    });

    // Limite de anúncios só existe pra quem tem plano ativo — sem isso, o
    // comportamento de sempre (sem limite nenhum) continua valendo, inclusive
    // pra quem tem loja mas nunca contratou um plano.
    if (partner) {
      const subscription = await this.prisma.subscription.findFirst({
        where: { partnerId: partner.id, status: "active" },
        include: { plan: true },
      });
      if (subscription) {
        const currentCount = await this.prisma.listing.count({
          where: { partnerId: partner.id, status: { in: [...LISTING_STATUSES_COUNTED_IN_PLAN_QUOTA] } },
        });
        if (currentCount >= subscription.plan.maxActiveListings) {
          throw new ConflictException(
            `Seu plano atual (${subscription.plan.name}) permite até ${subscription.plan.maxActiveListings} anúncios. Pause ou encerre um anúncio, ou contrate um plano com mais limite em /parceiro/plano.`,
          );
        }
      }
    }

    // Resolvido antes do create: precisamos do brandId/modelId já definidos
    // (como string, não como { connect }) pra procurar/criar o Vehicle com a
    // mesma placa — ver VehiclesService.resolveForListing.
    let vehicleBrandModel: Awaited<ReturnType<typeof this.vehicles.resolveBrandAndModel>> | undefined;
    let linkedVehicleId: string | undefined;
    let fipeMatch: { fipeCode: string; price: number } | undefined;
    if (assetType === "vehicle") {
      vehicleBrandModel = await this.vehicles.resolveBrandAndModel(input.brand, input.model);
      // Best-effort — nunca atrasa nem derruba a criação do anúncio se a
      // FIPE estiver fora do ar ou não reconhecer marca/modelo (ver FipeService).
      fipeMatch = await this.fipe.lookupPrice(input.brand, input.model, input.yearModel);
      if (input.plate) {
        linkedVehicleId = await this.vehicles.resolveForListing({
          plate: input.plate,
          ownerUserId,
          brandId: vehicleBrandModel.brand.connect.id,
          modelId: vehicleBrandModel.model.connect.id,
          yearManufacture: input.yearManufacture,
          yearModel: input.yearModel,
          color: input.color,
        });
      }
    }

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
                  ...vehicleBrandModel!,
                  version: input.version,
                  yearManufacture: input.yearManufacture,
                  yearModel: input.yearModel,
                  mileage: input.mileage,
                  transmission: input.transmission,
                  fuelType: input.fuelType,
                  color: input.color,
                  doors: input.doors,
                  condition: "used",
                  fipeCode: fipeMatch?.fipeCode,
                  fipePrice: fipeMatch?.price,
                  ...(linkedVehicleId ? { vehicle: { connect: { id: linkedVehicleId } } } : {}),
                },
              },
            }
          : {
              propertyDetails: {
                create: {
                  propertyType: input.propertyType,
                  purpose: input.purpose,
                  bedrooms: input.bedrooms,
                  suites: input.suites,
                  bathrooms: input.bathrooms,
                  parkingSpots: input.parkingSpots,
                  floor: input.floor,
                  areaM2: input.areaM2,
                  totalAreaM2: input.totalAreaM2,
                  condoFee: input.condoFee,
                  iptu: input.iptu,
                  features: input.features ?? [],
                  streetAddress: input.streetAddress,
                },
              },
            }),
      },
      include: listingInclude,
    });

    if (linkedVehicleId) {
      await this.vehicles.logListingPublished(linkedVehicleId, ownerUserId, listing.title);
    }

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
      data:
        input.status === "sold"
          ? { status: input.status, soldAt: new Date(), soldPrice: input.soldPrice ?? listing.price }
          : { status: input.status },
      include: listingInclude,
    });
    return toMyListingSummary(updated);
  }

  async addPhotos(
    listingId: string,
    ownerUserId: string,
    files: Express.Multer.File[],
  ): Promise<Photo[]> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: { photos: true },
    });
    if (!listing) throw new NotFoundException(`Anúncio ${listingId} não encontrado`);
    if (listing.ownerUserId !== ownerUserId) {
      throw new ForbiddenException("Você só pode editar os seus próprios anúncios.");
    }

    const startPosition = listing.photos.length;
    const alreadyHasCover = listing.photos.some((photo) => photo.isCover);

    const storage = getPhotoStorage();
    const urls = await Promise.all(files.map((file) => storage.save(file.buffer, file.originalname, file.mimetype)));

    await this.prisma.photo.createMany({
      data: urls.map((url, index) => ({
        listingId,
        url,
        position: startPosition + index,
        isCover: !alreadyHasCover && index === 0,
      })),
    });

    const photos = await this.prisma.photo.findMany({
      where: { listingId },
      orderBy: [{ isCover: "desc" }, { position: "asc" }],
    });
    return photos.map((photo) => ({ id: photo.id, url: photo.url }));
  }

  async removePhoto(listingId: string, ownerUserId: string, photoId: string): Promise<void> {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException(`Anúncio ${listingId} não encontrado`);
    if (listing.ownerUserId !== ownerUserId) {
      throw new ForbiddenException("Você só pode editar os seus próprios anúncios.");
    }

    const photo = await this.prisma.photo.findUnique({ where: { id: photoId } });
    if (!photo || photo.listingId !== listingId) {
      throw new NotFoundException(`Foto ${photoId} não encontrada`);
    }

    await this.prisma.photo.delete({ where: { id: photoId } });
    // PhotoStorage.remove nunca lança (ver common/storage.ts) — um arquivo
    // que já sumiu do backend não deve impedir a remoção do registro.
    await getPhotoStorage().remove(photo.url);

    if (photo.isCover) {
      const next = await this.prisma.photo.findFirst({ where: { listingId }, orderBy: { position: "asc" } });
      if (next) await this.prisma.photo.update({ where: { id: next.id }, data: { isCover: true } });
    }
  }

  // Disparado pela página de fotos logo depois do upload, se a IA estiver
  // habilitada (ver addPhotos acima). Lê de volta os arquivos já salvos
  // (PhotoStorage.read) e manda pro AiService classificar/ordenar/legendar.
  // Sem ANTHROPIC_API_KEY, devolve as fotos como estão, sem quebrar o
  // upload — a pessoa sempre pode reordenar/legendar na mão depois.
  async classifyPhotos(listingId: string, ownerUserId: string): Promise<Photo[]> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: { photos: { orderBy: { position: "asc" } } },
    });
    if (!listing) throw new NotFoundException(`Anúncio ${listingId} não encontrado`);
    if (listing.ownerUserId !== ownerUserId) {
      throw new ForbiddenException("Você só pode editar os seus próprios anúncios.");
    }
    if (!this.ai.isEnabled() || listing.photos.length === 0) {
      return listing.photos.map((p) => ({ id: p.id, url: p.url, caption: p.caption ?? undefined }));
    }

    const storage = getPhotoStorage();
    const photosForAi = await Promise.all(
      listing.photos.map(async (photo) => ({
        id: photo.id,
        buffer: await storage.read(photo.url),
        mimeType: mimeTypeFromUrl(photo.url),
      })),
    );

    const { photos: classified, coverPhotoId } =
      listing.type === "vehicle"
        ? await this.ai.classifyVehiclePhotos(photosForAi)
        : await this.ai.classifyPropertyPhotos(photosForAi);

    // Fotos que a IA não devolveu (ex.: resposta parcial) ficam no fim, na
    // ordem em que já estavam — nunca somem da galeria por causa disso.
    const classifiedIds = new Set(classified.map((c) => c.photoId));
    const orderedIds = [
      ...classified.sort((a, b) => a.order - b.order).map((c) => c.photoId),
      ...listing.photos.filter((p) => !classifiedIds.has(p.id)).map((p) => p.id),
    ];
    const captionByPhotoId = new Map(classified.map((c) => [c.photoId, c.caption]));

    await this.prisma.$transaction(
      orderedIds.map((photoId, index) =>
        this.prisma.photo.update({
          where: { id: photoId },
          data: {
            position: index,
            isCover: coverPhotoId ? photoId === coverPhotoId : index === 0,
            ...(captionByPhotoId.has(photoId) ? { caption: captionByPhotoId.get(photoId) } : {}),
          },
        }),
      ),
    );

    const updated = await this.prisma.photo.findMany({ where: { listingId }, orderBy: { position: "asc" } });
    return updated.map((p) => ({ id: p.id, url: p.url, caption: p.caption ?? undefined }));
  }

  // Reordenação manual na galeria (arrastar/soltar, escolher capa) — a
  // sugestão da IA acima nunca é a palavra final, só o ponto de partida.
  async reorderPhotos(
    listingId: string,
    ownerUserId: string,
    order: string[],
    coverPhotoId: string | undefined,
  ): Promise<Photo[]> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: { photos: true },
    });
    if (!listing) throw new NotFoundException(`Anúncio ${listingId} não encontrado`);
    if (listing.ownerUserId !== ownerUserId) {
      throw new ForbiddenException("Você só pode editar os seus próprios anúncios.");
    }

    const existingIds = new Set(listing.photos.map((p) => p.id));
    if (order.length !== existingIds.size || !order.every((id) => existingIds.has(id))) {
      throw new BadRequestException("A lista de ordenação precisa conter exatamente as fotos deste anúncio.");
    }
    if (coverPhotoId && !existingIds.has(coverPhotoId)) {
      throw new BadRequestException("A foto escolhida como capa não pertence a este anúncio.");
    }

    await this.prisma.$transaction(
      order.map((photoId, index) =>
        this.prisma.photo.update({
          where: { id: photoId },
          data: {
            position: index,
            ...(coverPhotoId ? { isCover: photoId === coverPhotoId } : {}),
          },
        }),
      ),
    );

    const updated = await this.prisma.photo.findMany({ where: { listingId }, orderBy: { position: "asc" } });
    return updated.map((p) => ({ id: p.id, url: p.url, caption: p.caption ?? undefined }));
  }

  async updatePhotoCaption(listingId: string, ownerUserId: string, photoId: string, caption: string): Promise<void> {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException(`Anúncio ${listingId} não encontrado`);
    if (listing.ownerUserId !== ownerUserId) {
      throw new ForbiddenException("Você só pode editar os seus próprios anúncios.");
    }

    const photo = await this.prisma.photo.findUnique({ where: { id: photoId } });
    if (!photo || photo.listingId !== listingId) {
      throw new NotFoundException(`Foto ${photoId} não encontrada`);
    }

    await this.prisma.photo.update({ where: { id: photoId }, data: { caption } });
  }
}

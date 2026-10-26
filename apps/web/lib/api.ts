import type {
  AdminAffiliateDetail,
  AdminAffiliateRow,
  AffiliateApplyInput,
  AffiliateDashboard,
  ArchitectMessageInput,
  ArchitectSessionView,
  CnpjLookup,
  HighlightLevel,
  RegisterCompanyInput,
  StartBoostResult,
  CreateLeadInput,
  UpdateLeadInput,
  UpdateSaleInput,
  FipeModelSuggestion,
  AdminOverview,
  AdminOverviewScope,
  OpsGoalInput,
  OpsSummary,
  MarketingSummary,
  AdminListingsPage,
  AdminListingActionInput,
  MarketingPostInput,
  MarketingDecisionInput,
  EmailCampaignInput,
  StoreEarningInput,
  FipePrice,
  FipeVersion,
  SubscriptionBoardCard,
  CreatedPartnerApiKey,
  IntegrationFeed,
  IntegrationFeedFormat,
  IntegrationOverview,
  AgentConversationView,
  AgentKind,
  AgentReply,
  AgentStatus,
  AiStatus,
  FinancingLeadStatus,
  FinancingLeadSummary,
  UpdateFinancingLeadInput,
  ConversationDetail,
  ConversationSummary,
  CreateListingInput,
  CreatePartnerInput,
  CreateReviewInput,
  CreateSavedSearchInput,
  CrlvExtractResult,
  EligibleListing,
  FeaturedPartner,
  FinancingDeal,
  FinancingDealStatus,
  FinancingSimulationResult,
  LeadStatus,
  LeadSummary,
  ListingDetail,
  ListingStatus,
  ListingSummary,
  ModerateListingInput,
  ModerationLogEntry,
  MyListingSummary,
  MyRebatesSummary,
  Notification,
  Partner,
  PartnerMember,
  PartnerStorefront,
  PendingListing,
  PendingPartner,
  PendingReport,
  PaymentsStatus,
  Photo,
  Plan,
  PriceSuggestion,
  Profile,
  RebateTier,
  RegisterFinancingDealInput,
  ReportStatus,
  UpdateProfileInput,
  SavedSearch,
  GenerateListingDraftInput,
  ListingDraft,
  PendingServiceConfirmation,
  PropertyProfileInput,
  PropertyRecommendation,
  RegisterVehicleInput,
  ReorderPhotosInput,
  SaleSummary,
  VehicleEvent,
  VehicleProfile,
  VehicleProfileInput,
  VehicleRecommendation,
  WorkshopOption,
} from "@novoseminovo/shared-types";
import { getListing, getVehicleProfile, listListings } from "@/lib/mock-data";

// apps/api (NestJS) implementa estes três endpoints sobre o schema de
// packages/db. Sem NEXT_PUBLIC_API_URL configurada, ou com a API fora do ar
// (comum em dev sem Postgres local), as páginas caem de volta para os dados
// de exemplo em lib/mock-data.ts — mesmo formato dos dois lados.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Dados de exemplo (mock-data.ts) só em desenvolvimento. Em produção, API
// fora do ar mostrando anúncio de exemplo seria anúncio falso pro visitante
// — ali a falha vira erro (app/error.tsx avisa "instabilidade") e as seções
// secundárias (marcas, lojas em destaque) só somem.
const USE_MOCK_FALLBACK = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_USE_MOCK_DATA === "1";

export class ApiUnavailableError extends Error {
  constructor() {
    super("API do NovoSeminovo indisponível");
  }
}

function mockOr<T>(mock: () => T, productionFallback?: T): T {
  if (USE_MOCK_FALLBACK) return mock();
  if (productionFallback !== undefined) return productionFallback;
  throw new ApiUnavailableError();
}

// Fotos de anúncio vêm da API como caminho relativo (/uploads/...), porque é
// lá que o arquivo é servido (ver apps/api/src/main.ts) — o navegador
// resolveria isso contra o domínio do site, não da API, então quebra sem
// este prefixo. URL de mock-data.ts já vem absoluta e passa direto.
export function resolveMediaUrl(url: string): string {
  return url.startsWith("http") ? url : `${API_URL}${url}`;
}

// 1.5s era o padrão original — curto demais pra uma chamada de verdade
// passando pela internet (fica instantâneo em dev local contra a API no
// mesmo host, então isso só dava problema em produção; ver bug real
// reportado em /anuncio/[id], "Não foi possível simular agora"). 4s dá
// folga suficiente sem deixar a UI travada se a API estiver genuinamente
// fora do ar — quem precisa de mais (upload de foto) já passa um valor maior.
async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 4000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timeout);
  }
}

export type SearchParams = {
  assetType?: "vehicle" | "property";
  q?: string;
  city?: string;
  priceMin?: number;
  priceMax?: number;
  yearMin?: number;
  yearMax?: number;
  bedroomsMin?: number;
  brand?: string;
  transmission?: string;
  fuelType?: string;
  mileageMax?: number;
  propertyType?: string;
  purpose?: "sale" | "rent";
  neighborhood?: string;
  limit?: number;
  bbox?: string;
  // Lista separada por vírgula (ver VEHICLE_FEATURE_OPTIONS/VEHICLE_CONDITION_OPTIONS).
  features?: string;
  conditions?: string;
  noAuction?: "1";
  bodyType?: string;
};

export async function fetchListings(params: SearchParams): Promise<ListingSummary[]> {
  try {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) query.set(key, String(value));
    }
    const res = await fetchWithTimeout(`${API_URL}/listings?${query.toString()}`);
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as ListingSummary[];
  } catch {
    return mockOr(() => listListings(params.assetType));
  }
}

// accessToken é opcional (busca pública), mas sem ele o dono não vê o próprio
// anúncio antes de aprovado — a API só libera pending_review/rejected para
// quem é dono ou admin (ver ListingsService.getDetail).
const MOCK_FEATURED_PARTNERS: FeaturedPartner[] = [
  { slug: "imobiliaria-savassi", legalName: "Imobiliária Savassi" },
  { slug: "auto-center-bh", legalName: "Auto Center BH" },
  { slug: "veiculos-buritis", legalName: "Veículos Buritis" },
];

export async function fetchFeaturedPartners(forAssetType?: "vehicle" | "property"): Promise<FeaturedPartner[]> {
  try {
    const query = forAssetType ? `?for=${forAssetType}` : "";
    const res = await fetchWithTimeout(`${API_URL}/partners${query}`);
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as FeaturedPartner[];
  } catch {
    return mockOr(() => MOCK_FEATURED_PARTNERS, []);
  }
}

const MOCK_POPULAR_BRANDS = ["Toyota", "Honda", "Volkswagen", "Hyundai", "Jeep", "Chevrolet"];

export async function fetchPopularBrands(): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/listings/popular-brands`);
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as string[];
  } catch {
    return mockOr(() => MOCK_POPULAR_BRANDS, []);
  }
}

// "IA" de preço (ver ListingsService.suggestPrice) — sem mock fallback de
// propósito: sem API, melhor não sugerir nada do que inventar um preço.
export async function fetchPriceSuggestion(query: {
  assetType: "vehicle" | "property";
  brand?: string;
  model?: string;
  propertyType?: string;
  city?: string;
}): Promise<PriceSuggestion | undefined> {
  try {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value) params.set(key, value);
    }
    const res = await fetchWithTimeout(`${API_URL}/listings/price-suggestion?${params.toString()}`);
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    const body = await res.json();
    return body?.suggestedPrice ? (body as PriceSuggestion) : undefined;
  } catch {
    return undefined;
  }
}

export async function fetchListing(id: string, accessToken?: string): Promise<ListingDetail | undefined> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/listings/${id}`, {
      headers: accessToken ? authHeaders(accessToken) : undefined,
    });
    if (res.status === 404) return undefined;
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as ListingDetail;
  } catch {
    return mockOr(() => getListing(id));
  }
}

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

// Passaporte Digital do veículo — perfil persistente do carro, separado do
// anúncio (ver GET /vehicles/:id na API). Público de propósito: funciona
// como prova de confiança só se qualquer comprador conseguir ver antes de
// comprar, sem precisar estar logado.
export async function fetchVehicleProfile(id: string, accessToken?: string): Promise<VehicleProfile | undefined> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/vehicles/${id}`, {
      headers: accessToken ? authHeaders(accessToken) : undefined,
    });
    if (res.status === 404) return undefined;
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as VehicleProfile;
  } catch {
    return mockOr(() => getVehicleProfile(id));
  }
}

// "Meus veículos" — sem mock fallback de propósito: é uma lista pessoal
// (depende de quem está logado), não tem sentido mostrar dado de exemplo.
export async function fetchMyVehicles(accessToken: string): Promise<VehicleProfile[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/vehicles/mine`, { headers: authHeaders(accessToken) });
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as VehicleProfile[];
  } catch {
    return [];
  }
}

export async function registerVehicle(
  input: RegisterVehicleInput,
  accessToken: string,
): Promise<{ ok: true; vehicle: VehicleProfile } | { ok: false; error: string }> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/vehicles`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => undefined);
      return { ok: false, error: body?.message ?? `API respondeu ${res.status}` };
    }
    return { ok: true, vehicle: (await res.json()) as VehicleProfile };
  } catch {
    return { ok: false, error: "Não foi possível cadastrar o veículo agora. Tente de novo em instantes." };
  }
}

// Multipart, não JSON: o comprovante (foto) é obrigatório (ver
// VehiclesController.addEvent na API), então metadados e arquivo viajam
// juntos numa requisição só.
export async function addVehicleEvent(
  vehicleId: string,
  formData: FormData,
  accessToken: string,
): Promise<{ ok: true; event: VehicleEvent } | { ok: false; error: string }> {
  try {
    const res = await fetchWithTimeout(
      `${API_URL}/vehicles/${vehicleId}/events`,
      { method: "POST", headers: authHeaders(accessToken), body: formData },
      20000,
    );
    const body = await res.json().catch(() => undefined);
    if (!res.ok) return { ok: false, error: body?.message ?? `API respondeu ${res.status}` };
    return { ok: true, event: body as VehicleEvent };
  } catch {
    return { ok: false, error: "Não foi possível registrar o evento agora. Tente de novo em instantes." };
  }
}

// Consulta pública por placa — "Passaporte consultável" sem precisar do link
// direto do anúncio ou de "Meus veículos". Sem mock fallback: é uma busca ao
// vivo, não tem dado de exemplo que faça sentido "encontrar".
export async function fetchVehicleByPlate(plate: string, accessToken?: string): Promise<VehicleProfile | undefined> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/vehicles/by-plate/${encodeURIComponent(plate)}`, {
      headers: accessToken ? authHeaders(accessToken) : undefined,
    });
    if (res.status === 404) return undefined;
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as VehicleProfile;
  } catch {
    return undefined;
  }
}

export async function fetchWorkshopOptions(): Promise<WorkshopOption[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/vehicles/workshops`);
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as WorkshopOption[];
  } catch {
    return [];
  }
}

export async function fetchPendingServiceConfirmations(accessToken: string): Promise<PendingServiceConfirmation[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/vehicles/pending-confirmations`, {
      headers: authHeaders(accessToken),
    });
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as PendingServiceConfirmation[];
  } catch {
    return [];
  }
}

export async function confirmVehicleService(
  eventId: string,
  accessToken: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/vehicles/events/${eventId}/confirm`, {
      method: "POST",
      headers: authHeaders(accessToken),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => undefined);
      return { ok: false, error: body?.message ?? `API respondeu ${res.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Não foi possível confirmar agora. Tente de novo em instantes." };
  }
}

// Favoritos exigem a API no ar (não têm equivalente em mock-data.ts — não há
// conceito de usuário logado nos dados de exemplo). Falha de rede aqui
// degrada para "nada favoritado" em vez de quebrar a página.
export async function fetchMyFavoriteIds(accessToken: string): Promise<Set<string>> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/me/favorites/ids`, { headers: authHeaders(accessToken) });
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return new Set((await res.json()) as string[]);
  } catch {
    return new Set();
  }
}

export async function fetchMyFavorites(accessToken: string): Promise<ListingSummary[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/me/favorites`, { headers: authHeaders(accessToken) });
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as ListingSummary[];
  } catch {
    return [];
  }
}

export async function setFavorite(
  listingId: string,
  favorited: boolean,
  accessToken: string,
): Promise<boolean> {
  const res = await fetchWithTimeout(`${API_URL}/listings/${listingId}/favorite`, {
    method: favorited ? "POST" : "DELETE",
    headers: authHeaders(accessToken),
  });
  return res.ok;
}

// Criar/gerenciar anúncio exige a API no ar, como favoritos — sem
// equivalente em mock-data.ts.
export async function fetchMyListings(accessToken: string): Promise<MyListingSummary[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/listings/mine`, { headers: authHeaders(accessToken) });
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as MyListingSummary[];
  } catch {
    return [];
  }
}

export type CreateListingResult =
  | { ok: true; listing: MyListingSummary }
  | { ok: false; error: string };

export async function createListing(input: CreateListingInput, accessToken: string): Promise<CreateListingResult> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/listings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
      body: JSON.stringify(input),
    });
    const body = await res.json();
    if (!res.ok) return { ok: false, error: body.message ?? "Não foi possível criar o anúncio." };
    return { ok: true, listing: body as MyListingSummary };
  } catch {
    return { ok: false, error: "Não foi possível falar com o servidor. Tente novamente." };
  }
}

// Fotos do anúncio — upload em disco local por enquanto (ver
// apps/api/src/common/uploads.ts). Sem "Content-Type" manual: o runtime
// define o boundary multipart sozinho a partir do FormData.
export type UploadPhotosResult = { ok: true; photos: Photo[] } | { ok: false; error: string };

export async function uploadListingPhotos(
  listingId: string,
  formData: FormData,
  accessToken: string,
): Promise<UploadPhotosResult> {
  try {
    const res = await fetchWithTimeout(
      `${API_URL}/listings/${listingId}/photos`,
      { method: "POST", headers: authHeaders(accessToken), body: formData },
      20000,
    );
    const body = await res.json();
    if (!res.ok) return { ok: false, error: body.message ?? "Não foi possível enviar as fotos." };
    return { ok: true, photos: body as Photo[] };
  } catch {
    return { ok: false, error: "Não foi possível falar com o servidor. Tente novamente." };
  }
}

export async function deleteListingPhoto(listingId: string, photoId: string, accessToken: string): Promise<boolean> {
  const res = await fetchWithTimeout(`${API_URL}/listings/${listingId}/photos/${photoId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
  return res.ok;
}

export type ExtractCrlvResult = { ok: true; data: CrlvExtractResult } | { ok: false; error: string };

// Leitura automática do CRLV na página de anunciar (ver AiService ->
// extractCrlvData). Timeout mais generoso: é uma chamada de visão, demora
// mais que texto puro.
export async function extractCrlvData(formData: FormData, accessToken: string): Promise<ExtractCrlvResult> {
  try {
    const res = await fetchWithTimeout(
      `${API_URL}/listings/crlv-extract`,
      { method: "POST", headers: authHeaders(accessToken), body: formData },
      30000,
    );
    const body = await res.json().catch(() => undefined);
    if (!res.ok) return { ok: false, error: body?.message ?? "Não foi possível ler o CRLV agora." };
    return { ok: true, data: body as CrlvExtractResult };
  } catch {
    return { ok: false, error: "Não foi possível falar com o servidor. Tente novamente." };
  }
}

// Disparado automaticamente pela página de fotos logo após o upload — ver
// ListingsService.classifyPhotos. Nunca lança: sem IA ou em caso de falha,
// devolve undefined e a página mantém as fotos como já estavam.
export async function classifyListingPhotos(listingId: string, accessToken: string): Promise<Photo[] | undefined> {
  try {
    const res = await fetchWithTimeout(
      `${API_URL}/listings/${listingId}/photos/classify`,
      { method: "POST", headers: authHeaders(accessToken) },
      60000,
    );
    if (!res.ok) return undefined;
    return (await res.json()) as Photo[];
  } catch {
    return undefined;
  }
}

export type ReorderPhotosResult = { ok: true; photos: Photo[] } | { ok: false; error: string };

export async function reorderListingPhotos(
  listingId: string,
  input: ReorderPhotosInput,
  accessToken: string,
): Promise<ReorderPhotosResult> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/listings/${listingId}/photos/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
      body: JSON.stringify(input),
    });
    const body = await res.json().catch(() => undefined);
    if (!res.ok) return { ok: false, error: body?.message ?? "Não foi possível salvar a ordem das fotos." };
    return { ok: true, photos: body as Photo[] };
  } catch {
    return { ok: false, error: "Não foi possível falar com o servidor. Tente novamente." };
  }
}

export async function updatePhotoCaption(
  listingId: string,
  photoId: string,
  caption: string,
  accessToken: string,
): Promise<boolean> {
  const res = await fetchWithTimeout(`${API_URL}/listings/${listingId}/photos/${photoId}/caption`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
    body: JSON.stringify({ caption }),
  });
  return res.ok;
}

export async function updateListingStatus(
  listingId: string,
  status: ListingStatus,
  accessToken: string,
  soldPrice?: number,
  costPrice?: number,
): Promise<boolean> {
  const res = await fetchWithTimeout(`${API_URL}/listings/${listingId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
    body: JSON.stringify({ status, soldPrice, costPrice }),
  });
  return res.ok;
}

// Kanban de leads e vendas do parceiro.
export type ApiResult<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

async function sendJson<T>(path: string, method: "POST" | "PATCH", body: unknown, accessToken: string): Promise<ApiResult<T>> {
  try {
    const res = await fetchWithTimeout(`${API_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: (data as { message?: string }).message ?? "Não foi possível salvar agora." };
    return { ok: true, value: data as T };
  } catch {
    return { ok: false, error: "Não foi possível falar com o servidor agora." };
  }
}

export function createPartnerLead(input: CreateLeadInput, accessToken: string): Promise<ApiResult<LeadSummary>> {
  return sendJson("/partners/mine/leads", "POST", input, accessToken);
}

export function updatePartnerLead(leadId: string, input: UpdateLeadInput, accessToken: string): Promise<ApiResult<LeadSummary>> {
  return sendJson(`/leads/${leadId}`, "PATCH", input, accessToken);
}

export function startListingBoost(listingId: string, tier: string, accessToken: string): Promise<ApiResult<StartBoostResult>> {
  return sendJson(`/listings/${listingId}/boost`, "POST", { tier }, accessToken);
}

export async function confirmListingBoost(listingId: string, sessionId: string, accessToken: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(
      `${API_URL}/listings/${listingId}/boost/confirm?session_id=${encodeURIComponent(sessionId)}`,
      { headers: authHeaders(accessToken) },
      10000,
    );
    return res.ok;
  } catch {
    return false;
  }
}

export type BoostPurchases = {
  monthTotal: number;
  monthCount: number;
  recent: { id: string; listingId: string; listingTitle: string; tier: string; amount: number; paidAt: string }[];
};

export async function fetchBoostPurchases(accessToken: string): Promise<BoostPurchases | undefined> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/listings/admin/boosts`, { headers: authHeaders(accessToken) });
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as BoostPurchases;
  } catch {
    return undefined;
  }
}

export function updatePartnerSale(listingId: string, input: UpdateSaleInput, accessToken: string): Promise<ApiResult> {
  return sendJson(`/partners/mine/sales/${listingId}`, "PATCH", input, accessToken);
}

// Chat — igual favoritos/anúncios, exige a API no ar.
export type StartConversationResult = { ok: true; conversationId: string } | { ok: false; error: string };

export async function startConversation(listingId: string, accessToken: string, extraHeaders: Record<string, string> = {}): Promise<StartConversationResult> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/listings/${listingId}/conversations`, {
      method: "POST",
      headers: { ...authHeaders(accessToken), ...extraHeaders },
    });
    const body = await res.json();
    if (!res.ok) return { ok: false, error: body.message ?? "Não foi possível iniciar a conversa." };
    return { ok: true, conversationId: (body as ConversationSummary).id };
  } catch {
    return { ok: false, error: "Não foi possível falar com o servidor. Tente novamente." };
  }
}

export async function fetchMyConversations(accessToken: string): Promise<ConversationSummary[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/me/conversations`, { headers: authHeaders(accessToken) });
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as ConversationSummary[];
  } catch {
    return [];
  }
}

export async function fetchConversation(id: string, accessToken: string): Promise<ConversationDetail | undefined> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/conversations/${id}`, { headers: authHeaders(accessToken) });
    if (!res.ok) return undefined;
    return (await res.json()) as ConversationDetail;
  } catch {
    return undefined;
  }
}

export async function sendMessage(conversationId: string, body: string, accessToken: string): Promise<boolean> {
  const res = await fetchWithTimeout(`${API_URL}/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
    body: JSON.stringify({ body }),
  });
  return res.ok;
}

// Painel do parceiro — igual favoritos/anúncios/chat, exige a API no ar.
export type CreatePartnerResult = { ok: true; partner: Partner } | { ok: false; error: string };

export async function createPartner(input: CreatePartnerInput, accessToken: string): Promise<CreatePartnerResult> {
  try {
    // A API consulta o CNPJ na Receita antes de criar — pode demorar.
    const res = await fetchWithTimeout(
      `${API_URL}/partners`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
        body: JSON.stringify(input),
      },
      20000,
    );
    const body = await res.json();
    if (!res.ok) return { ok: false, error: body.message ?? "Não foi possível cadastrar a loja/imobiliária." };
    return { ok: true, partner: body as Partner };
  } catch {
    return { ok: false, error: "Não foi possível falar com o servidor. Tente novamente." };
  }
}

export async function lookupCnpj(cnpj: string): Promise<ApiResult<CnpjLookup>> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/partners/cnpj/${cnpj.replace(/\D/g, "")}`, undefined, 20000);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: (data as { message?: string }).message ?? "Não foi possível consultar o CNPJ." };
    return { ok: true, value: data as CnpjLookup };
  } catch {
    return { ok: false, error: "Não conseguimos consultar o CNPJ agora. Tente de novo em alguns minutos." };
  }
}

export async function signupCompany(input: RegisterCompanyInput, extraHeaders: Record<string, string> = {}): Promise<ApiResult<{ partnerType: string }>> {
  try {
    const res = await fetchWithTimeout(
      `${API_URL}/partners/signup`,
      { method: "POST", headers: { "Content-Type": "application/json", ...extraHeaders }, body: JSON.stringify(input) },
      20000,
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: (data as { message?: string }).message ?? "Não foi possível criar a conta." };
    return { ok: true, value: data as { partnerType: string } };
  } catch {
    return { ok: false, error: "Não foi possível falar com o servidor. Tente novamente." };
  }
}

export function setListingHighlight(listingId: string, level: HighlightLevel, accessToken: string): Promise<ApiResult<Partner>> {
  return sendJson<Partner>(`/partners/mine/listings/${listingId}/highlight`, "PATCH", { level }, accessToken);
}

// ---------- Arquiteto NovoSeminovo ----------

export async function openArchitectSession(listingId: string, accessToken: string): Promise<ApiResult<ArchitectSessionView>> {
  return sendJson<ArchitectSessionView>("/architect/sessions", "POST", { listingId }, accessToken);
}

// A resposta pode levar alguns minutos quando a IA reforma vários cômodos de
// uma vez (imagens do Gemini + lista de compras completa).
export async function sendArchitectMessage(
  sessionId: string,
  input: ArchitectMessageInput,
  accessToken: string,
): Promise<ApiResult<ArchitectSessionView>> {
  try {
    const res = await fetchWithTimeout(
      `${API_URL}/architect/sessions/${encodeURIComponent(sessionId)}/messages`,
      { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders(accessToken) }, body: JSON.stringify(input) },
      300_000,
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: (data as { message?: string }).message ?? "O Arquiteto não conseguiu responder agora." };
    return { ok: true, value: data as ArchitectSessionView };
  } catch {
    return { ok: false, error: "O Arquiteto demorou demais para responder. Tente de novo." };
  }
}

export async function fetchArchitectStats(
  accessToken: string,
): Promise<{ sessions: number; images: number; clicksByStore: { store: string; clicks: number }[] } | undefined> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/admin/architect/stats`, { headers: authHeaders(accessToken) });
    if (!res.ok) return undefined;
    return (await res.json()) as { sessions: number; images: number; clicksByStore: { store: string; clicks: number }[] };
  } catch {
    return undefined;
  }
}

// Base pública da API — o Arquiteto monta os links de loja (contagem de
// clique) no navegador a partir dela.
export const PUBLIC_API_URL = API_URL;

export type UploadPartnerLogoResult = { ok: true; partner: Partner } | { ok: false; error: string };

export async function uploadPartnerLogo(formData: FormData, accessToken: string): Promise<UploadPartnerLogoResult> {
  try {
    const res = await fetchWithTimeout(
      `${API_URL}/partners/mine/logo`,
      { method: "POST", headers: authHeaders(accessToken), body: formData },
      20000,
    );
    const body = await res.json();
    if (!res.ok) return { ok: false, error: body.message ?? "Não foi possível enviar a logo." };
    return { ok: true, partner: body as Partner };
  } catch {
    return { ok: false, error: "Não foi possível falar com o servidor. Tente novamente." };
  }
}

export async function fetchMyPartner(accessToken: string): Promise<Partner | undefined> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/partners/mine`, { headers: authHeaders(accessToken) });
    if (!res.ok) return undefined;
    const body = await res.json();
    return body ?? undefined;
  } catch {
    return undefined;
  }
}

export async function fetchPartnerStorefront(slug: string): Promise<PartnerStorefront | undefined> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/partners/${slug}`);
    if (!res.ok) return undefined;
    return (await res.json()) as PartnerStorefront;
  } catch {
    return undefined;
  }
}

export async function fetchPartnerLeads(accessToken: string): Promise<LeadSummary[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/partners/mine/leads`, { headers: authHeaders(accessToken) });
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as LeadSummary[];
  } catch {
    return [];
  }
}

export async function fetchPartnerSales(accessToken: string): Promise<SaleSummary[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/partners/mine/sales`, { headers: authHeaders(accessToken) });
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as SaleSummary[];
  } catch {
    return [];
  }
}

export async function updateLeadStatus(leadId: string, status: LeadStatus, accessToken: string): Promise<boolean> {
  const res = await fetchWithTimeout(`${API_URL}/leads/${leadId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
    body: JSON.stringify({ status }),
  });
  return res.ok;
}

// Equipe do parceiro — só o dono convida/remove (a API confere; ver
// Partner.isOwner para a UI já não oferecer o que vai dar 403).
export async function fetchPartnerMembers(accessToken: string): Promise<PartnerMember[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/partners/mine/members`, { headers: authHeaders(accessToken) });
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as PartnerMember[];
  } catch {
    return [];
  }
}

export type AddPartnerMemberResult = { ok: true } | { ok: false; error: string };

export async function addPartnerMember(email: string, accessToken: string): Promise<AddPartnerMemberResult> {
  const res = await fetchWithTimeout(`${API_URL}/partners/mine/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, error: body.message ?? "Não foi possível adicionar essa pessoa à equipe." };
  }
  return { ok: true };
}

export async function removePartnerMember(memberId: string, accessToken: string): Promise<boolean> {
  const res = await fetchWithTimeout(`${API_URL}/partners/mine/members/${memberId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
  return res.ok;
}

// Planos — sem Stripe configurado na API, "contratar" é uma simulação sem
// gateway de pagamento nenhum (ver comentário em PartnerSubscriptionSchema
// no shared-types); com Stripe configurado, startCheckoutSession abaixo é
// quem o front usa de verdade.
export async function fetchPlans(audience?: "vehicle" | "property"): Promise<Plan[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/plans${audience ? `?for=${audience}` : ""}`);
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as Plan[];
  } catch {
    return [];
  }
}

export type SubscribeToPlanResult = { ok: true } | { ok: false; error: string };

export async function subscribeToPlan(planId: string, accessToken: string): Promise<SubscribeToPlanResult> {
  const res = await fetchWithTimeout(`${API_URL}/partners/mine/subscription`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
    body: JSON.stringify({ planId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, error: body.message ?? "Não foi possível contratar esse plano." };
  }
  return { ok: true };
}

export async function cancelSubscription(accessToken: string): Promise<boolean> {
  const res = await fetchWithTimeout(`${API_URL}/partners/mine/subscription`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
  return res.ok;
}

export async function fetchAiStatus(): Promise<AiStatus> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/listings/ai-status`);
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as AiStatus;
  } catch {
    return { aiEnabled: false };
  }
}

export type GenerateListingDraftResult = { ok: true; draft: ListingDraft } | { ok: false; error: string };

export async function generateListingDraft(
  input: GenerateListingDraftInput,
  accessToken: string,
): Promise<GenerateListingDraftResult> {
  try {
    const res = await fetchWithTimeout(
      `${API_URL}/listings/generate-draft`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
        body: JSON.stringify(input),
      },
      15000,
    );
    const body = await res.json().catch(() => undefined);
    if (!res.ok) return { ok: false, error: body?.message ?? "Não foi possível gerar o anúncio agora." };
    return { ok: true, draft: body as ListingDraft };
  } catch {
    return { ok: false, error: "Não foi possível falar com o servidor. Tente novamente." };
  }
}

export type RecommendVehicleResult = { ok: true; recommendation: VehicleRecommendation } | { ok: false; error: string };

// Botão "qual carro é ideal pra mim?" (ver ListingsService.recommendVehicle).
export async function fetchFipeBrands(): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/listings/fipe-brands`, undefined, 8000);
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return ((await res.json()) as { name: string }[]).map((brand) => brand.name);
  } catch {
    return [];
  }
}

// Tabela FIPE pro /anunciar (versões do modelo e preço da versão escolhida).
// Timeout maior: a primeira consulta de um modelo busca os anos de cada versão.
export async function fetchFipeVersions(brand: string, model: string, yearModel?: number): Promise<FipeVersion[]> {
  try {
    const params = new URLSearchParams({ brand, model, ...(yearModel ? { yearModel: String(yearModel) } : {}) });
    const res = await fetchWithTimeout(`${API_URL}/listings/fipe-versions?${params.toString()}`, undefined, 15000);
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as FipeVersion[];
  } catch {
    return [];
  }
}

export async function fetchFipeModels(brand: string, yearModel?: number): Promise<FipeModelSuggestion[]> {
  try {
    const params = new URLSearchParams({ brand, ...(yearModel ? { yearModel: String(yearModel) } : {}) });
    const res = await fetchWithTimeout(`${API_URL}/listings/fipe-models?${params.toString()}`, undefined, 15000);
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as FipeModelSuggestion[];
  } catch {
    return [];
  }
}

// Preço de referência pelo nome do modelo (sem versão escolhida).
export async function fetchFipeReference(brand: string, model: string, yearModel: number): Promise<FipePrice | undefined> {
  try {
    const params = new URLSearchParams({ brand, model, yearModel: String(yearModel) });
    const res = await fetchWithTimeout(`${API_URL}/listings/fipe-reference?${params.toString()}`, undefined, 10000);
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return ((await res.json()) as FipePrice | null) ?? undefined;
  } catch {
    return undefined;
  }
}

export async function fetchFipePrice(brand: string, modelCode: number, yearModel: number): Promise<FipePrice | undefined> {
  try {
    const params = new URLSearchParams({ brand, modelCode: String(modelCode), yearModel: String(yearModel) });
    const res = await fetchWithTimeout(`${API_URL}/listings/fipe-price?${params.toString()}`, undefined, 10000);
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return ((await res.json()) as FipePrice | null) ?? undefined;
  } catch {
    return undefined;
  }
}

// Público — não exige login, igual fetchPriceSuggestion acima — mas usa POST
// porque o perfil financeiro não cabe bem numa querystring.
export async function recommendVehicle(input: VehicleProfileInput): Promise<RecommendVehicleResult> {
  try {
    const res = await fetchWithTimeout(
      `${API_URL}/listings/recommend-vehicle`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
      15000,
    );
    const body = await res.json().catch(() => undefined);
    if (!res.ok) return { ok: false, error: body?.message ?? "Não foi possível gerar a recomendação agora." };
    return { ok: true, recommendation: body as VehicleRecommendation };
  } catch {
    return { ok: false, error: "Não foi possível falar com o servidor. Tente novamente." };
  }
}

export type RecommendPropertyResult =
  | { ok: true; recommendation: PropertyRecommendation }
  | { ok: false; error: string };

// Mesma ideia de recommendVehicle acima, pra imóvel (ver
// ListingsService.recommendProperty).
export async function recommendProperty(input: PropertyProfileInput): Promise<RecommendPropertyResult> {
  try {
    const res = await fetchWithTimeout(
      `${API_URL}/listings/recommend-property`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
      15000,
    );
    const body = await res.json().catch(() => undefined);
    if (!res.ok) return { ok: false, error: body?.message ?? "Não foi possível gerar a recomendação agora." };
    return { ok: true, recommendation: body as PropertyRecommendation };
  } catch {
    return { ok: false, error: "Não foi possível falar com o servidor. Tente novamente." };
  }
}

export async function fetchPaymentsStatus(): Promise<PaymentsStatus> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/payments/status`);
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as PaymentsStatus;
  } catch {
    return { stripeEnabled: false };
  }
}

export async function startBillingPortalSession(accessToken: string): Promise<StartCheckoutResult> {
  const res = await fetchWithTimeout(`${API_URL}/partners/mine/billing-portal`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: body.message ?? "Não foi possível abrir a área de pagamento." };
  }
  return { ok: true, url: body.url as string };
}

export type StartCheckoutResult = { ok: true; url: string } | { ok: false; error: string };

export async function startCheckoutSession(planId: string, accessToken: string): Promise<StartCheckoutResult> {
  const res = await fetchWithTimeout(`${API_URL}/partners/mine/checkout-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
    body: JSON.stringify({ planId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: body.message ?? "Não foi possível iniciar o checkout." };
  }
  return { ok: true, url: body.url as string };
}

export async function confirmCheckoutSession(sessionId: string, accessToken: string): Promise<boolean> {
  const res = await fetchWithTimeout(`${API_URL}/partners/mine/checkout-session/confirm?session_id=${encodeURIComponent(sessionId)}`, {
    headers: authHeaders(accessToken),
  });
  return res.ok;
}

// Moderação — só chamável por quem tem role "admin" (a API confere pelo
// JWT; um token de não-admin recebe 403 em qualquer uma destas rotas).
export async function fetchPendingListings(accessToken: string): Promise<PendingListing[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/admin/listings/pending`, { headers: authHeaders(accessToken) });
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as PendingListing[];
  } catch {
    return [];
  }
}

export async function moderateListing(
  listingId: string,
  input: ModerateListingInput,
  accessToken: string,
): Promise<boolean> {
  const res = await fetchWithTimeout(`${API_URL}/admin/listings/${listingId}/moderate`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
    body: JSON.stringify(input),
  });
  return res.ok;
}

export async function fetchPendingPartners(accessToken: string): Promise<PendingPartner[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/admin/partners/pending`, { headers: authHeaders(accessToken) });
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as PendingPartner[];
  } catch {
    return [];
  }
}

export async function verifyPartner(partnerId: string, accessToken: string): Promise<boolean> {
  const res = await fetchWithTimeout(`${API_URL}/admin/partners/${partnerId}/verify`, {
    method: "PATCH",
    headers: authHeaders(accessToken),
  });
  return res.ok;
}

export async function setPartnerType(partnerId: string, type: string, accessToken: string): Promise<boolean> {
  const res = await fetchWithTimeout(`${API_URL}/admin/partners/${partnerId}/type`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
    body: JSON.stringify({ type }),
  });
  return res.ok;
}

export async function fetchOpenReports(accessToken: string): Promise<PendingReport[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/admin/reports`, { headers: authHeaders(accessToken) });
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as PendingReport[];
  } catch {
    return [];
  }
}

export async function updateReportStatus(reportId: string, status: ReportStatus, accessToken: string): Promise<boolean> {
  const res = await fetchWithTimeout(`${API_URL}/admin/reports/${reportId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
    body: JSON.stringify({ status }),
  });
  return res.ok;
}

export async function fetchModerationLog(accessToken: string): Promise<ModerationLogEntry[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/admin/moderation-log`, { headers: authHeaders(accessToken) });
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as ModerationLogEntry[];
  } catch {
    return [];
  }
}

// Denúncia de anúncio — exige login (a API usa o reporterId pra checar que a
// pessoa não está denunciando o próprio anúncio).
export type CreateReportResult = { ok: true } | { ok: false; error: string };

export async function createReport(listingId: string, reason: string, accessToken: string): Promise<CreateReportResult> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/listings/${listingId}/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.message ?? "Não foi possível enviar a denúncia." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Não foi possível falar com o servidor. Tente novamente." };
  }
}

// Avaliação de vendedor/loja — só quem já conversou sobre o anúncio pode
// avaliar (a API confere; ListingDetail.reviewStatus já reflete isso).
export type CreateReviewResult = { ok: true } | { ok: false; error: string };

export async function createReview(
  listingId: string,
  input: CreateReviewInput,
  accessToken: string,
): Promise<CreateReviewResult> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/listings/${listingId}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.message ?? "Não foi possível enviar a avaliação." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Não foi possível falar com o servidor. Tente novamente." };
  }
}

// Fogo-e-esquece: só alimenta o funil de leads do parceiro (ver
// ListingsService.registerWhatsappClick) — nunca deve travar a abertura do
// WhatsApp no navegador da pessoa, por isso engole qualquer erro.
export async function registerWhatsappClick(listingId: string, accessToken?: string, extraHeaders: Record<string, string> = {}): Promise<void> {
  try {
    await fetchWithTimeout(`${API_URL}/listings/${listingId}/whatsapp-clicks`, {
      method: "POST",
      headers: { ...(accessToken ? authHeaders(accessToken) : {}), ...extraHeaders },
    });
  } catch {
    // ignorado de propósito
  }
}

export async function simulateFinancing(
  listingId: string,
  input: { assetPrice: number; downPaymentPct: number; installments: number },
): Promise<FinancingSimulationResult | undefined> {
  try {
    // Timeout padrão (1.5s) é curto demais pra uma chamada de verdade
    // passando pela internet (fica instantâneo em dev local, por isso esse
    // problema só apareceu em produção) — 5s dá folga sem deixar a pessoa
    // esperando demais se a API estiver genuinamente fora do ar.
    const res = await fetchWithTimeout(
      `${API_URL}/listings/${listingId}/financing-simulations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
      5000,
    );
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as FinancingSimulationResult;
  } catch {
    return undefined;
  }
}

// Buscas salvas — "alertEnabled" ainda não dispara nenhum e-mail de verdade
// (ver comentário em SavedSearchSchema); por ora é só salvar/reaplicar filtros.
export async function fetchMySavedSearches(accessToken: string): Promise<SavedSearch[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/saved-searches/mine`, { headers: authHeaders(accessToken) });
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as SavedSearch[];
  } catch {
    return [];
  }
}

export async function createSavedSearch(input: CreateSavedSearchInput, accessToken: string): Promise<boolean> {
  const res = await fetchWithTimeout(`${API_URL}/saved-searches`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
    body: JSON.stringify(input),
  });
  return res.ok;
}

export async function updateSavedSearchAlert(
  id: string,
  alertEnabled: boolean,
  accessToken: string,
): Promise<boolean> {
  const res = await fetchWithTimeout(`${API_URL}/saved-searches/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
    body: JSON.stringify({ alertEnabled }),
  });
  return res.ok;
}

export async function deleteSavedSearch(id: string, accessToken: string): Promise<boolean> {
  const res = await fetchWithTimeout(`${API_URL}/saved-searches/${id}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
  return res.ok;
}

// Notificações — contagem de não lidas é usada no sininho do cabeçalho
// (SiteHeader), calculada no servidor a cada carregamento de página (sem
// polling nem WebSocket, mesmo padrão "zero JS por padrão" do resto do site).
export async function fetchMyNotifications(accessToken: string): Promise<Notification[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/me/notifications`, { headers: authHeaders(accessToken) });
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as Notification[];
  } catch {
    return [];
  }
}

export async function fetchUnreadNotificationsCount(accessToken: string): Promise<number> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/me/notifications/unread-count`, {
      headers: authHeaders(accessToken),
    });
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    const data = (await res.json()) as { count: number };
    return data.count;
  } catch {
    return 0;
  }
}

export async function markNotificationRead(id: string, accessToken: string): Promise<boolean> {
  const res = await fetchWithTimeout(`${API_URL}/me/notifications/${id}/read`, {
    method: "PATCH",
    headers: authHeaders(accessToken),
  });
  return res.ok;
}

export async function markAllNotificationsRead(accessToken: string): Promise<boolean> {
  const res = await fetchWithTimeout(`${API_URL}/me/notifications/read-all`, {
    method: "PATCH",
    headers: authHeaders(accessToken),
  });
  return res.ok;
}

// Perfil completo (ver /conta/perfil) e verificação de e-mail.
export async function fetchProfile(accessToken: string): Promise<Profile | undefined> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/me/profile`, { headers: authHeaders(accessToken) });
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as Profile;
  } catch {
    return undefined;
  }
}

export type UpdateProfileResult = { ok: true; profile: Profile } | { ok: false; error: string };

export async function updateProfile(input: UpdateProfileInput, accessToken: string): Promise<UpdateProfileResult> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/me/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
      body: JSON.stringify(input),
    });
    const body = await res.json();
    if (!res.ok) return { ok: false, error: body.message ?? "Não foi possível salvar os dados." };
    return { ok: true, profile: body as Profile };
  } catch {
    return { ok: false, error: "Não foi possível falar com o servidor. Tente novamente." };
  }
}

export async function sendEmailVerification(accessToken: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/me/email/send-verification`, {
      method: "POST",
      headers: authHeaders(accessToken),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { sent: boolean };
    return body.sent;
  } catch {
    return false;
  }
}

export type VerifyEmailResult = { ok: true } | { ok: false; error: string };

export async function verifyEmailCode(code: string, accessToken: string): Promise<VerifyEmailResult> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/me/email/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
      body: JSON.stringify({ code }),
    });
    const body = await res.json();
    if (!res.ok) return { ok: false, error: body.message ?? "Código inválido." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Não foi possível falar com o servidor. Tente novamente." };
  }
}

// Programa de recompensa por financiamento — ver RebatesService na API.
export async function fetchMyRebates(accessToken: string): Promise<MyRebatesSummary | undefined> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/me/rebates`, { headers: authHeaders(accessToken) });
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as MyRebatesSummary;
  } catch {
    return undefined;
  }
}

// Sem token — página pública de apresentação do programa (ver /recompensas).
export async function fetchPublicRebateTiers(): Promise<RebateTier[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/rebate-tiers`);
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as RebateTier[];
  } catch {
    return [];
  }
}

export async function fetchRebateTiers(accessToken: string): Promise<RebateTier[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/admin/rebate-tiers`, { headers: authHeaders(accessToken) });
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as RebateTier[];
  } catch {
    return [];
  }
}

export async function updateRebateTier(
  tierId: string,
  input: { tierName?: string; minVolume?: number; rebatePercent?: number },
  accessToken: string,
): Promise<boolean> {
  const res = await fetchWithTimeout(`${API_URL}/admin/rebate-tiers/${tierId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
    body: JSON.stringify(input),
  });
  return res.ok;
}

export async function fetchEligibleListings(accessToken: string): Promise<EligibleListing[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/admin/financing-deals/eligible-listings`, {
      headers: authHeaders(accessToken),
    });
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as EligibleListing[];
  } catch {
    return [];
  }
}

export async function fetchFinancingDeals(status: FinancingDealStatus | undefined, accessToken: string): Promise<FinancingDeal[]> {
  try {
    const query = status ? `?status=${status}` : "";
    const res = await fetchWithTimeout(`${API_URL}/admin/financing-deals${query}`, { headers: authHeaders(accessToken) });
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as FinancingDeal[];
  } catch {
    return [];
  }
}

export type RegisterFinancingDealResult = { ok: true; deal: FinancingDeal } | { ok: false; error: string };

export async function registerFinancingDeal(
  input: RegisterFinancingDealInput,
  accessToken: string,
): Promise<RegisterFinancingDealResult> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/admin/financing-deals`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
      body: JSON.stringify(input),
    });
    const body = await res.json();
    if (!res.ok) return { ok: false, error: body.message ?? "Não foi possível registrar o negócio." };
    return { ok: true, deal: body as FinancingDeal };
  } catch {
    return { ok: false, error: "Não foi possível falar com o servidor. Tente novamente." };
  }
}

export async function markFinancingDealPaid(dealId: string, note: string | undefined, accessToken: string): Promise<boolean> {
  const res = await fetchWithTimeout(`${API_URL}/admin/financing-deals/${dealId}/pay`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
    body: JSON.stringify({ note }),
  });
  return res.ok;
}

// ---------- Agentes de IA ----------

export async function fetchAgentStatus(): Promise<AgentStatus> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/agents/status`);
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as AgentStatus;
  } catch {
    return { enabled: false };
  }
}

export type SendAgentMessageResult = { ok: true; reply: AgentReply } | { ok: false; error: string };

export async function sendAgentMessage(
  kind: AgentKind,
  input: { conversationId?: string; message: string },
  options: { accessToken?: string; clientIp?: string; extraHeaders?: Record<string, string> },
): Promise<SendAgentMessageResult> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json", ...options.extraHeaders };
    if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;
    if (options.clientIp) headers["x-client-ip"] = options.clientIp;
    // Uma resposta do agente pode envolver várias chamadas ao modelo
    // (buscar → ver anúncio → simular) — 60s em vez dos 4s padrão.
    const res = await fetchWithTimeout(
      `${API_URL}/agents/${kind}/messages`,
      { method: "POST", headers, body: JSON.stringify(input) },
      60000,
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      return { ok: false, error: body.message ?? "O assistente não conseguiu responder agora." };
    }
    return { ok: true, reply: (await res.json()) as AgentReply };
  } catch {
    return { ok: false, error: "O assistente está fora do ar no momento. Tente de novo em instantes." };
  }
}

export async function fetchAgentConversation(
  kind: AgentKind,
  conversationId: string,
  accessToken?: string,
): Promise<AgentConversationView | undefined> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/agents/${kind}/conversations/${conversationId}`, {
      headers: accessToken ? authHeaders(accessToken) : undefined,
    });
    if (!res.ok) return undefined;
    return (await res.json()) as AgentConversationView;
  } catch {
    return undefined;
  }
}

export async function fetchFinancingLeads(
  filter: { status?: FinancingLeadStatus; assetType?: "vehicle" | "property" },
  accessToken: string,
): Promise<FinancingLeadSummary[]> {
  try {
    const query = new URLSearchParams();
    if (filter.status) query.set("status", filter.status);
    if (filter.assetType) query.set("assetType", filter.assetType);
    const res = await fetchWithTimeout(`${API_URL}/admin/financing-leads?${query.toString()}`, {
      headers: authHeaders(accessToken),
    });
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as FinancingLeadSummary[];
  } catch {
    return [];
  }
}

export async function updateFinancingLead(
  id: string,
  input: UpdateFinancingLeadInput,
  accessToken: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/admin/financing-leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      return { ok: false, error: data.message ?? "Não foi possível salvar agora." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Não foi possível falar com o servidor agora." };
  }
}

// ---------- Assinaturas (quadro do admin) ----------

export async function fetchSubscriptionBoard(accessToken: string): Promise<SubscriptionBoardCard[] | undefined> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/admin/subscriptions`, { headers: authHeaders(accessToken) });
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as SubscriptionBoardCard[];
  } catch {
    return undefined;
  }
}

export async function updatePartnerAdminNotes(partnerId: string, adminNotes: string, accessToken: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/admin/partners/${partnerId}/notes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
      body: JSON.stringify({ adminNotes }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------- Integração com CRMs ----------

export async function fetchIntegrationOverview(accessToken: string): Promise<IntegrationOverview | undefined> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/partners/mine/integrations`, { headers: authHeaders(accessToken) });
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as IntegrationOverview;
  } catch {
    return undefined;
  }
}

export type IntegrationResult<T> = { ok: true; value: T } | { ok: false; error: string };

async function integrationCall<T>(path: string, method: string, accessToken: string, body?: unknown): Promise<IntegrationResult<T>> {
  try {
    const res = await fetchWithTimeout(
      `${API_URL}/partners/mine/integrations${path}`,
      {
        method,
        headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      15000,
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { message?: string | string[] };
      const message = Array.isArray(data.message) ? data.message.join("; ") : data.message;
      return { ok: false, error: message ?? "Não foi possível concluir agora. Tente de novo." };
    }
    const text = await res.text();
    return { ok: true, value: (text ? JSON.parse(text) : undefined) as T };
  } catch {
    return { ok: false, error: "Não foi possível falar com o servidor agora. Tente de novo." };
  }
}

export function createIntegrationFeed(input: { url: string; format: IntegrationFeedFormat }, accessToken: string) {
  return integrationCall<IntegrationFeed>("/feeds", "POST", accessToken, input);
}

export function syncIntegrationFeed(feedId: string, accessToken: string) {
  return integrationCall<IntegrationFeed>(`/feeds/${feedId}/sync`, "POST", accessToken);
}

export function deleteIntegrationFeed(feedId: string, accessToken: string) {
  return integrationCall<void>(`/feeds/${feedId}`, "DELETE", accessToken);
}

export function createPartnerApiKey(name: string, accessToken: string) {
  return integrationCall<CreatedPartnerApiKey>("/api-keys", "POST", accessToken, { name });
}

export function revokePartnerApiKey(keyId: string, accessToken: string) {
  return integrationCall<void>(`/api-keys/${keyId}`, "DELETE", accessToken);
}

// ---- Programa de afiliados ----

export async function fetchAffiliateDashboard(accessToken: string): Promise<AffiliateDashboard | null | undefined> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/affiliates/me`, { headers: authHeaders(accessToken), cache: "no-store" });
    if (!res.ok) return undefined;
    return ((await res.json()) as { affiliate: AffiliateDashboard | null }).affiliate;
  } catch {
    return undefined;
  }
}

export function applyAffiliate(input: AffiliateApplyInput, accessToken: string): Promise<ApiResult<AffiliateDashboard>> {
  return sendJson("/affiliates/apply", "POST", input, accessToken);
}

// Clique no link ?ref= — melhor esforço, nunca atrapalha a navegação.
export async function recordAffiliateClick(code: string): Promise<void> {
  await fetchWithTimeout(`${API_URL}/affiliates/click`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  }).catch(() => undefined);
}

export async function fetchAdminAffiliates(accessToken: string): Promise<AdminAffiliateRow[] | undefined> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/admin/affiliates`, { headers: authHeaders(accessToken), cache: "no-store" });
    if (!res.ok) return undefined;
    return (await res.json()) as AdminAffiliateRow[];
  } catch {
    return undefined;
  }
}

export function adminAffiliateAction(id: string, action: string, note: string | undefined, accessToken: string): Promise<ApiResult<{ ok: true }>> {
  return sendJson(`/admin/affiliates/${encodeURIComponent(id)}`, "PATCH", { action, note: note || undefined }, accessToken);
}

export function adminAffiliatePayout(id: string, note: string, accessToken: string): Promise<ApiResult<{ paid: number }>> {
  return sendJson(`/admin/affiliates/${encodeURIComponent(id)}/payout`, "POST", { note }, accessToken);
}

export async function fetchAdminAffiliateDetail(id: string, accessToken: string): Promise<AdminAffiliateDetail | undefined> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/admin/affiliates/${encodeURIComponent(id)}`, { headers: authHeaders(accessToken) });
    if (!res.ok) return undefined;
    return (await res.json()) as AdminAffiliateDetail;
  } catch {
    return undefined;
  }
}

export async function fetchAdminOverview(scope: AdminOverviewScope, accessToken: string): Promise<AdminOverview | undefined> {
  try {
    const query = scope === "all" ? "" : `?tipo=${scope}`;
    const res = await fetchWithTimeout(`${API_URL}/admin/overview${query}`, { headers: authHeaders(accessToken), cache: "no-store" }, 20000);
    if (!res.ok) return undefined;
    return (await res.json()) as AdminOverview;
  } catch {
    return undefined;
  }
}

export function saveStoreEarning(input: StoreEarningInput, accessToken: string): Promise<ApiResult<{ ok: true }>> {
  return sendJson("/admin/store-earnings", "POST", input, accessToken);
}

export async function deleteStoreEarning(id: string, accessToken: string): Promise<void> {
  try {
    await fetchWithTimeout(`${API_URL}/admin/store-earnings/${encodeURIComponent(id)}`, { method: "DELETE", headers: authHeaders(accessToken) });
  } catch {
    // a tela recarrega e mostra o que ficou
  }
}

// Operação com agentes de IA (/admin/operacao).
export async function fetchOpsSummary(accessToken: string): Promise<OpsSummary | undefined> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/admin/operations`, { headers: authHeaders(accessToken), cache: "no-store" }, 20000);
    if (!res.ok) return undefined;
    return (await res.json()) as OpsSummary;
  } catch {
    return undefined;
  }
}

export function opsDecideApproval(id: string, decision: "approve" | "reject", note: string | undefined, accessToken: string): Promise<ApiResult<{ status: string }>> {
  return sendJson(`/admin/operations/approvals/${encodeURIComponent(id)}/${decision}`, "POST", { note: note || undefined }, accessToken);
}

export function opsTaskAction(id: string, action: "cancel" | "retry", accessToken: string): Promise<ApiResult<{ ok: true }>> {
  return sendJson(`/admin/operations/tasks/${encodeURIComponent(id)}/${action}`, "POST", {}, accessToken);
}

export function opsSaveGoal(input: OpsGoalInput, accessToken: string): Promise<ApiResult<{ ok: true }>> {
  return sendJson("/admin/operations/goals", "POST", input, accessToken);
}

export async function opsDeleteGoal(id: string, accessToken: string): Promise<void> {
  try {
    await fetchWithTimeout(`${API_URL}/admin/operations/goals/${encodeURIComponent(id)}`, { method: "DELETE", headers: authHeaders(accessToken) });
  } catch {
    // a tela recarrega e mostra o que ficou
  }
}

export function opsRunAgent(agent: string, accessToken: string): Promise<ApiResult<{ taskId: string }>> {
  return sendJson(`/admin/operations/agents/${encodeURIComponent(agent)}/run`, "POST", {}, accessToken);
}

export function opsSetSuggestionStatus(id: string, status: "nova" | "usada" | "descartada", accessToken: string): Promise<ApiResult<{ ok: true }>> {
  return sendJson(`/admin/operations/suggestions/${encodeURIComponent(id)}`, "PATCH", { status }, accessToken);
}

// ---------- Marketing (/admin/marketing) ----------
export async function fetchMarketingSummary(accessToken: string): Promise<MarketingSummary | undefined> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/admin/marketing`, { headers: authHeaders(accessToken), cache: "no-store" }, 20000);
    if (!res.ok) return undefined;
    return (await res.json()) as MarketingSummary;
  } catch {
    return undefined;
  }
}

export function mktSavePost(id: string | undefined, input: MarketingPostInput, accessToken: string): Promise<ApiResult<{ id: string }>> {
  return id ? sendJson(`/admin/marketing/posts/${encodeURIComponent(id)}`, "PATCH", input, accessToken) : sendJson("/admin/marketing/posts", "POST", input, accessToken);
}

export function mktDecide(kind: "posts" | "campaigns" | "sequences", id: string, input: MarketingDecisionInput, accessToken: string): Promise<ApiResult<{ status: string }>> {
  return sendJson(`/admin/marketing/${kind}/${encodeURIComponent(id)}/decision`, "POST", input, accessToken);
}

export function mktSaveCampaign(id: string | undefined, input: EmailCampaignInput, accessToken: string): Promise<ApiResult<{ id: string }>> {
  return id
    ? sendJson(`/admin/marketing/campaigns/${encodeURIComponent(id)}`, "PATCH", input, accessToken)
    : sendJson("/admin/marketing/campaigns", "POST", input, accessToken);
}

export function mktSuggestionToPost(id: string, accessToken: string): Promise<ApiResult<{ taskId: string }>> {
  return sendJson(`/admin/marketing/suggestions/${encodeURIComponent(id)}/post`, "POST", {}, accessToken);
}

export function mktRefreshMetrics(accessToken: string): Promise<ApiResult<{ updated: number }>> {
  return sendJson("/admin/marketing/posts/metrics", "POST", {}, accessToken);
}

// ---------- Todos os anúncios (/admin/anuncios) ----------
export async function fetchAdminListings(params: Record<string, string | undefined>, accessToken: string): Promise<AdminListingsPage | undefined> {
  const query = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])));
  try {
    const res = await fetchWithTimeout(`${API_URL}/admin/listings?${query}`, { headers: authHeaders(accessToken), cache: "no-store" }, 20000);
    if (!res.ok) return undefined;
    return (await res.json()) as AdminListingsPage;
  } catch {
    return undefined;
  }
}

export function adminListingAction(id: string, input: AdminListingActionInput, accessToken: string): Promise<ApiResult<{ status: string }>> {
  return sendJson(`/admin/listings/${encodeURIComponent(id)}/action`, "PATCH", input, accessToken);
}

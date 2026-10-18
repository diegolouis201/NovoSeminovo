import type {
  AiStatus,
  ConversationDetail,
  ConversationSummary,
  CreateListingInput,
  CreatePartnerInput,
  CreateReviewInput,
  CreateSavedSearchInput,
  CrlvExtractResult,
  FeaturedPartner,
  FinancingSimulationResult,
  LeadStatus,
  LeadSummary,
  ListingDetail,
  ListingStatus,
  ListingSummary,
  ModerateListingInput,
  ModerationLogEntry,
  MyListingSummary,
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
  ReportStatus,
  SavedSearch,
  GenerateListingDraftInput,
  ListingDraft,
  PendingServiceConfirmation,
  PropertyProfileInput,
  PropertyRecommendation,
  RegisterVehicleInput,
  ReorderPhotosInput,
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
    return listListings(params.assetType);
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
    return MOCK_FEATURED_PARTNERS;
  }
}

const MOCK_POPULAR_BRANDS = ["Toyota", "Honda", "Volkswagen", "Hyundai", "Jeep", "Chevrolet"];

export async function fetchPopularBrands(): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/listings/popular-brands`);
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return (await res.json()) as string[];
  } catch {
    return MOCK_POPULAR_BRANDS;
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
    return getListing(id);
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
    return getVehicleProfile(id);
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
): Promise<boolean> {
  const res = await fetchWithTimeout(`${API_URL}/listings/${listingId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
    body: JSON.stringify({ status }),
  });
  return res.ok;
}

// Chat — igual favoritos/anúncios, exige a API no ar.
export type StartConversationResult = { ok: true; conversationId: string } | { ok: false; error: string };

export async function startConversation(listingId: string, accessToken: string): Promise<StartConversationResult> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/listings/${listingId}/conversations`, {
      method: "POST",
      headers: authHeaders(accessToken),
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
    const res = await fetchWithTimeout(`${API_URL}/partners`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
      body: JSON.stringify(input),
    });
    const body = await res.json();
    if (!res.ok) return { ok: false, error: body.message ?? "Não foi possível cadastrar a loja/imobiliária." };
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
export async function fetchPlans(): Promise<Plan[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/plans`);
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
export async function registerWhatsappClick(listingId: string, accessToken?: string): Promise<void> {
  try {
    await fetchWithTimeout(`${API_URL}/listings/${listingId}/whatsapp-clicks`, {
      method: "POST",
      headers: accessToken ? authHeaders(accessToken) : undefined,
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

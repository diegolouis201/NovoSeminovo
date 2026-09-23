import type {
  ConversationDetail,
  ConversationSummary,
  CreateListingInput,
  CreatePartnerInput,
  CreateReviewInput,
  CreateSavedSearchInput,
  FinancingSimulationResult,
  LeadStatus,
  LeadSummary,
  ListingDetail,
  ListingStatus,
  ListingSummary,
  ModerateListingInput,
  MyListingSummary,
  Partner,
  PartnerStorefront,
  PendingListing,
  PendingPartner,
  PendingReport,
  Photo,
  ReportStatus,
  SavedSearch,
} from "@novoseminovo/shared-types";
import { getListing, listListings } from "@/lib/mock-data";

// apps/api (NestJS) implementa estes três endpoints sobre o schema de
// packages/db. Sem NEXT_PUBLIC_API_URL configurada, ou com a API fora do ar
// (comum em dev sem Postgres local), as páginas caem de volta para os dados
// de exemplo em lib/mock-data.ts — mesmo formato dos dois lados.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 1500) {
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
    const res = await fetchWithTimeout(`${API_URL}/listings/${listingId}/financing-simulations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
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

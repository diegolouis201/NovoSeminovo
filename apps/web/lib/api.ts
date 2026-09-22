import type {
  CreateListingInput,
  FinancingSimulationResult,
  ListingDetail,
  ListingStatus,
  ListingSummary,
  MyListingSummary,
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

export async function fetchListing(id: string): Promise<ListingDetail | undefined> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/listings/${id}`);
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

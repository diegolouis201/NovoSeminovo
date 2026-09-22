import type { FinancingSimulationResult, ListingDetail, ListingSummary } from "@novoseminovo/shared-types";
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

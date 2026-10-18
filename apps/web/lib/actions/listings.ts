"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type {
  CreateListingInput,
  ListingStatus,
  Photo,
  PriceSuggestion,
  PropertyProfileInput,
  ReorderPhotosInput,
  VehicleProfileInput,
} from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import {
  classifyListingPhotos,
  createListing,
  deleteListingPhoto,
  extractCrlvData,
  fetchPriceSuggestion,
  generateListingDraft,
  recommendProperty,
  recommendVehicle,
  type RecommendPropertyResult,
  type RecommendVehicleResult,
  reorderListingPhotos,
  type ReorderPhotosResult,
  updateListingStatus,
  updatePhotoCaption,
  uploadListingPhotos,
} from "@/lib/api";
import { parseListingsCsv } from "@/lib/csv-listings";

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

// Chamada direta por PriceSuggestionHint (client component) — uma Server
// Action evita o navegador precisar falar com a API (que só libera CORS pra
// WEB_ORIGIN) e mantém o mesmo limite de sempre: o site nunca fala com a API
// de dentro do navegador, só o servidor do Next.
export async function suggestPriceAction(query: {
  assetType: "vehicle" | "property";
  brand?: string;
  model?: string;
  propertyType?: string;
  city?: string;
}): Promise<PriceSuggestion | undefined> {
  return fetchPriceSuggestion(query);
}

// Botão "qual carro é ideal pra mim?" — mesma lógica de Server Action que
// suggestPriceAction acima: evita o navegador falar direto com a API.
export async function recommendVehicleAction(input: VehicleProfileInput): Promise<RecommendVehicleResult> {
  return recommendVehicle(input);
}

// Mesma ideia acima, pra imóvel.
export async function recommendPropertyAction(input: PropertyProfileInput): Promise<RecommendPropertyResult> {
  return recommendProperty(input);
}

function num(formData: FormData, key: string): number | undefined {
  const raw = formData.get(key);
  if (raw === null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

// Gera o rascunho e manda de volta pro próprio /anunciar via querystring
// (?draftTitle=...), que o formulário lê como defaultValue — evita
// transformar a tela inteira num client component só pra pré-preencher
// título/descrição (mesma técnica do "preset" no Passaporte Digital).
export async function generateListingDraftAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const assetType = formData.get("assetType") === "property" ? "property" : "vehicle";
  const freeText = str(formData, "freeText");

  const result = await generateListingDraft({ assetType, freeText }, session.accessToken);
  if (!result.ok) {
    redirect(`/anunciar?tipo=${assetType}&error=${encodeURIComponent(result.error)}`);
  }

  const params = new URLSearchParams({ tipo: assetType, draftTitle: result.draft.title, draftDescription: result.draft.description });
  if (result.draft.suggestedPrice) params.set("draftPrice", String(result.draft.suggestedPrice));
  redirect(`/anunciar?${params.toString()}`);
}

// Leitura automática do CRLV (ver AiService.extractCrlvData). O formData já
// chega com o campo "crlv" (File) e "plateStart" — repassa direto pro
// backend, sem reempacotar, e volta pro próprio /anunciar com os dados
// extraídos pré-preenchidos via querystring (mesma técnica do rascunho por
// texto livre acima).
export async function extractCrlvAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const result = await extractCrlvData(formData, session.accessToken);
  if (!result.ok) {
    redirect(`/anunciar?tipo=vehicle&error=${encodeURIComponent(result.error)}`);
  }

  const data = result.data;
  const params = new URLSearchParams({ tipo: "vehicle" });
  if (data.brand) params.set("draftBrand", data.brand);
  if (data.model) params.set("draftModel", data.model);
  if (data.version) params.set("draftVersion", data.version);
  if (data.yearManufacture) params.set("draftYearManufacture", String(data.yearManufacture));
  if (data.yearModel) params.set("draftYearModel", String(data.yearModel));
  if (data.fuelType) params.set("draftFuelType", data.fuelType);
  if (data.color) params.set("draftColor", data.color);
  if (data.plate) params.set("draftPlate", data.plate);
  redirect(`/anunciar?${params.toString()}`);
}

export async function createListingAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const assetType = formData.get("assetType") === "property" ? "property" : "vehicle";
  const core = {
    title: str(formData, "title"),
    description: str(formData, "description"),
    price: num(formData, "price") ?? 0,
    city: str(formData, "city"),
    state: str(formData, "state").toUpperCase(),
    neighborhood: str(formData, "neighborhood") || undefined,
  };

  const input: CreateListingInput =
    assetType === "vehicle"
      ? {
          assetType: "vehicle",
          ...core,
          brand: str(formData, "brand"),
          model: str(formData, "model"),
          version: str(formData, "version") || undefined,
          yearManufacture: num(formData, "yearManufacture") ?? 0,
          yearModel: num(formData, "yearModel") ?? 0,
          mileage: num(formData, "mileage") ?? 0,
          transmission: str(formData, "transmission") as "manual" | "automatic",
          fuelType: str(formData, "fuelType") as
            | "flex"
            | "gasoline"
            | "ethanol"
            | "diesel"
            | "electric"
            | "hybrid",
          color: str(formData, "color"),
          doors: num(formData, "doors"),
          plate: str(formData, "plate") || undefined,
        }
      : {
          assetType: "property",
          ...core,
          propertyType: str(formData, "propertyType") as "house" | "apartment" | "land" | "commercial",
          purpose: str(formData, "purpose") as "sale" | "rent",
          bedrooms: num(formData, "bedrooms"),
          bathrooms: num(formData, "bathrooms"),
          parkingSpots: num(formData, "parkingSpots"),
          areaM2: num(formData, "areaM2") ?? 0,
          condoFee: num(formData, "condoFee"),
          iptu: num(formData, "iptu"),
          streetAddress: str(formData, "streetAddress"),
        };

  const result = await createListing(input, session.accessToken);
  if (!result.ok) {
    redirect(`/anunciar?tipo=${assetType}&error=${encodeURIComponent(result.error)}`);
  }

  revalidatePath("/");
  revalidatePath("/busca");
  revalidatePath("/conta/anuncios");
  redirect(`/anuncio/${result.listing.id}`);
}

export async function updateListingStatusAction(listingId: string, status: ListingStatus): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  await updateListingStatus(listingId, status, session.accessToken);
  revalidatePath("/");
  revalidatePath("/busca");
  revalidatePath("/conta/anuncios");
  revalidatePath(`/anuncio/${listingId}`);
}

export async function uploadPhotosAction(listingId: string, formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const result = await uploadListingPhotos(listingId, formData, session.accessToken);
  if (!result.ok) {
    redirect(`/anuncio/${listingId}/fotos?erro=${encodeURIComponent(result.error)}`);
  }

  // Melhor esforço: sem IA configurada ou se a chamada falhar,
  // classifyListingPhotos devolve undefined e as fotos ficam na ordem que
  // já foram enviadas — nunca trava o upload por causa disso.
  await classifyListingPhotos(listingId, session.accessToken);

  revalidatePath("/");
  revalidatePath("/busca");
  revalidatePath(`/anuncio/${listingId}`);
  revalidatePath(`/anuncio/${listingId}/fotos`);
  redirect(`/anuncio/${listingId}/fotos`);
}

// Botões de reorganizar na galeria (ver components/PhotoGallery.tsx) — a
// sugestão automática acima nunca é a palavra final.
export async function reorderPhotosAction(listingId: string, input: ReorderPhotosInput): Promise<ReorderPhotosResult> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const result = await reorderListingPhotos(listingId, input, session.accessToken);
  if (result.ok) {
    revalidatePath(`/anuncio/${listingId}`);
    revalidatePath(`/anuncio/${listingId}/fotos`);
  }
  return result;
}

export async function updatePhotoCaptionAction(listingId: string, photoId: string, caption: string): Promise<boolean> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const ok = await updatePhotoCaption(listingId, photoId, caption, session.accessToken);
  if (ok) revalidatePath(`/anuncio/${listingId}/fotos`);
  return ok;
}

export async function reclassifyPhotosAction(listingId: string): Promise<Photo[] | undefined> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const photos = await classifyListingPhotos(listingId, session.accessToken);
  if (photos) {
    revalidatePath(`/anuncio/${listingId}`);
    revalidatePath(`/anuncio/${listingId}/fotos`);
  }
  return photos;
}

export async function deletePhotoAction(listingId: string, photoId: string): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  await deleteListingPhoto(listingId, photoId, session.accessToken);
  revalidatePath("/");
  revalidatePath("/busca");
  revalidatePath(`/anuncio/${listingId}`);
  revalidatePath(`/anuncio/${listingId}/fotos`);
}

export type ImportListingsRowError = { row: number; ok: false; error?: string; title?: string };
type ImportListingsRowResult = { row: number; ok: true; title?: string } | ImportListingsRowError;
export type ImportListingsSummary = { total: number; success: number; errors: ImportListingsRowError[] };

// Importação em lote: cada linha do CSV vira uma chamada normal a
// createListing (mesma validação, mesmo "nasce pending_review" de sempre) —
// uma linha ruim não derruba as outras, só entra no resumo como erro. Sem
// endpoint novo na API: é a mesma POST /listings de sempre, repetida.
export async function importListingsCsvAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/parceiro/anuncios/importar?error=${encodeURIComponent("Selecione um arquivo CSV.")}`);
  }

  const text = await file.text();
  const parsedRows = parseListingsCsv(text);
  if (parsedRows.length === 0) {
    redirect(`/parceiro/anuncios/importar?error=${encodeURIComponent("O CSV está vazio ou não tem linhas de dados.")}`);
  }

  const results: ImportListingsRowResult[] = [];
  for (const { row, result } of parsedRows) {
    if (!result.ok) {
      results.push({ row, ok: false, error: result.error });
      continue;
    }
    const created = await createListing(result.input, session.accessToken);
    results.push(
      created.ok
        ? { row, ok: true, title: created.listing.title }
        : { row, ok: false, error: created.error, title: result.input.title },
    );
  }

  revalidatePath("/");
  revalidatePath("/busca");
  revalidatePath("/conta/anuncios");
  revalidatePath("/parceiro/anuncios");

  const allErrors = results.filter((r) => !r.ok);
  const summary = { total: results.length, success: results.length - allErrors.length, errors: allErrors.slice(0, 20) };
  redirect(`/parceiro/anuncios/importar?resultado=${encodeURIComponent(JSON.stringify(summary))}`);
}

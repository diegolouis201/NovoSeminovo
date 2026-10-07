"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { CreateListingInput, ListingStatus } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { createListing, deleteListingPhoto, updateListingStatus, uploadListingPhotos } from "@/lib/api";
import { parseListingsCsv } from "@/lib/csv-listings";

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function num(formData: FormData, key: string): number | undefined {
  const raw = formData.get(key);
  if (raw === null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
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

  revalidatePath("/");
  revalidatePath("/busca");
  revalidatePath(`/anuncio/${listingId}`);
  revalidatePath(`/anuncio/${listingId}/fotos`);
  redirect(`/anuncio/${listingId}/fotos`);
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

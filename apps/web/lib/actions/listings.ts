"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { CreateListingInput, ListingStatus } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { createListing, deleteListingPhoto, updateListingStatus, uploadListingPhotos } from "@/lib/api";

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

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { createSavedSearch, deleteSavedSearch, updateSavedSearchAlert } from "@/lib/api";

function str(formData: FormData, key: string): string | undefined {
  return String(formData.get(key) ?? "").trim() || undefined;
}

function num(formData: FormData, key: string): number | undefined {
  const raw = formData.get(key);
  if (raw === null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

// Recebe o mesmo formulário de filtros de /busca — os campos ausentes (ex.:
// bedroomsMin quando assetType é vehicle) simplesmente não existem no form.
export async function saveSearchAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const assetType = formData.get("assetType") === "property" ? "property" : "vehicle";
  await createSavedSearch(
    {
      assetType,
      filters: {
        q: str(formData, "q"),
        city: str(formData, "city"),
        priceMin: num(formData, "priceMin"),
        priceMax: num(formData, "priceMax"),
        yearMin: num(formData, "yearMin"),
        yearMax: num(formData, "yearMax"),
        bedroomsMin: num(formData, "bedroomsMin"),
      },
    },
    session.accessToken,
  );

  revalidatePath("/conta/buscas-salvas");

  const query = new URLSearchParams();
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && value !== "") query.set(key, value);
  }
  query.set("buscaSalva", "1");
  redirect(`/busca?${query.toString()}`);
}

export async function toggleSavedSearchAlertAction(id: string, formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  await updateSavedSearchAlert(id, formData.get("alertEnabled") === "true", session.accessToken);
  revalidatePath("/conta/buscas-salvas");
}

export async function deleteSavedSearchAction(id: string): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  await deleteSavedSearch(id, session.accessToken);
  revalidatePath("/conta/buscas-salvas");
}

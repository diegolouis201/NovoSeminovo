"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { markFinancingDealPaid, registerFinancingDeal, updateRebateTier } from "@/lib/api";

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function num(formData: FormData, key: string): number | undefined {
  const raw = formData.get(key);
  if (raw === null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

// Aceita tanto o id puro do anúncio quanto o link completo (ex.: colado da
// barra de endereço) — pega só o último pedaço do caminho, que é o id nos
// dois casos.
function extractListingId(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, "");
  const segments = trimmed.split("/");
  return segments[segments.length - 1] ?? trimmed;
}

export async function registerFinancingDealAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const listingId = extractListingId(str(formData, "listingRef"));
  const financingProvider = str(formData, "financingProvider");
  const assetValue = num(formData, "assetValue");
  const financedAmount = num(formData, "financedAmount");
  const commissionRate = num(formData, "commissionRate");

  if (!listingId || !financingProvider || !assetValue || !financedAmount) {
    redirect("/admin/recompensas?error=" + encodeURIComponent("Preencha todos os campos obrigatórios."));
  }

  const result = await registerFinancingDeal(
    { listingId, financingProvider, assetValue: assetValue!, financedAmount: financedAmount!, commissionRate },
    session.accessToken,
  );
  if (!result.ok) {
    redirect(`/admin/recompensas?error=${encodeURIComponent(result.error)}`);
  }

  revalidatePath("/admin/recompensas");
  revalidatePath("/conta/recompensas");
  redirect("/admin/recompensas?sucesso=Negócio registrado.");
}

export async function markFinancingDealPaidAction(dealId: string, formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const note = str(formData, "note") || undefined;
  await markFinancingDealPaid(dealId, note, session.accessToken);
  revalidatePath("/admin/recompensas");
  revalidatePath("/conta/recompensas");
}

export async function updateRebateTierAction(tierId: string, formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const tierName = str(formData, "tierName") || undefined;
  const minVolume = num(formData, "minVolume");
  const rebatePercent = num(formData, "rebatePercent");

  await updateRebateTier(tierId, { tierName, minVolume, rebatePercent }, session.accessToken);
  revalidatePath("/admin/recompensas");
  revalidatePath("/conta/recompensas");
}

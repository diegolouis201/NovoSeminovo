"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { markFinancingCommissionReceived, markFinancingDealPaid } from "@/lib/api";

// Cashback no financiamento (/admin/recompensas): comissão recebida do banco
// libera o cashback; depois do Pix, marca como pago.

function done(error?: string) {
  revalidatePath("/admin/recompensas");
  revalidatePath("/admin/financiamentos");
  revalidatePath("/conta/recompensas");
  redirect(error ? `/admin/recompensas?error=${encodeURIComponent(error)}` : "/admin/recompensas");
}

export async function markCommissionReceivedAction(dealId: string): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");
  const result = await markFinancingCommissionReceived(dealId, session.accessToken);
  done(result.ok ? undefined : result.error);
}

export async function markFinancingDealPaidAction(dealId: string, formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");
  const note = String(formData.get("note") ?? "").trim() || undefined;
  const result = await markFinancingDealPaid(dealId, note, session.accessToken);
  done(result.ok ? undefined : result.error);
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { markFinancingCommissionReceived } from "@/lib/api";

// Comissões de financiamento (/admin/comissoes): o banco ou a Credihome pagou
// a comissão do financiamento fechado.

function done(error?: string) {
  revalidatePath("/admin/comissoes");
  revalidatePath("/admin/financiamentos");
  redirect(error ? `/admin/comissoes?error=${encodeURIComponent(error)}` : "/admin/comissoes");
}

export async function markCommissionReceivedAction(dealId: string): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");
  const result = await markFinancingCommissionReceived(dealId, session.accessToken);
  done(result.ok ? undefined : result.error);
}

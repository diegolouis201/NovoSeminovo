"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { adminListingAction } from "@/lib/api";

// Suspender/reativar pelo painel de anúncios; volta para a mesma aba e filtros.
export async function adminListingActionForm(id: string, returnQuery: string, formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");
  const action = formData.get("action") === "reactivate" ? "reactivate" : "suspend";
  const reason = String(formData.get("reason") ?? "").trim() || undefined;
  const result = await adminListingAction(id, { action, reason }, session.accessToken);
  revalidatePath("/admin/anuncios");
  const params = new URLSearchParams(returnQuery);
  params.delete("sucesso");
  params.delete("erro");
  if (result.ok) params.set("sucesso", action === "suspend" ? "Anúncio suspenso; o dono foi avisado com o motivo." : "Anúncio de volta ao ar; o dono foi avisado.");
  else params.set("erro", result.error);
  redirect(`/admin/anuncios?${params}`);
}

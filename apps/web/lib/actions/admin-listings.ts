"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { adminDeleteAccount, adminDeleteListing, adminListingAction } from "@/lib/api";

async function token(): Promise<string> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");
  return session.accessToken;
}

// Volta para a mesma página e filtros, com a mensagem do resultado.
function back(returnTo: string, result: { ok: true } | { ok: false; error: string }, success: string): never {
  const [path = "", query = ""] = returnTo.split("?");
  const safePath = path.startsWith("/admin/") ? path : "/admin/anuncios";
  const params = new URLSearchParams(query);
  params.delete("sucesso");
  params.delete("erro");
  params.set(result.ok ? "sucesso" : "erro", result.ok ? success : result.error);
  revalidatePath(safePath);
  redirect(`${safePath}?${params}`);
}

// Suspender/reativar pelo painel de anúncios.
export async function adminListingActionForm(id: string, returnTo: string, formData: FormData): Promise<void> {
  const action = formData.get("action") === "reactivate" ? "reactivate" : "suspend";
  const reason = String(formData.get("reason") ?? "").trim() || undefined;
  const result = await adminListingAction(id, { action, reason }, await token());
  back(returnTo, result, action === "suspend" ? "Anúncio suspenso; o dono foi avisado com o motivo." : "Anúncio de volta ao ar; o dono foi avisado.");
}

export async function adminDeleteListingForm(id: string, returnTo: string, formData: FormData): Promise<void> {
  const result = await adminDeleteListing(
    id,
    { password: String(formData.get("password") ?? ""), reason: String(formData.get("reason") ?? "").trim() },
    await token(),
  );
  back(returnTo, result, "Anúncio excluído; o dono foi avisado com o motivo.");
}

export async function adminDeleteAccountForm(id: string, formData: FormData): Promise<void> {
  const result = await adminDeleteAccount(
    id,
    { password: String(formData.get("password") ?? ""), reason: String(formData.get("reason") ?? "").trim() },
    await token(),
  );
  if (!result.ok) back(`/admin/usuarios/${id}`, result, "");
  const { listingsDeleted, listingsKept } = result.value;
  back(
    `/admin/usuarios/${id}`,
    result,
    `Conta excluída: dados pessoais apagados, ${listingsDeleted} anúncio(s) apagado(s)${listingsKept ? ` e ${listingsKept} guardado(s) fora do ar por terem pagamento` : ""}.`,
  );
}

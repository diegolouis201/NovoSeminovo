"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { deleteStoreEarning, saveStoreEarning } from "@/lib/api";

// Lançamento mensal da comissão das lojas parceiras (Amazon, Mercado Livre…)
// no /admin/painel — o valor sai do painel de cada programa de afiliados.
export async function saveStoreEarningAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");
  const back = String(formData.get("back") ?? "/admin/painel");
  const amount = Number(String(formData.get("amount") ?? "").replace(/\./g, "").replace(",", "."));
  const result = await saveStoreEarning(
    {
      month: String(formData.get("month") ?? ""),
      store: String(formData.get("store") ?? "") as Parameters<typeof saveStoreEarning>[0]["store"],
      amount,
      note: String(formData.get("note") ?? "").trim() || undefined,
    },
    session.accessToken,
  );
  revalidatePath("/admin/painel");
  redirect(`${back}${back.includes("?") ? "&" : "?"}${result.ok ? "sucesso=Receita da loja lançada" : `erro=${encodeURIComponent(result.error)}`}#lojas`);
}

export async function deleteStoreEarningAction(id: string, back: string): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");
  await deleteStoreEarning(id, session.accessToken);
  revalidatePath("/admin/painel");
  redirect(`${back}#lojas`);
}

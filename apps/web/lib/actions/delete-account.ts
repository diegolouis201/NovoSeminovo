"use server";

import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { deleteMyAccount } from "@/lib/api";

export type DeleteAccountState = { error?: string };

export async function deleteMyAccountAction(_state: DeleteAccountState, formData: FormData): Promise<DeleteAccountState> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");
  if (formData.get("confirm") !== "on") return { error: "Marque a caixa confirmando que entendeu." };
  const password = String(formData.get("password") ?? "");
  if (!password) return { error: "Digite a sua senha." };

  const result = await deleteMyAccount(password, session.accessToken);
  if (!result.ok) return { error: result.error };
  await signOut({ redirectTo: "/?contaExcluida=1" });
  return {};
}

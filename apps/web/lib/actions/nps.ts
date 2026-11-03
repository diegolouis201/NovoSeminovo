"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { answerNps } from "@/lib/api";

export async function answerNpsAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar?voltar=/parceiro");
  const score = Number(formData.get("score"));
  const comment = String(formData.get("comment") ?? "").trim() || undefined;
  const result = await answerNps({ score, comment }, session.accessToken);
  revalidatePath("/parceiro");
  redirect(result.ok ? "/parceiro?nps=obrigado" : `/parceiro?error=${encodeURIComponent(result.error)}`);
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { createReview, decideReview, reportReview } from "@/lib/api";

export async function createReviewAction(listingId: string, formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const rating = Number(formData.get("rating") ?? 0);
  const comment = String(formData.get("comment") ?? "").trim() || undefined;
  const result = await createReview(listingId, { rating, comment }, session.accessToken);

  if (!result.ok) {
    redirect(`/anuncio/${listingId}/avaliar?erro=${encodeURIComponent(result.error)}`);
  }
  revalidatePath(`/anuncio/${listingId}`);
  redirect(`/anuncio/${listingId}?avaliacaoEnviada=1`);
}

// O avaliado (pessoa ou loja) denuncia uma avaliação; o admin decide.
export async function reportReviewAction(reviewId: string, formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect(`/entrar?voltar=/avaliacoes/${reviewId}/denunciar`);
  const reason = String(formData.get("reason") ?? "").trim();
  const result = await reportReview(reviewId, reason, session.accessToken);
  if (!result.ok) redirect(`/avaliacoes/${reviewId}/denunciar?erro=${encodeURIComponent(result.error)}`);
  redirect(`/avaliacoes/${reviewId}/denunciar?enviado=1`);
}

export async function adminReviewDecisionAction(reviewId: string, formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");
  const action = formData.get("action") === "reject" ? "reject" : "approve";
  const note = String(formData.get("note") ?? "").trim() || undefined;
  await decideReview(reviewId, action, note, session.accessToken);
  revalidatePath("/admin");
}

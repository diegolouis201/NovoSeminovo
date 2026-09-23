"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { createReview } from "@/lib/api";

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

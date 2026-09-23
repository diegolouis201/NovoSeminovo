"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { createReport } from "@/lib/api";

export async function createReportAction(listingId: string, formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const reason = String(formData.get("reason") ?? "").trim();
  const result = await createReport(listingId, reason, session.accessToken);

  if (!result.ok) {
    redirect(`/anuncio/${listingId}/denunciar?erro=${encodeURIComponent(result.error)}`);
  }
  redirect(`/anuncio/${listingId}?denunciaEnviada=1`);
}

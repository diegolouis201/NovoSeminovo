"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ReportStatus } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { moderateListing, setPartnerType, updatePartnerAdminNotes, updateReportStatus, verifyPartner } from "@/lib/api";

export async function moderateListingAction(listingId: string, formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const action = formData.get("action") === "reject" ? "reject" : "approve";
  const reason = String(formData.get("reason") ?? "").trim() || undefined;

  await moderateListing(listingId, { action, reason }, session.accessToken);
  revalidatePath("/admin");
  revalidatePath("/busca");
  revalidatePath("/");
}

export async function verifyPartnerAction(partnerId: string): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  await verifyPartner(partnerId, session.accessToken);
  revalidatePath("/admin");
}

export async function setPartnerTypeAction(partnerId: string, formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  await setPartnerType(partnerId, String(formData.get("type") ?? ""), session.accessToken);
  revalidatePath("/admin");
}

export async function updateReportStatusAction(reportId: string, formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const status: ReportStatus = formData.get("status") === "dismissed" ? "dismissed" : "reviewed";

  await updateReportStatus(reportId, status, session.accessToken);
  revalidatePath("/admin");
}

export async function savePartnerAdminNotesAction(partnerId: string, adminNotes: string): Promise<{ ok: boolean }> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const ok = await updatePartnerAdminNotes(partnerId, adminNotes.slice(0, 2000), session.accessToken);
  if (ok) revalidatePath("/admin/assinaturas");
  return { ok };
}

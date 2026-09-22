"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { moderateListing, verifyPartner } from "@/lib/api";

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

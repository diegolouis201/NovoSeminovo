"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { CreatePartnerInput, LeadStatus, PartnerType } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { createPartner, updateLeadStatus } from "@/lib/api";

export async function createPartnerAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const input: CreatePartnerInput = {
    type: String(formData.get("type")) as PartnerType,
    legalName: String(formData.get("legalName") ?? "").trim(),
    document: String(formData.get("document") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || undefined,
    address: String(formData.get("address") ?? "").trim() || undefined,
  };

  const result = await createPartner(input, session.accessToken);
  if (!result.ok) {
    redirect(`/parceiro?error=${encodeURIComponent(result.error)}`);
  }

  revalidatePath("/parceiro");
  redirect("/parceiro");
}

export async function updateLeadStatusAction(leadId: string, formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const status = String(formData.get("status") ?? "") as LeadStatus;
  await updateLeadStatus(leadId, status, session.accessToken);
  revalidatePath("/parceiro");
  revalidatePath("/parceiro/leads");
}

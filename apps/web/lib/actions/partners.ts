"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { CreatePartnerInput, LeadStatus, PartnerType } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import {
  addPartnerMember,
  cancelSubscription,
  confirmCheckoutSession,
  createPartner,
  removePartnerMember,
  startCheckoutSession,
  subscribeToPlan,
  updateLeadStatus,
} from "@/lib/api";

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

export async function addPartnerMemberAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const email = String(formData.get("email") ?? "").trim();
  const result = await addPartnerMember(email, session.accessToken);
  if (!result.ok) {
    redirect(`/parceiro/equipe?error=${encodeURIComponent(result.error)}`);
  }

  revalidatePath("/parceiro/equipe");
  redirect("/parceiro/equipe");
}

export async function removePartnerMemberAction(memberId: string): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  await removePartnerMember(memberId, session.accessToken);
  revalidatePath("/parceiro/equipe");
}

export async function subscribeToPlanAction(planId: string): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const result = await subscribeToPlan(planId, session.accessToken);
  if (!result.ok) {
    redirect(`/parceiro/plano?error=${encodeURIComponent(result.error)}`);
  }

  revalidatePath("/parceiro");
  revalidatePath("/parceiro/plano");
  redirect("/parceiro/plano");
}

export async function cancelSubscriptionAction(): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  await cancelSubscription(session.accessToken);
  revalidatePath("/parceiro");
  revalidatePath("/parceiro/plano");
}

// Com Stripe configurado na API, "Contratar" usa isto em vez de
// subscribeToPlanAction: cria a sessão de Checkout e manda o navegador pra
// página do Stripe de verdade (redirect aceita URL externa numa Server
// Action, o navegador segue normalmente).
export async function startCheckoutAction(planId: string): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const result = await startCheckoutSession(planId, session.accessToken);
  if (!result.ok) {
    redirect(`/parceiro/plano?error=${encodeURIComponent(result.error)}`);
  }

  redirect(result.url);
}

// Chamado pela própria página quando a pessoa volta do Checkout com
// ?checkout_session_id= na URL — confirma e ativa a assinatura antes de
// redirecionar pra uma URL limpa (sem o parâmetro, pra não confirmar de novo
// se a pessoa der F5).
export async function confirmCheckoutAction(sessionId: string): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const ok = await confirmCheckoutSession(sessionId, session.accessToken);
  revalidatePath("/parceiro");
  revalidatePath("/parceiro/plano");
  redirect(ok ? "/parceiro/plano" : "/parceiro/plano?error=Não foi possível confirmar o pagamento ainda. Tente recarregar em alguns segundos.");
}

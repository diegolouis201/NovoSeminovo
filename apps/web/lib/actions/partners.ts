"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { CnpjLookup, CreateLeadInput, CreatePartnerInput, HighlightLevel, LeadStatus, LeadSummary, PartnerType, UpdateLeadInput } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import {
  addPartnerMember,
  createPartnerLead,
  updateListingStatus,
  updatePartnerLead,
  updatePartnerSale,
  type ApiResult,
  cancelSubscription,
  confirmCheckoutSession,
  createPartner,
  lookupCnpj,
  setListingHighlight,
  removePartnerMember,
  startBillingPortalSession,
  startCheckoutSession,
  subscribeToPlan,
  updateLeadStatus,
  uploadPartnerLogo,
} from "@/lib/api";

export async function createPartnerAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const input: CreatePartnerInput = {
    type: (String(formData.get("type") ?? "") || undefined) as PartnerType | undefined,
    legalName: String(formData.get("legalName") ?? "").trim() || undefined,
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

export async function uploadPartnerLogoAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const result = await uploadPartnerLogo(formData, session.accessToken);
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

export async function openBillingPortalAction(): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const result = await startBillingPortalSession(session.accessToken);
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

// ---------- Kanban de leads e vendas (/parceiro/leads, /parceiro/vendas) ----------
// Devolvem resultado (em vez de redirect) porque quem chama é o kanban, um
// componente de cliente que mostra o erro no próprio card.

export async function createLeadAction(input: CreateLeadInput): Promise<ApiResult<LeadSummary>> {
  const session = await auth();
  if (!session?.accessToken) return { ok: false, error: "Sua sessão expirou. Entre de novo." };
  const result = await createPartnerLead(input, session.accessToken);
  revalidatePath("/parceiro/leads");
  return result;
}

export async function updateLeadAction(leadId: string, input: UpdateLeadInput): Promise<ApiResult<LeadSummary>> {
  const session = await auth();
  if (!session?.accessToken) return { ok: false, error: "Sua sessão expirou. Entre de novo." };
  const result = await updatePartnerLead(leadId, input, session.accessToken);
  revalidatePath("/parceiro/leads");
  revalidatePath("/parceiro");
  return result;
}

// Lead ganho → registra a venda do anúncio (valor e custo) de uma vez.
export async function registerSaleFromLeadAction(
  listingId: string,
  soldPrice: number,
  costPrice?: number,
): Promise<ApiResult> {
  const session = await auth();
  if (!session?.accessToken) return { ok: false, error: "Sua sessão expirou. Entre de novo." };
  const ok = await updateListingStatus(listingId, "sold", session.accessToken, soldPrice, costPrice);
  if (!ok) return { ok: false, error: "Não foi possível registrar a venda — o anúncio precisa estar ativo ou pausado." };
  for (const path of ["/parceiro", "/parceiro/vendas", "/parceiro/anuncios", "/parceiro/leads", "/busca"]) revalidatePath(path);
  return { ok: true, value: undefined };
}

export async function updateSaleAction(listingId: string, formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");
  const money = (key: string) => {
    const raw = String(formData.get(key) ?? "").replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
    return raw ? Number(raw) : undefined;
  };
  const costPrice = money("costPrice");
  await updatePartnerSale(
    listingId,
    { soldPrice: money("soldPrice"), costPrice: costPrice === undefined ? null : costPrice },
    session.accessToken,
  );
  revalidatePath("/parceiro/vendas");
}

// Botão "Buscar" do CNPJ (cadastro de empresa e "Sou loja ou imobiliária").
export async function cnpjLookupAction(cnpj: string): Promise<ApiResult<CnpjLookup>> {
  return lookupCnpj(cnpj);
}

// Destaque / super destaque no estoque (/parceiro/anuncios).
export async function setHighlightAction(listingId: string, level: HighlightLevel): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");
  const result = await setListingHighlight(listingId, level, session.accessToken);
  revalidatePath("/parceiro/anuncios");
  if (!result.ok) redirect(`/parceiro/anuncios?error=${encodeURIComponent(result.error)}`);
  redirect("/parceiro/anuncios");
}

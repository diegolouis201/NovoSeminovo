"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { adminAffiliateAction, adminAffiliatePayout, applyAffiliate, recordAffiliateClick } from "@/lib/api";
import { cleanReferralCode } from "@/lib/referral";

// Conta o clique de quem chegou pelo link do afiliado (o cookie é gravado no
// navegador pelo ReferralCapture).
export async function recordAffiliateClickAction(code: string): Promise<void> {
  const clean = cleanReferralCode(code);
  if (clean) await recordAffiliateClick(clean);
}

export type AffiliateApplyState = { error?: string; ok?: boolean };

export async function applyAffiliateAction(_prev: AffiliateApplyState, formData: FormData): Promise<AffiliateApplyState> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar?voltar=/afiliado");
  const field = (name: string) => String(formData.get(name) ?? "").trim();
  const result = await applyAffiliate(
    {
      channels: field("channels"),
      audience: field("audience") || undefined,
      pixKey: field("pixKey"),
      acceptTerms: formData.get("acceptTerms") === "on",
    } as Parameters<typeof applyAffiliate>[0],
    session.accessToken,
  );
  if (!result.ok) return { error: result.error };
  revalidatePath("/afiliado");
  return { ok: true };
}

export async function adminAffiliateActionAction(affiliateId: string, formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");
  const result = await adminAffiliateAction(affiliateId, String(formData.get("action") ?? ""), String(formData.get("note") ?? "").trim(), session.accessToken);
  revalidatePath("/admin/afiliados");
  if (!result.ok) redirect(`/admin/afiliados?error=${encodeURIComponent(result.error)}`);
}

export async function adminAffiliatePayoutAction(affiliateId: string, formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");
  const result = await adminAffiliatePayout(affiliateId, String(formData.get("note") ?? "").trim(), session.accessToken);
  revalidatePath("/admin/afiliados");
  redirect(
    result.ok
      ? `/admin/afiliados?sucesso=${encodeURIComponent(`Pagamento de R$ ${result.value.paid.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} registrado.`)}`
      : `/admin/afiliados?error=${encodeURIComponent(result.error)}`,
  );
}

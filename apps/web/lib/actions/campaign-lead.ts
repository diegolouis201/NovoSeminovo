"use server";

import { visitorIp } from "@/lib/visitante/ip";
import { CampaignLeadInputSchema } from "@novoseminovo/shared-types";
import { acquisitionHeaders } from "@/lib/acquisition";
import { metaTracking } from "@/lib/meta-server";
import { sendCampaignLead } from "@/lib/api";

export type CampaignLeadState = { status: "idle" } | { status: "sent" } | { status: "error"; error: string };

// Formulário de /para-lojas/comecar. Confere aqui (mensagem rápida) e a API
// confere de novo. A origem do anúncio (cookie ns_origem) vai no cabeçalho.
export async function sendCampaignLeadAction(_state: CampaignLeadState, formData: FormData): Promise<CampaignLeadState> {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : undefined;
  };
  const website = text("website");
  if (website?.trim()) return { status: "sent" };
  const parsed = CampaignLeadInputSchema.safeParse({
    name: text("name"),
    company: text("company"),
    businessType: text("businessType"),
    city: text("city"),
    state: text("state"),
    phone: text("phone"),
    email: text("email"),
    cnpj: text("cnpj") || undefined,
    consent: formData.get("consent") === "on",
  });
  if (!parsed.success) return { status: "error", error: parsed.error.issues[0]?.message ?? "Confira os dados do formulário." };
  const meta = metaTracking("Lead", "lojas");
  const result = await sendCampaignLead(parsed.data, { clientIp: visitorIp(), extraHeaders: { ...acquisitionHeaders(), ...meta.headers } });
  if (result.ok) meta.queue();
  return result.ok ? { status: "sent" } : { status: "error", error: result.error };
}

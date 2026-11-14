"use server";

import { headers } from "next/headers";
import { CampaignLeadInputSchema } from "@novoseminovo/shared-types";
import { acquisitionHeaders } from "@/lib/acquisition";
import { sendCampaignLead } from "@/lib/api";

export type CampaignLeadState = { status: "idle" } | { status: "sent" } | { status: "error"; error: string };

function visitorIp(): string | undefined {
  const forwarded = headers().get("x-forwarded-for") ?? headers().get("x-real-ip");
  return forwarded?.split(",")[0]?.trim() || undefined;
}

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
  const result = await sendCampaignLead(parsed.data, { clientIp: visitorIp(), extraHeaders: acquisitionHeaders() });
  return result.ok ? { status: "sent" } : { status: "error", error: result.error };
}

"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import type { AgentConversationView, AgentKind, FinancingLeadStatus } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { acquisitionHeaders } from "@/lib/acquisition";
import {
  fetchAgentConversation,
  fetchAgentStatus,
  sendAgentMessage,
  updateFinancingLead,
  type SendAgentMessageResult,
} from "@/lib/api";

export async function agentStatusAction(): Promise<boolean> {
  return (await fetchAgentStatus()).enabled;
}

// O navegador fala com o Next, e o Next com a API — sem isto a API veria
// sempre o IP do servidor do site e o limite "por pessoa" viraria um limite
// global. O Caddy preenche x-forwarded-for com o IP de quem acessou.
function visitorIp(): string | undefined {
  const forwarded = headers().get("x-forwarded-for") ?? headers().get("x-real-ip");
  return forwarded?.split(",")[0]?.trim() || undefined;
}

export async function sendAgentMessageAction(
  kind: AgentKind,
  conversationId: string | undefined,
  message: string,
): Promise<SendAgentMessageResult> {
  const session = await auth();
  return sendAgentMessage(
    kind,
    { conversationId, message },
    { accessToken: session?.accessToken, clientIp: visitorIp(), extraHeaders: acquisitionHeaders() },
  );
}

export async function loadAgentConversationAction(
  kind: AgentKind,
  conversationId: string,
): Promise<AgentConversationView | undefined> {
  const session = await auth();
  return fetchAgentConversation(kind, conversationId, session?.accessToken);
}

// Arrastar o card de coluna (ou trocar a etapa no próprio card) — devolve o
// resultado pro quadro desfazer o movimento se a API recusar.
export async function moveFinancingLeadAction(
  id: string,
  status: FinancingLeadStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.accessToken) return { ok: false, error: "Sua sessão expirou. Entre de novo." };
  const result = await updateFinancingLead(id, { status }, session.accessToken);
  revalidatePath("/admin/financiamentos");
  return result;
}

function moneyField(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  // Aceita "350.000,00", "350.000", "R$ 350000" e "350000.50" — o que a
  // pessoa digitar. Ponto seguido de grupos de exatamente 3 dígitos é
  // separador de milhar (jeito brasileiro), não decimal.
  const digits = raw.replace(/[^\d.,]/g, "");
  const normalized = digits.includes(",")
    ? digits.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(digits)
      ? digits.replace(/\./g, "")
      : digits;
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export async function saveFinancingLeadDetailsAction(
  id: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.accessToken) return { ok: false, error: "Sua sessão expirou. Entre de novo." };
  const rateRaw = String(formData.get("commissionRate") ?? "").trim().replace(",", ".");
  const rate = rateRaw === "" ? undefined : Number(rateRaw);
  if (rate !== undefined && (!Number.isFinite(rate) || rate < 0 || rate > 100)) {
    return { ok: false, error: "Comissão precisa ser um percentual entre 0 e 100." };
  }
  const result = await updateFinancingLead(
    id,
    {
      negotiatedValue: moneyField(formData, "negotiatedValue"),
      commissionRate: rate,
      bank: String(formData.get("bank") ?? "").trim() || null,
      adminNotes: String(formData.get("adminNotes") ?? "").trim() || null,
    },
    session.accessToken,
  );
  revalidatePath("/admin/financiamentos");
  return result;
}

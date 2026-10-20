"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AgentConversationView, AgentKind, FinancingLeadStatus } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import {
  fetchAgentConversation,
  fetchAgentStatus,
  sendAgentMessage,
  updateFinancingLeadStatus,
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
    { accessToken: session?.accessToken, clientIp: visitorIp() },
  );
}

export async function loadAgentConversationAction(
  kind: AgentKind,
  conversationId: string,
): Promise<AgentConversationView | undefined> {
  const session = await auth();
  return fetchAgentConversation(kind, conversationId, session?.accessToken);
}

const LEAD_STATUSES = new Set<FinancingLeadStatus>(["new", "contacted", "converted", "lost"]);

export async function updateFinancingLeadStatusAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as FinancingLeadStatus;
  if (!id || !LEAD_STATUSES.has(status)) return;

  await updateFinancingLeadStatus(id, status, session.accessToken);
  revalidatePath("/admin/financiamentos");
}

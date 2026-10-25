"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { opsDecideApproval, opsDeleteGoal, opsRunAgent, opsSaveGoal, opsSetSuggestionStatus, opsTaskAction } from "@/lib/api";

const PAGE = "/admin/operacao";

async function token(): Promise<string> {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");
  return session.accessToken;
}

function back(result: { ok: boolean; error?: string }, success: string, anchor: string): never {
  revalidatePath(PAGE);
  redirect(`${PAGE}?${result.ok ? `sucesso=${encodeURIComponent(success)}` : `erro=${encodeURIComponent(result.error ?? "Não foi possível salvar agora.")}`}#${anchor}`);
}

export async function opsDecisionAction(id: string, formData: FormData): Promise<void> {
  const decision = formData.get("decision") === "approve" ? "approve" : "reject";
  const note = String(formData.get("note") ?? "").trim() || undefined;
  const result = await opsDecideApproval(id, decision, note, await token());
  const status = result.ok ? result.value.status : undefined;
  back(
    result,
    decision === "reject" ? "Pedido recusado." : status === "executed" ? "Aprovado e executado." : "Aprovado, mas a execução falhou — veja o motivo no histórico.",
    "aprovacoes",
  );
}

export async function opsTaskActionForm(id: string, formData: FormData): Promise<void> {
  const action = formData.get("action") === "retry" ? "retry" : "cancel";
  const result = await opsTaskAction(id, action, await token());
  back(result, action === "retry" ? "Tarefa mandada de novo para a fila." : "Tarefa cancelada.", "tarefas");
}

export async function opsSaveGoalAction(formData: FormData): Promise<void> {
  const target = Number(String(formData.get("target") ?? "").replace(/\./g, "").replace(",", "."));
  const result = await opsSaveGoal(
    {
      metric: String(formData.get("metric") ?? ""),
      segment: String(formData.get("segment") ?? "all") as "all" | "vehicle" | "property",
      period: String(formData.get("period") ?? ""),
      target,
      agent: String(formData.get("agent") ?? ""),
      note: String(formData.get("note") ?? "").trim() || undefined,
    },
    await token(),
  );
  back(result, "Meta salva.", "metas");
}

export async function opsDeleteGoalAction(id: string): Promise<void> {
  await opsDeleteGoal(id, await token());
  back({ ok: true }, "Meta apagada.", "metas");
}

export async function opsRunAgentAction(agent: string): Promise<void> {
  const result = await opsRunAgent(agent, await token());
  back(result, "Agente na fila: ele roda em até 1 minuto. Recarregue a página para ver o resultado.", "agentes");
}

export async function opsSuggestionAction(id: string, formData: FormData): Promise<void> {
  const status = formData.get("status") === "usada" ? "usada" : "descartada";
  const result = await opsSetSuggestionStatus(id, status, await token());
  back(result, status === "usada" ? "Sugestão marcada como usada." : "Sugestão descartada.", "marketing");
}

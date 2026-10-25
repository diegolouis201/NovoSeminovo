import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { z } from "zod";
import type { Prisma } from "@novoseminovo/db";
import { OPS_AGENT_LABELS } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { AdminOverviewService } from "../admin/overview.service";
import { TaskQueueService } from "./task-queue.service";
import { AGENT_TOOL_ALLOWLIST, APPROVAL_TTL_MS, actionHash, decide, type OpsTool, type OpsToolContext } from "./policy";

export type ToolOutcome =
  | { status: "done"; output: unknown }
  | { status: "awaiting_approval"; approvalId: string }
  | { status: "blocked"; reason: string }
  | { status: "invalid"; reason: string };

// Tarefas que um agente pode criar: por tarefa de origem e por dia. Segura um
// laço de "tarefa que cria tarefa" antes de virar custo.
const MAX_CHILD_TASKS = 5;
const MAX_TASKS_PER_AGENT_PER_DAY = 30;

const segment = z.enum(["all", "vehicle", "property"]).default("all");

// Ferramentas de negócio dos agentes. Toda ação passa por request(): a regra
// de cor (policy.decide) roda antes de qualquer efeito, e ação amarela só
// executa depois que um admin aprova a ação exata (approve()).
@Injectable()
export class OpsToolsService {
  private readonly tools = new Map<string, OpsTool<any>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly overview: AdminOverviewService,
    private readonly queue: TaskQueueService,
  ) {
    this.register({
      name: "ler_painel",
      color: "green",
      description: "Lê os grandes números do painel geral (receita, anúncios, leads, origens) do site todo, de carros ou de imóveis.",
      input: z.object({ segmento: segment }),
      run: async ({ segmento }) => {
        const data = await this.overview.overview(segmento ?? "all");
        return { listings: data.listings, revenue: { ...data.revenue, storeEntries: undefined }, engagement: data.engagement, users: data.users, origins: data.origins };
      },
    });

    this.register({
      name: "criar_tarefa",
      color: "green",
      description: "Cria uma tarefa para outro agente da operação.",
      input: z.object({
        agente: z.enum(Object.keys(AGENT_TOOL_ALLOWLIST) as [string, ...string[]]),
        objetivo: z.string().trim().min(5).max(500),
        segmento: segment,
      }),
      run: async ({ agente, objetivo, segmento }, context) => {
        if (context.taskId) {
          const children = await this.prisma.agentTask.count({ where: { parentId: context.taskId } });
          if (children >= MAX_CHILD_TASKS) throw new Error(`Limite de ${MAX_CHILD_TASKS} tarefas por tarefa de origem`);
        }
        const today = await this.prisma.agentTask.count({
          where: { createdBy: context.agent, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        });
        if (today >= MAX_TASKS_PER_AGENT_PER_DAY) throw new Error(`Limite de ${MAX_TASKS_PER_AGENT_PER_DAY} tarefas por dia para ${context.agent}`);
        const { task } = await this.queue.enqueue({ agent: agente, createdBy: context.agent, objective: objetivo, segment: segmento ?? "all", parentId: context.taskId });
        return { tarefaId: task.id };
      },
    });

    this.register({
      name: "suspender_anuncio",
      color: "yellow",
      description: "Suspende (pausa) um anúncio ativo e avisa o dono, com o motivo.",
      input: z.object({ anuncio_id: z.string().min(5).max(40), motivo: z.string().trim().min(10).max(300) }),
      summarize: ({ anuncio_id, motivo }) => `Suspender o anúncio ${anuncio_id} — ${motivo}`,
      impact: () => "O anúncio sai da busca até o dono corrigir; se for de loja pagante, ela perde uma vaga ativa nesse período.",
      run: async ({ anuncio_id, motivo }, context) => {
        const listing = await this.prisma.listing.findUnique({ where: { id: anuncio_id } });
        if (!listing) throw new NotFoundException("Anúncio não encontrado");
        if (listing.status !== "active") throw new ConflictException("O anúncio não está mais ativo");
        await this.prisma.$transaction([
          this.prisma.listing.update({ where: { id: anuncio_id }, data: { status: "paused" } }),
          this.prisma.moderationLog.create({
            data: { listingId: anuncio_id, adminId: context.approvedBy ?? null, automated: !context.approvedBy, action: "suspended", reason: motivo },
          }),
        ]);
        await this.notifications.notify(listing.ownerUserId, "listing_suspended", { listingId: listing.id, listingTitle: listing.title, reason: motivo });
        return { suspenso: anuncio_id };
      },
    });
  }

  register<Input>(tool: OpsTool<Input>): void {
    this.tools.set(tool.name, tool as OpsTool<any>);
  }

  definitions(agent: string): { name: string; description: string; color: string }[] {
    return (AGENT_TOOL_ALLOWLIST[agent] ?? [])
      .map((name) => this.tools.get(name))
      .filter((tool): tool is OpsTool<any> => Boolean(tool))
      .map((tool) => ({ name: tool.name, description: tool.description, color: tool.color }));
  }

  async request(agent: string, toolName: string, rawInput: unknown, context: Omit<OpsToolContext, "agent" | "approvedBy"> = {}): Promise<ToolOutcome> {
    const tool = this.tools.get(toolName);
    const decision = decide(agent, tool, toolName);
    const note = (message: string) => (context.taskId ? this.queue.event(context.taskId, "tool", message) : Promise.resolve());

    if (decision.kind === "blocked") {
      await note(`Bloqueado pelo Risco: ${decision.reason}`);
      return { status: "blocked", reason: decision.reason };
    }
    const parsed = tool!.input.safeParse(rawInput);
    if (!parsed.success) return { status: "invalid", reason: parsed.error.issues.map((issue) => issue.message).join("; ") };

    if (decision.kind === "run") {
      const output = await tool!.run(parsed.data, { agent, taskId: context.taskId });
      await note(`Usou ${tool!.name}`);
      return { status: "done", output };
    }

    // Amarela: grava o pedido com a assinatura da ação exata e para aqui.
    const paramsHash = actionHash(tool!.name, parsed.data);
    const existing = await this.prisma.agentApproval.findFirst({ where: { paramsHash, status: "pending" } });
    if (existing) return { status: "awaiting_approval", approvalId: existing.id };
    const summary = tool!.summarize?.(parsed.data) ?? tool!.name;
    const approval = await this.prisma.agentApproval.create({
      data: {
        taskId: context.taskId,
        agent,
        tool: tool!.name,
        params: parsed.data as Prisma.InputJsonValue,
        paramsHash,
        summary,
        impact: tool!.impact?.(parsed.data),
        reason: (rawInput as { motivo?: string })?.motivo,
        expiresAt: new Date(Date.now() + APPROVAL_TTL_MS),
      },
    });
    await note(`Pediu aprovação: ${summary}`);
    const admins = await this.prisma.user.findMany({ where: { role: "admin", status: "active" }, select: { id: true } });
    for (const admin of admins) {
      await this.notifications
        .notify(admin.id, "ops_approval_requested", { agentLabel: OPS_AGENT_LABELS[agent] ?? agent, summary })
        .catch(() => undefined);
    }
    return { status: "awaiting_approval", approvalId: approval.id };
  }

  // Executa a ação aprovada, e só ela: confere de novo a cor, os parâmetros e
  // a assinatura. Aprovar duas vezes não executa duas vezes.
  async approve(approvalId: string, adminId: string, note?: string): Promise<{ status: string }> {
    const approval = await this.prisma.agentApproval.findUnique({ where: { id: approvalId } });
    if (!approval) throw new NotFoundException("Pedido de aprovação não encontrado");
    if (approval.expiresAt < new Date()) {
      await this.prisma.agentApproval.updateMany({ where: { id: approvalId, status: "pending" }, data: { status: "expired" } });
      throw new ConflictException("Este pedido expirou. O agente pode pedir de novo se ainda fizer sentido.");
    }
    const claimed = await this.prisma.agentApproval.updateMany({
      where: { id: approvalId, status: "pending" },
      data: { status: "approved", decidedById: adminId, decidedAt: new Date(), decisionNote: note },
    });
    if (!claimed.count) throw new ConflictException("Este pedido já foi decidido.");

    const finish = async (status: "executed" | "failed", result: unknown) => {
      await this.prisma.agentApproval.update({
        where: { id: approvalId },
        data: { status, executedAt: new Date(), result: result as Prisma.InputJsonValue },
      });
      if (approval.taskId) await this.resumeTask(approval.taskId, `Aprovação ${status === "executed" ? "executada" : "falhou"}: ${approval.summary}`);
      return { status };
    };

    const tool = this.tools.get(approval.tool);
    if (!tool || tool.color !== "yellow") return finish("failed", { erro: "A ferramenta não existe mais ou mudou de cor" });
    const parsed = tool.input.safeParse(approval.params);
    if (!parsed.success || actionHash(tool.name, parsed.data) !== approval.paramsHash) {
      return finish("failed", { erro: "Os parâmetros não batem com a assinatura aprovada" });
    }
    try {
      const output = await tool.run(parsed.data, { agent: approval.agent, taskId: approval.taskId ?? undefined, approvedBy: adminId });
      return finish("executed", output ?? null);
    } catch (error) {
      return finish("failed", { erro: error instanceof Error ? error.message : String(error) });
    }
  }

  async reject(approvalId: string, adminId: string, note?: string): Promise<{ status: string }> {
    const approval = await this.prisma.agentApproval.findUnique({ where: { id: approvalId } });
    if (!approval) throw new NotFoundException("Pedido de aprovação não encontrado");
    const updated = await this.prisma.agentApproval.updateMany({
      where: { id: approvalId, status: "pending" },
      data: { status: "rejected", decidedById: adminId, decidedAt: new Date(), decisionNote: note },
    });
    if (!updated.count) throw new ConflictException("Este pedido já foi decidido.");
    if (approval.taskId) await this.resumeTask(approval.taskId, `Recusado pelo admin: ${approval.summary}${note ? ` (${note})` : ""}`);
    return { status: "rejected" };
  }

  async expireOld(now = new Date()): Promise<number> {
    const result = await this.prisma.agentApproval.updateMany({ where: { status: "pending", expiresAt: { lt: now } }, data: { status: "expired" } });
    return result.count;
  }

  // Tarefa parada esperando aprovação volta pra fila quando não sobra pedido
  // pendente dela (o agente continua sabendo o que foi decidido).
  private async resumeTask(taskId: string, message: string): Promise<void> {
    await this.queue.event(taskId, "approval", message);
    const pending = await this.prisma.agentApproval.count({ where: { taskId, status: "pending" } });
    if (pending) return;
    await this.prisma.agentTask.updateMany({ where: { id: taskId, status: "awaiting_approval" }, data: { status: "pending", runAfter: new Date() } });
  }
}

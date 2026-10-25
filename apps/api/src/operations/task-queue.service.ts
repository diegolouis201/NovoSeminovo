import { Injectable } from "@nestjs/common";
import { Prisma, type AgentTask } from "@novoseminovo/db";
import { PrismaService } from "../prisma/prisma.service";

// Tarefa "rodando" há mais que isto sem terminar = a API caiu no meio; volta
// pra fila (ou falha, se já gastou as tentativas).
export const STALE_RUNNING_MS = 10 * 60 * 1000;

export type EnqueueInput = {
  agent: string;
  createdBy: string;
  objective: string;
  segment?: "all" | "vehicle" | "property";
  input?: Prisma.InputJsonValue;
  priority?: number;
  runAfter?: Date;
  deadline?: Date;
  dedupeKey?: string;
  costLimitBrl?: number;
  parentId?: string;
  maxAttempts?: number;
};

// Fila de tarefas no próprio PostgreSQL: cada trabalhador pega uma tarefa com
// FOR UPDATE SKIP LOCKED, então duas rodadas ao mesmo tempo nunca pegam a
// mesma. Tudo fica no banco: se a API reiniciar, a fila continua de onde parou.
@Injectable()
export class TaskQueueService {
  constructor(private readonly prisma: PrismaService) {}

  // Com dedupeKey, enfileirar de novo devolve a tarefa que já existe.
  async enqueue(input: EnqueueInput): Promise<{ task: AgentTask; created: boolean }> {
    try {
      const task = await this.prisma.agentTask.create({
        data: {
          agent: input.agent,
          createdBy: input.createdBy,
          objective: input.objective,
          segment: input.segment ?? "all",
          input: input.input,
          priority: input.priority ?? 5,
          runAfter: input.runAfter ?? new Date(),
          deadline: input.deadline,
          dedupeKey: input.dedupeKey,
          costLimitBrl: input.costLimitBrl,
          parentId: input.parentId,
          maxAttempts: input.maxAttempts ?? 3,
          events: { create: { type: "created", message: `Criada por ${input.createdBy}` } },
        },
      });
      return { task, created: true };
    } catch (error) {
      if (input.dedupeKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const task = await this.prisma.agentTask.findUniqueOrThrow({ where: { dedupeKey: input.dedupeKey } });
        return { task, created: false };
      }
      throw error;
    }
  }

  async claimNext(now = new Date()): Promise<AgentTask | undefined> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE agent_tasks
         SET status = 'running', locked_at = ${now}, attempts = attempts + 1, updated_at = ${now}
       WHERE id = (
         SELECT id FROM agent_tasks
          WHERE status = 'pending' AND run_after <= ${now}
          ORDER BY priority ASC, created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
       )
      RETURNING id`;
    const id = rows[0]?.id;
    if (!id) return undefined;
    await this.event(id, "started", "Começou a rodar");
    return (await this.prisma.agentTask.findUnique({ where: { id } })) ?? undefined;
  }

  async event(taskId: string, type: string, message: string, data?: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.agentTaskEvent.create({ data: { taskId, type, message: message.slice(0, 1000), data } });
  }

  async complete(taskId: string, result: Prisma.InputJsonValue, message = "Concluída"): Promise<void> {
    await this.prisma.agentTask.update({
      where: { id: taskId },
      data: { status: "completed", result, error: null, lockedAt: null, completedAt: new Date() },
    });
    await this.event(taskId, "completed", message);
  }

  // Falha temporária: volta pra fila com espera crescente (2, 4, 8… min) até
  // gastar as tentativas; depois fica "falhou" e o admin é avisado.
  async fail(taskId: string, error: string): Promise<"retry" | "failed"> {
    const task = await this.prisma.agentTask.findUniqueOrThrow({ where: { id: taskId } });
    const final = task.attempts >= task.maxAttempts;
    await this.prisma.agentTask.update({
      where: { id: taskId },
      data: final
        ? { status: "failed", error: error.slice(0, 1000), lockedAt: null }
        : { status: "pending", error: error.slice(0, 1000), lockedAt: null, runAfter: new Date(Date.now() + 2 ** task.attempts * 60_000) },
    });
    await this.event(taskId, final ? "failed" : "retry", final ? `Falhou: ${error}` : `Erro, vai tentar de novo: ${error}`);
    return final ? "failed" : "retry";
  }

  async setStatus(taskId: string, status: "blocked" | "awaiting_approval" | "pending" | "cancelled", message: string, runAfter?: Date): Promise<void> {
    await this.prisma.agentTask.update({
      where: { id: taskId },
      data: { status, lockedAt: null, ...(runAfter ? { runAfter } : {}) },
    });
    await this.event(taskId, status, message);
  }

  // Devolve pra fila o que ficou "rodando" porque a API caiu no meio.
  async reclaimStale(now = new Date()): Promise<number> {
    const stale = await this.prisma.agentTask.findMany({
      where: { status: "running", lockedAt: { lt: new Date(now.getTime() - STALE_RUNNING_MS) } },
      select: { id: true },
    });
    for (const { id } of stale) await this.fail(id, "A execução parou no meio (a API reiniciou ou travou)");
    return stale.length;
  }

  // O admin pode cancelar o que ainda não terminou ou mandar de novo o que falhou.
  async cancel(taskId: string, by: string): Promise<void> {
    const result = await this.prisma.agentTask.updateMany({
      where: { id: taskId, status: { in: ["pending", "blocked", "awaiting_approval", "failed"] } },
      data: { status: "cancelled", lockedAt: null },
    });
    if (result.count) await this.event(taskId, "cancelled", `Cancelada por ${by}`);
  }

  async retry(taskId: string, by: string): Promise<void> {
    const result = await this.prisma.agentTask.updateMany({
      where: { id: taskId, status: { in: ["failed", "blocked"] } },
      data: { status: "pending", attempts: 0, runAfter: new Date(), error: null },
    });
    if (result.count) await this.event(taskId, "retry", `Mandada de novo por ${by}`);
  }
}

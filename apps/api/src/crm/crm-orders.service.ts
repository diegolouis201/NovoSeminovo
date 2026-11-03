import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { CrmOrderInputSchema, type CrmArea, type CrmOrderInput, type CrmOrderView } from "@novoseminovo/shared-types";
import type { CrmOrder } from "@novoseminovo/db";
import { PrismaService } from "../prisma/prisma.service";
import { TaskQueueService } from "../operations/task-queue.service";

// Áreas que têm agente de IA no site (ver operations/agents.service.ts).
const AGENT_AREAS = new Set<CrmArea>(["comercial", "atendimento", "financeiro", "operacoes"]);

type OrderRow = CrmOrder & { agentStatus?: string; agentResult?: unknown; company?: string };

// Ordens do CRM geral para as áreas da empresa.
@Injectable()
export class CrmOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: TaskQueueService,
  ) {}

  async create(raw: CrmOrderInput): Promise<CrmOrderView> {
    const input = CrmOrderInputSchema.parse(raw);
    const prospect = input.cardId
      ? await this.prisma.salesProspect.findUnique({ where: { id: input.cardId }, select: { id: true, name: true, partnerId: true } })
      : input.empresaId
        ? await this.prisma.salesProspect.findUnique({ where: { partnerId: input.empresaId }, select: { id: true, name: true, partnerId: true } })
        : null;
    if (input.cardId && !prospect) throw new NotFoundException("Card do Comercial não encontrado.");
    const partnerId = prospect?.partnerId ?? input.empresaId;
    if (partnerId && !(await this.prisma.partner.findUnique({ where: { id: partnerId }, select: { id: true } }))) {
      throw new NotFoundException("Empresa não encontrada.");
    }
    let order = await this.prisma.crmOrder.create({
      data: {
        area: input.area,
        title: input.titulo,
        details: input.detalhes,
        priority: input.prioridade,
        dueAt: input.prazo ? new Date(input.prazo) : undefined,
        partnerId,
        prospectId: prospect?.id,
      },
    });
    if (AGENT_AREAS.has(input.area)) {
      // O texto da ordem vai como dado (input); o objetivo é só o título.
      const { task } = await this.queue.enqueue({
        agent: input.area,
        createdBy: "crm",
        objective: `Ordem do CRM: ${input.titulo}${prospect ? ` (empresa: ${prospect.name})` : ""}`.slice(0, 500),
        input: { ordemId: order.id, detalhes: input.detalhes ?? null, empresaId: partnerId ?? null },
        priority: input.prioridade === "alta" ? 2 : 5,
        deadline: order.dueAt ?? undefined,
        dedupeKey: `crm-order-${order.id}`,
      });
      order = await this.prisma.crmOrder.update({ where: { id: order.id }, data: { agentTaskId: task.id } });
    }
    if (prospect) {
      await this.prisma.salesNote.create({
        data: { prospectId: prospect.id, kind: "note", body: `Ordem do CRM para ${input.area}: ${input.titulo}${input.detalhes ? `\n${input.detalhes}` : ""}`.slice(0, 2000) },
      });
    }
    return (await this.views([order]))[0]!;
  }

  // Ordens concluídas pelo agente viram "feita" com o resumo do agente.
  private async syncAgentDone(): Promise<void> {
    const open = await this.prisma.crmOrder.findMany({ where: { status: "aberta", agentTaskId: { not: null } }, select: { id: true, agentTaskId: true } });
    if (!open.length) return;
    const tasks = await this.prisma.agentTask.findMany({
      where: { id: { in: open.map((o) => o.agentTaskId!) }, status: "completed" },
      select: { id: true, agent: true, result: true, completedAt: true },
    });
    for (const task of tasks) {
      const order = open.find((o) => o.agentTaskId === task.id)!;
      await this.prisma.crmOrder.update({
        where: { id: order.id },
        data: { status: "feita", result: summarize(task.result), doneBy: `agente ${task.agent}`, doneAt: task.completedAt ?? new Date() },
      });
    }
  }

  async list(filter: { status?: string } = {}): Promise<CrmOrderView[]> {
    await this.syncAgentDone();
    const rows = await this.prisma.crmOrder.findMany({ where: filter.status ? { status: filter.status } : {}, orderBy: { createdAt: "desc" }, take: 500 });
    return this.views(rows);
  }

  async forArea(area: CrmArea): Promise<CrmOrderView[]> {
    await this.syncAgentDone();
    const rows = await this.prisma.crmOrder.findMany({ where: { area, status: "aberta" }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }], take: 200 });
    return this.views(rows);
  }

  forSales(): Promise<CrmOrderView[]> {
    return this.forArea("comercial");
  }

  async completeByArea(area: CrmArea, id: string, result: string): Promise<void> {
    const order = await this.prisma.crmOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException("Ordem não encontrada.");
    if (order.area !== area) throw new BadRequestException("Esta ordem não é desta área.");
    await this.finish(order, result, `sessão ${area}`);
  }

  async completeBySales(userId: string, id: string, result: string): Promise<void> {
    const order = await this.prisma.crmOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException("Ordem não encontrada.");
    if (order.area !== "comercial") throw new BadRequestException("Esta ordem não é desta área.");
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    await this.finish(order, result, `comercial: ${user?.name ?? "equipe"}`, userId);
  }

  private async finish(order: CrmOrder, result: string, doneBy: string, authorId?: string): Promise<void> {
    if (order.status !== "aberta") throw new BadRequestException("Esta ordem já foi encerrada.");
    await this.prisma.crmOrder.update({ where: { id: order.id }, data: { status: "feita", result: result.trim().slice(0, 2000), doneBy, doneAt: new Date() } });
    if (order.agentTaskId) {
      await this.prisma.agentTask.updateMany({ where: { id: order.agentTaskId, status: { in: ["pending", "blocked"] } }, data: { status: "cancelled" } });
    }
    if (order.prospectId) {
      await this.prisma.salesNote.create({ data: { prospectId: order.prospectId, authorId, kind: "note", body: `Ordem concluída (${doneBy}): ${order.title}. ${result}`.slice(0, 2000) } });
    }
  }

  private async views(rows: OrderRow[]): Promise<CrmOrderView[]> {
    const partnerIds = [...new Set(rows.map((r) => r.partnerId).filter((v): v is string => Boolean(v)))];
    const prospectIds = [...new Set(rows.map((r) => r.prospectId).filter((v): v is string => Boolean(v)))];
    const taskIds = rows.map((r) => r.agentTaskId).filter((v): v is string => Boolean(v));
    const [partners, prospects, tasks] = await Promise.all([
      this.prisma.partner.findMany({ where: { id: { in: partnerIds } }, select: { id: true, legalName: true } }),
      this.prisma.salesProspect.findMany({ where: { id: { in: prospectIds } }, select: { id: true, name: true } }),
      this.prisma.agentTask.findMany({ where: { id: { in: taskIds } }, select: { id: true, status: true } }),
    ]);
    const name = (r: OrderRow) => partners.find((p) => p.id === r.partnerId)?.legalName ?? prospects.find((p) => p.id === r.prospectId)?.name;
    return rows.map((r) => ({
      id: r.id,
      area: r.area as CrmArea,
      titulo: r.title,
      detalhes: r.details ?? undefined,
      prioridade: r.priority === "alta" ? "alta" : "normal",
      status: r.status as CrmOrderView["status"],
      prazo: r.dueAt?.toISOString(),
      empresa: name(r),
      empresaId: r.partnerId ?? undefined,
      cardId: r.prospectId ?? undefined,
      agentTaskId: r.agentTaskId ?? undefined,
      agenteStatus: tasks.find((t) => t.id === r.agentTaskId)?.status,
      resultado: r.result ?? undefined,
      feitaPor: r.doneBy ?? undefined,
      feitaEm: r.doneAt?.toISOString(),
      criadaEm: r.createdAt.toISOString(),
    }));
  }
}

function summarize(result: unknown): string {
  if (!result) return "Concluída pelo agente.";
  if (typeof result === "string") return result.slice(0, 2000);
  const record = result as Record<string, unknown>;
  const text = record.resumo ?? record.summary ?? record.manchete ?? record.text;
  return (typeof text === "string" ? text : JSON.stringify(result)).slice(0, 2000);
}

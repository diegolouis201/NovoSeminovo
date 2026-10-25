import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { AgentTask, Prisma } from "@novoseminovo/db";
import {
  OPS_ROUTINE_LABELS,
  type AdminOverviewScope,
  type OpsApprovalView,
  type OpsGoalInput,
  type OpsGoalView,
  type OpsSummary,
} from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { AdminOverviewService } from "../admin/overview.service";
import { aiContext, setAiUsageSink, usdToBrlRate } from "./ai-usage";
import { setRoutineSink, trackRoutine } from "./routine-health";
import { TaskQueueService } from "./task-queue.service";
import { OpsToolsService } from "./tools.service";
import { AGENT_FEATURE_PREFIX, UsageService, brtDay, brtDayStart, brtHour, dailyBudgetBrl } from "./usage.service";

const TICK_MS = 30 * 1000;
const MONITOR_MS = 5 * 60 * 1000;
const TASKS_PER_TICK = 3;
// Rotina sem rodar há mais de 3 intervalos, ou com 3 falhas seguidas = alerta;
// o mesmo alerta não se repete antes de 6 horas.
const STALE_FACTOR = 3;
const FAILURES_ALERT = 3;
const ALERT_REPEAT_MS = 6 * 60 * 60 * 1000;

type TaskHandler = {
  usesAi: boolean;
  run: (task: AgentTask) => Promise<Prisma.InputJsonValue>;
};

// Rotinas agendadas: entram na fila uma vez por dia (dedupeKey com a data),
// a partir do horário de Brasília indicado.
const SCHEDULES: { key: string; agent: string; hourBrt: number; objective: string }[] = [
  { key: "kpi-snapshot", agent: "sistema:kpi", hourBrt: 6, objective: "Guardar a foto diária dos KPIs (geral, carros e imóveis)" },
];

const SCOPES: AdminOverviewScope[] = ["all", "vehicle", "property"];

// Núcleo da operação com agentes (Fase 1): fila, agendador, monitor das
// rotinas, registro de custo de IA e o resumo da tela /admin/operacao.
// OPERATIONS_DISABLED=1 desliga a fila e o monitor (o registro de custo continua).
@Injectable()
export class OperationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OperationsService.name);
  private readonly handlers = new Map<string, TaskHandler>();
  private readonly alertedToday = new Set<string>();
  private timers: NodeJS.Timeout[] = [];
  private ticking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly overview: AdminOverviewService,
    private readonly queue: TaskQueueService,
    private readonly tools: OpsToolsService,
    private readonly usage: UsageService,
  ) {
    this.handlers.set("sistema:kpi", { usesAi: false, run: () => this.snapshotKpis() });
  }

  onModuleInit(): void {
    setAiUsageSink((run) => this.usage.record(run));
    setRoutineSink((report) => this.recordHeartbeat(report.name, report.intervalMs, report.error));
    if (process.env.OPERATIONS_DISABLED === "1") return;
    this.timers.push(setInterval(() => void this.tick(), TICK_MS));
    this.timers.push(setInterval(() => void this.monitor().catch((error) => this.logger.warn(`Monitor falhou: ${error}`)), MONITOR_MS));
  }

  onModuleDestroy(): void {
    for (const timer of this.timers) clearInterval(timer);
    setAiUsageSink(undefined);
    setRoutineSink(undefined);
  }

  // Agentes da Fase 2 em diante se registram aqui.
  registerHandler(agent: string, handler: TaskHandler): void {
    this.handlers.set(agent, handler);
  }

  async tick(now = new Date()): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await trackRoutine("fila-agentes", TICK_MS, async () => {
        await this.queue.reclaimStale(now);
        await this.tools.expireOld(now);
        await this.schedule(now);
        await this.checkBudget(now);
        for (let i = 0; i < TASKS_PER_TICK; i++) {
          const task = await this.queue.claimNext(new Date());
          if (!task) break;
          await this.process(task);
        }
      });
    } finally {
      this.ticking = false;
    }
  }

  async schedule(now = new Date()): Promise<void> {
    for (const item of SCHEDULES) {
      if (brtHour(now) < item.hourBrt) continue;
      await this.queue.enqueue({ agent: item.agent, createdBy: "agendador", objective: item.objective, dedupeKey: `${item.key}:${brtDay(now)}` });
    }
  }

  async process(task: AgentTask): Promise<void> {
    const handler = this.handlers.get(task.agent);
    if (!handler) {
      await this.queue.setStatus(task.id, "blocked", "Este agente ainda não está ativo (entra numa próxima fase).");
      return;
    }
    if (handler.usesAi && !(await this.usage.canSpend())) {
      await this.prisma.agentTask.update({ where: { id: task.id }, data: { attempts: { decrement: 1 } } });
      const tomorrow = new Date(brtDayStart().getTime() + 24 * 60 * 60 * 1000);
      await this.queue.setStatus(task.id, "pending", "Teto diário de gasto com IA atingido; fica para amanhã.", tomorrow);
      return;
    }
    try {
      const result = await aiContext.run({ feature: `${AGENT_FEATURE_PREFIX}${task.agent}`, taskId: task.id }, () => handler.run(task));
      await this.queue.complete(task.id, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const outcome = await this.queue.fail(task.id, message);
      if (outcome === "failed") await this.alert(`Tarefa falhou: ${task.objective.slice(0, 80)}`, `Agente ${task.agent}, ${task.attempts} tentativas. Último erro: ${message.slice(0, 300)}`);
    }
  }

  // Foto diária do painel geral (sem IA): base para comparar mês a mês e
  // para as metas dos agentes.
  async snapshotKpis(now = new Date()): Promise<Prisma.InputJsonValue> {
    const day = brtDay(now);
    for (const scope of SCOPES) {
      const data = await this.overview.overview(scope);
      const compact = { listings: data.listings, revenue: { ...data.revenue, storeEntries: undefined, months: undefined }, engagement: data.engagement, users: data.users, ai: data.ai, origins: data.origins };
      await this.prisma.kpiSnapshot.upsert({
        where: { day_scope: { day, scope } },
        create: { day, scope, data: compact as Prisma.InputJsonValue },
        update: { data: compact as Prisma.InputJsonValue },
      });
    }
    return { dia: day, recortes: SCOPES };
  }

  private async checkBudget(now: Date): Promise<void> {
    const budget = dailyBudgetBrl();
    if (budget <= 0) return;
    const spent = await this.usage.agentSpentTodayBrl(now);
    const key = `teto:${brtDay(now)}`;
    if (spent < budget * 0.8 || this.alertedToday.has(key)) return;
    this.alertedToday.add(key);
    await this.alert(
      "gasto com IA perto do teto",
      `Os agentes já gastaram R$ ${spent.toFixed(2)} hoje, de um teto de R$ ${budget.toFixed(2)}. Ao chegar no teto, as tarefas com IA ficam para amanhã.`,
    );
  }

  async recordHeartbeat(name: string, intervalMs: number, error?: string): Promise<void> {
    const now = new Date();
    await this.prisma.routineHeartbeat.upsert({
      where: { name },
      create: { name, intervalMs, lastRunAt: now, lastOkAt: error ? null : now, lastError: error, failures: error ? 1 : 0 },
      update: error
        ? { intervalMs, lastRunAt: now, lastError: error.slice(0, 500), failures: { increment: 1 } }
        : { intervalMs, lastRunAt: now, lastOkAt: now, lastError: null, failures: 0 },
    });
  }

  // Avisa o admin (notificação + e-mail) quando uma rotina para ou falha seguido.
  async monitor(now = new Date()): Promise<string[]> {
    const routines = await this.prisma.routineHeartbeat.findMany();
    const alerted: string[] = [];
    for (const routine of routines) {
      const stale = now.getTime() - routine.lastRunAt.getTime() > routine.intervalMs * STALE_FACTOR;
      const failing = routine.failures >= FAILURES_ALERT;
      if (!stale && !failing) continue;
      if (routine.lastAlertAt && now.getTime() - routine.lastAlertAt.getTime() < ALERT_REPEAT_MS) continue;
      const label = OPS_ROUTINE_LABELS[routine.name] ?? routine.name;
      await this.alert(
        stale ? `${label} parou` : `${label} falhando`,
        stale
          ? `A rotina não roda desde ${routine.lastRunAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`
          : `${routine.failures} falhas seguidas. Último erro: ${routine.lastError ?? "—"}`,
      );
      await this.prisma.routineHeartbeat.update({ where: { name: routine.name }, data: { lastAlertAt: now } });
      alerted.push(routine.name);
    }
    return alerted;
  }

  private async alert(title: string, body: string): Promise<void> {
    this.logger.warn(`${title}: ${body}`);
    const admins = await this.prisma.user.findMany({ where: { role: "admin", status: "active" }, select: { id: true } });
    for (const admin of admins) {
      await this.notifications.notify(admin.id, "ops_alert", { title, body }).catch(() => undefined);
    }
  }

  // ---- Tela /admin/operacao ----

  async summary(): Promise<OpsSummary> {
    const now = new Date();
    const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const [spentToday, costToday, cost30, byFeature, pending, recent, tasks, routines, goals] = await Promise.all([
      this.usage.agentSpentTodayBrl(now),
      this.prisma.agentRun.aggregate({ where: { createdAt: { gte: brtDayStart(now) } }, _sum: { costBrl: true } }),
      this.prisma.agentRun.aggregate({ where: { createdAt: { gte: since30 } }, _sum: { costBrl: true } }),
      this.prisma.agentRun.groupBy({ by: ["feature"], where: { createdAt: { gte: since30 } }, _sum: { costBrl: true }, _count: { _all: true } }),
      this.prisma.agentApproval.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" } }),
      this.prisma.agentApproval.findMany({ where: { status: { not: "pending" } }, orderBy: { createdAt: "desc" }, take: 10 }),
      this.prisma.agentTask.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { events: { orderBy: { createdAt: "desc" }, take: 1 } } }),
      this.prisma.routineHeartbeat.findMany({ orderBy: { name: "asc" } }),
      this.prisma.agentGoal.findMany({ where: { period: { gte: monthKey(new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000)) } }, orderBy: [{ period: "desc" }, { metric: "asc" }] }),
    ]);

    const approvalView = (row: (typeof pending)[number]): OpsApprovalView => ({
      id: row.id,
      agent: row.agent,
      tool: row.tool,
      summary: row.summary,
      impact: row.impact ?? undefined,
      reason: row.reason ?? undefined,
      status: row.status,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString(),
      decisionNote: row.decisionNote ?? undefined,
      taskId: row.taskId ?? undefined,
    });

    return {
      generatedAt: now.toISOString(),
      budget: { dailyBrl: dailyBudgetBrl(), spentTodayBrl: spentToday, usdToBrl: usdToBrlRate() },
      cost: {
        todayBrl: Number(costToday._sum.costBrl ?? 0),
        last30dBrl: Number(cost30._sum.costBrl ?? 0),
        byFeature: byFeature
          .map((row) => ({ feature: row.feature, calls: row._count._all, brl: Number(row._sum.costBrl ?? 0) }))
          .sort((a, b) => b.brl - a.brl),
      },
      approvals: pending.map(approvalView),
      recentApprovals: recent.map(approvalView),
      tasks: tasks.map((task) => ({
        id: task.id,
        agent: task.agent,
        objective: task.objective,
        segment: task.segment,
        status: task.status,
        attempts: task.attempts,
        error: task.error ?? undefined,
        createdBy: task.createdBy,
        createdAt: task.createdAt.toISOString(),
        completedAt: task.completedAt?.toISOString(),
        lastEvent: task.events[0]?.message,
      })),
      routines: routines.map((routine) => ({
        name: routine.name,
        intervalMs: routine.intervalMs,
        lastRunAt: routine.lastRunAt.toISOString(),
        lastOkAt: routine.lastOkAt?.toISOString(),
        lastError: routine.lastError ?? undefined,
        failures: routine.failures,
        healthy: now.getTime() - routine.lastRunAt.getTime() <= routine.intervalMs * STALE_FACTOR && routine.failures < FAILURES_ALERT,
      })),
      goals: await Promise.all(goals.map((goal) => this.goalView(goal, now))),
    };
  }

  async saveGoal(input: OpsGoalInput): Promise<{ ok: true }> {
    await this.prisma.agentGoal.upsert({
      where: { metric_segment_period: { metric: input.metric, segment: input.segment, period: input.period } },
      create: { ...input, note: input.note || null },
      update: { target: input.target, agent: input.agent, note: input.note || null },
    });
    return { ok: true };
  }

  async deleteGoal(id: string): Promise<{ ok: true }> {
    await this.prisma.agentGoal.deleteMany({ where: { id } });
    return { ok: true };
  }

  // Valor atual do indicador no mês da meta — calculado pelo sistema, nunca
  // informado pelo agente.
  private async goalView(goal: { id: string; metric: string; segment: string; period: string; target: Prisma.Decimal; agent: string; note: string | null }, now: Date): Promise<OpsGoalView> {
    const start = new Date(`${goal.period}-01T03:00:00Z`);
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1, 3));
    const range = { gte: start, lt: end };
    const type = goal.segment === "vehicle" || goal.segment === "property" ? goal.segment : undefined;
    let current: number | undefined;
    if (start <= now) {
      switch (goal.metric) {
        case "leads":
          current = await this.prisma.lead.count({ where: { createdAt: range, ...(type ? { listing: { type } } : {}) } });
          break;
        case "cadastros":
          current = await this.prisma.user.count({ where: { createdAt: range } });
          break;
        case "anuncios_ativos":
          current = await this.prisma.listing.count({ where: { status: "active", ...(type ? { type } : {}) } });
          break;
        case "anuncios_vendidos":
          current = await this.prisma.listing.count({ where: { status: "sold", soldAt: range, ...(type ? { type } : {}) } });
          break;
        case "financiamentos":
          current = await this.prisma.financingLead.count({ where: { createdAt: range, ...(type ? { assetType: type } : {}) } });
          break;
        case "receita_total": {
          const data = await this.overview.overview((type ?? "all") as AdminOverviewScope);
          const month = data.revenue.months.find((row) => row.month === goal.period);
          current = month ? month.listingPlans + month.subscriptions + month.financing + month.stores : 0;
          break;
        }
      }
    }
    return {
      id: goal.id,
      metric: goal.metric,
      segment: goal.segment,
      period: goal.period,
      target: Number(goal.target),
      agent: goal.agent,
      note: goal.note ?? undefined,
      current,
    };
  }
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

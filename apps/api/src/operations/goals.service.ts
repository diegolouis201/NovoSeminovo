import { Injectable } from "@nestjs/common";
import type { Prisma } from "@novoseminovo/db";
import type { AdminOverviewScope, OpsGoalInput, OpsGoalView } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { AdminOverviewService } from "../admin/overview.service";

type GoalRow = { id: string; metric: string; segment: string; period: string; target: Prisma.Decimal; agent: string; note: string | null };

export function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

// Metas e o valor atual de cada uma — calculado pelo sistema a partir dos
// dados do site, nunca informado por um agente.
@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly overview: AdminOverviewService,
  ) {}

  async list(now = new Date()): Promise<OpsGoalView[]> {
    const goals = await this.prisma.agentGoal.findMany({
      where: { period: { gte: monthKey(new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000)) } },
      orderBy: [{ period: "desc" }, { metric: "asc" }],
    });
    return Promise.all(goals.map((goal) => this.view(goal, now)));
  }

  async current(now = new Date()): Promise<OpsGoalView[]> {
    return (await this.list(now)).filter((goal) => goal.period === monthKey(now));
  }

  async save(input: OpsGoalInput): Promise<{ ok: true }> {
    await this.prisma.agentGoal.upsert({
      where: { metric_segment_period: { metric: input.metric, segment: input.segment, period: input.period } },
      create: { ...input, note: input.note || null },
      update: { target: input.target, agent: input.agent, note: input.note || null },
    });
    return { ok: true };
  }

  async remove(id: string): Promise<{ ok: true }> {
    await this.prisma.agentGoal.deleteMany({ where: { id } });
    return { ok: true };
  }

  private async view(goal: GoalRow, now: Date): Promise<OpsGoalView> {
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

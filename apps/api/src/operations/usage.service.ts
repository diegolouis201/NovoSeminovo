import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { costUsd, usdToBrlRate, type AiRunRecord } from "./ai-usage";

// Brasil sem horário de verão desde 2019: o dia de Brasília é UTC−3.
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

export function brtDay(date = new Date()): string {
  return new Date(date.getTime() - BRT_OFFSET_MS).toISOString().slice(0, 10);
}

export function brtDayStart(date = new Date()): Date {
  return new Date(Date.parse(`${brtDay(date)}T00:00:00Z`) + BRT_OFFSET_MS);
}

export function brtHour(date = new Date()): number {
  return new Date(date.getTime() - BRT_OFFSET_MS).getUTCHours();
}

// Teto diário de gasto com IA dos agentes da operação (aprovado: R$ 15/dia).
// Os usos que já existiam (chat, moderação, Arquiteto) têm limites próprios e
// não entram nessa conta, mas aparecem no custo do painel.
export function dailyBudgetBrl(): number {
  const value = Number(process.env.AGENT_DAILY_BUDGET_BRL);
  return Number.isFinite(value) && value >= 0 ? value : 15;
}

export const AGENT_FEATURE_PREFIX = "agente:";

@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  async record(run: AiRunRecord): Promise<void> {
    const usd = costUsd(run.model, run.usage);
    await this.prisma.agentRun.create({
      data: {
        feature: run.feature,
        taskId: run.taskId,
        model: run.model,
        inputTokens: run.usage.input,
        outputTokens: run.usage.output,
        cacheReadTokens: run.usage.cacheRead,
        cacheWriteTokens: run.usage.cacheWrite,
        costUsd: usd,
        costBrl: usd * usdToBrlRate(),
        durationMs: run.durationMs,
        error: run.error,
      },
    });
  }

  async agentSpentTodayBrl(now = new Date()): Promise<number> {
    const result = await this.prisma.agentRun.aggregate({
      where: { createdAt: { gte: brtDayStart(now) }, feature: { startsWith: AGENT_FEATURE_PREFIX } },
      _sum: { costBrl: true },
    });
    return Number(result._sum.costBrl ?? 0);
  }

  async taskSpentBrl(taskId: string): Promise<number> {
    const result = await this.prisma.agentRun.aggregate({ where: { taskId }, _sum: { costBrl: true } });
    return Number(result._sum.costBrl ?? 0);
  }

  // Agente só começa uma tarefa com IA se o gasto do dia ainda está abaixo do teto.
  async canSpend(now = new Date()): Promise<boolean> {
    return (await this.agentSpentTodayBrl(now)) < dailyBudgetBrl();
  }
}

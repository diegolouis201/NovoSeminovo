import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { OPS_RUNNABLE_AGENTS, OpsDecisionInputSchema, OpsGoalInputSchema } from "@novoseminovo/shared-types";
import { AdminGuard } from "../admin/admin.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { parseOrBadRequest } from "../common/parse";
import { GoalsService } from "./goals.service";
import { OperationsService } from "./operations.service";
import { TaskQueueService } from "./task-queue.service";
import { OpsToolsService } from "./tools.service";

// Tela /admin/operacao: aprovações, tarefas, saúde das rotinas, custo e metas.
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin/operations")
export class OperationsController {
  constructor(
    private readonly operations: OperationsService,
    private readonly tools: OpsToolsService,
    private readonly queue: TaskQueueService,
    private readonly goals: GoalsService,
  ) {}

  @Get()
  summary() {
    return this.operations.summary();
  }

  @Post("approvals/:id/approve")
  approve(@CurrentUser() user: { id: string }, @Param("id") id: string, @Body() body: unknown) {
    return this.tools.approve(id, user.id, parseOrBadRequest(OpsDecisionInputSchema, body ?? {}).note);
  }

  @Post("approvals/:id/reject")
  reject(@CurrentUser() user: { id: string }, @Param("id") id: string, @Body() body: unknown) {
    return this.tools.reject(id, user.id, parseOrBadRequest(OpsDecisionInputSchema, body ?? {}).note);
  }

  @Post("tasks/:id/cancel")
  async cancel(@CurrentUser() user: { id: string }, @Param("id") id: string) {
    await this.queue.cancel(id, `admin:${user.id}`);
    return { ok: true };
  }

  @Post("tasks/:id/retry")
  async retry(@CurrentUser() user: { id: string }, @Param("id") id: string) {
    await this.queue.retry(id, `admin:${user.id}`);
    return { ok: true };
  }

  @Post("goals")
  saveGoal(@Body() body: unknown) {
    return this.goals.save(parseOrBadRequest(OpsGoalInputSchema, body));
  }

  @Delete("goals/:id")
  deleteGoal(@Param("id") id: string) {
    return this.goals.remove(id);
  }

  @Post("agents/:agent/run")
  async runNow(@CurrentUser() user: { id: string }, @Param("agent") agent: string) {
    if (!(OPS_RUNNABLE_AGENTS as readonly string[]).includes(agent)) throw new BadRequestException("Agente desconhecido");
    try {
      return await this.operations.runNow(agent, user.id);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }
  }
}

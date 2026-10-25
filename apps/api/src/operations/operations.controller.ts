import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { OpsDecisionInputSchema, OpsGoalInputSchema } from "@novoseminovo/shared-types";
import { AdminGuard } from "../admin/admin.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { parseOrBadRequest } from "../common/parse";
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
    return this.operations.saveGoal(parseOrBadRequest(OpsGoalInputSchema, body));
  }

  @Delete("goals/:id")
  deleteGoal(@Param("id") id: string) {
    return this.operations.deleteGoal(id);
  }
}

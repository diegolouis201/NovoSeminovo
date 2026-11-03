import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AdminReviewDecisionSchema, ReportReviewInputSchema } from "@novoseminovo/shared-types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard } from "../admin/admin.guard";
import { parseOrBadRequest } from "../common/parse";
import { ReviewModerationService } from "./review-moderation.service";

@Controller()
export class ReviewsController {
  constructor(private readonly moderation: ReviewModerationService) {}

  // O avaliado (pessoa, loja ou imobiliária) denuncia uma avaliação publicada.
  @UseGuards(JwtAuthGuard)
  @Post("reviews/:id/report")
  async report(@CurrentUser() user: { id: string }, @Param("id") id: string, @Body() body: unknown) {
    const { reason } = parseOrBadRequest(ReportReviewInputSchema, body);
    await this.moderation.report(id, user.id, reason);
    return { ok: true };
  }

  // Admin: avaliações esperando decisão (sem decisão da IA ou denunciadas).
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get("admin/reviews")
  queue() {
    return this.moderation.adminQueue();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post("admin/reviews/:id/decision")
  async decide(@Param("id") id: string, @Body() body: unknown) {
    const { action, note } = parseOrBadRequest(AdminReviewDecisionSchema, body);
    await this.moderation.adminDecide(id, action, note);
    return { ok: true };
  }
}

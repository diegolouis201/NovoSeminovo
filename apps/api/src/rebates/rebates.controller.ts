import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  MarkFinancingDealPaidInputSchema,
  RegisterFinancingDealInputSchema,
  UpdateRebateTierInputSchema,
  type FinancingDealStatus,
} from "@novoseminovo/shared-types";
import { AdminGuard } from "../admin/admin.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { parseOrBadRequest } from "../common/parse";
import { RebatesService } from "./rebates.service";

@Controller()
export class RebatesController {
  constructor(private readonly rebatesService: RebatesService) {}

  @UseGuards(JwtAuthGuard)
  @Get("me/rebates")
  myRebates(@CurrentUser() user: { id: string }) {
    return this.rebatesService.myRebates(user.id);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get("admin/rebate-tiers")
  listTiers() {
    return this.rebatesService.listTiers();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch("admin/rebate-tiers/:id")
  updateTier(@Param("id") id: string, @Body() body: unknown) {
    const input = parseOrBadRequest(UpdateRebateTierInputSchema, body);
    return this.rebatesService.updateTier(id, input);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get("admin/financing-deals")
  listDeals(@Query("status") status?: string) {
    const validStatus: FinancingDealStatus | undefined =
      status === "registered" || status === "paid" ? status : undefined;
    return this.rebatesService.listDeals(validStatus);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post("admin/financing-deals")
  registerDeal(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    const input = parseOrBadRequest(RegisterFinancingDealInputSchema, body);
    return this.rebatesService.registerDeal(user.id, input);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch("admin/financing-deals/:id/pay")
  markPaid(@Param("id") id: string, @Body() body: unknown) {
    const input = parseOrBadRequest(MarkFinancingDealPaidInputSchema, body);
    return this.rebatesService.markPaid(id, input.note);
  }
}

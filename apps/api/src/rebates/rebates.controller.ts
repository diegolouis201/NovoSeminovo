import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { CashbackStage, MarkFinancingDealPaidInputSchema } from "@novoseminovo/shared-types";
import { AdminGuard } from "../admin/admin.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { parseOrBadRequest } from "../common/parse";
import { RebatesService } from "./rebates.service";

// Cashback no financiamento (ver RebatesService).
@Controller()
export class RebatesController {
  constructor(private readonly rebatesService: RebatesService) {}

  @UseGuards(JwtAuthGuard)
  @Get("me/cashback")
  myCashback(@CurrentUser() user: { id: string }) {
    return this.rebatesService.myCashback(user.id);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get("admin/financing-report")
  monthlyReport(@Query("month") month: string) {
    return this.rebatesService.monthlyReport(month ?? "");
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get("admin/financing-deals")
  listDeals(@Query("etapa") stage?: string) {
    const parsed = CashbackStage.safeParse(stage);
    return this.rebatesService.listDeals(parsed.success ? parsed.data : undefined);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch("admin/financing-deals/:id/commission-received")
  markCommissionReceived(@Param("id") id: string) {
    return this.rebatesService.markCommissionReceived(id);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch("admin/financing-deals/:id/pay")
  markPaid(@Param("id") id: string, @Body() body: unknown) {
    const input = parseOrBadRequest(MarkFinancingDealPaidInputSchema, body);
    return this.rebatesService.markPaid(id, input.note);
  }
}

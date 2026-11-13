import { Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { FinancingCommissionStage } from "@novoseminovo/shared-types";
import { AdminGuard } from "../admin/admin.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { FinancingDealsService } from "./financing-deals.service";

// Financiamentos fechados e a comissão do banco (ver FinancingDealsService).
// Só o admin usa.
@Controller()
@UseGuards(JwtAuthGuard, AdminGuard)
export class FinancingDealsController {
  constructor(private readonly financingDeals: FinancingDealsService) {}

  @Get("admin/financing-report")
  monthlyReport(@Query("month") month?: string) {
    return this.financingDeals.monthlyReport(typeof month === "string" ? month.slice(0, 7) : "");
  }

  @Get("admin/partner-sends")
  partnerSends(@Query("month") month?: string) {
    return this.financingDeals.partnerSends(typeof month === "string" ? month.slice(0, 7) : "");
  }

  @Get("admin/financing-deals")
  listDeals(@Query("etapa") stage?: string) {
    const parsed = FinancingCommissionStage.safeParse(stage);
    return this.financingDeals.listDeals(parsed.success ? parsed.data : undefined);
  }

  @Patch("admin/financing-deals/:id/commission-received")
  markCommissionReceived(@Param("id") id: string) {
    return this.financingDeals.markCommissionReceived(id);
  }
}

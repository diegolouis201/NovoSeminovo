import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  ModerateListingInputSchema,
  SetPartnerTypeInputSchema,
  StoreEarningInputSchema,
  UpdateReportStatusInputSchema,
} from "@novoseminovo/shared-types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { parseOrBadRequest } from "../common/parse";
import { AdminGuard } from "./admin.guard";
import { AdminService } from "./admin.service";
import { AdminOverviewService } from "./overview.service";

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin")
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly overviewService: AdminOverviewService,
  ) {}

  // Big numbers do site inteiro (/admin/painel).
  @Get("overview")
  overview(@Query("tipo") tipo?: string) {
    return this.overviewService.overview(tipo === "vehicle" || tipo === "property" ? tipo : "all");
  }

  // Comissão mensal das lojas parceiras (Amazon, Mercado Livre…), lançada à mão.
  @Post("store-earnings")
  saveStoreEarning(@Body() body: unknown) {
    return this.overviewService.saveStoreEarning(parseOrBadRequest(StoreEarningInputSchema, body));
  }

  @Delete("store-earnings/:id")
  deleteStoreEarning(@Param("id") id: string) {
    return this.overviewService.deleteStoreEarning(id);
  }

  @Get("listings/pending")
  listPendingListings() {
    return this.adminService.listPendingListings();
  }

  @Patch("listings/:id/moderate")
  moderateListing(@CurrentUser() user: { id: string }, @Param("id") id: string, @Body() body: unknown) {
    const input = parseOrBadRequest(ModerateListingInputSchema, body);
    return this.adminService.moderateListing(user.id, id, input);
  }

  @Get("partners/pending")
  listPendingPartners() {
    return this.adminService.listPendingPartners();
  }

  @Patch("partners/:id/verify")
  verifyPartner(@Param("id") id: string) {
    return this.adminService.verifyPartner(id);
  }

  @Patch("partners/:id/type")
  setPartnerType(@Param("id") id: string, @Body() body: unknown) {
    return this.adminService.setPartnerType(id, parseOrBadRequest(SetPartnerTypeInputSchema, body).type);
  }

  @Get("reports")
  listOpenReports() {
    return this.adminService.listOpenReports();
  }

  @Patch("reports/:id")
  updateReportStatus(@Param("id") id: string, @Body() body: unknown) {
    const input = parseOrBadRequest(UpdateReportStatusInputSchema, body);
    return this.adminService.updateReportStatus(id, input.status);
  }

  @Get("moderation-log")
  listModerationLog() {
    return this.adminService.listModerationLog();
  }
}

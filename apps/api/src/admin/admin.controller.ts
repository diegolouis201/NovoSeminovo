import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  AdminBlockAccountInputSchema,
  type HeldAccountItem,
  ACQUISITION_SOURCES,
  DeleteMyAccountInputSchema,
  AdminDeleteInputSchema,
  AdminListingActionInputSchema,
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
import { blockAccount, clearModerationHold, heldAccounts, unblockAccount } from "./account-safety";
import { PrismaService } from "../prisma/prisma.service";
import { AdminOverviewService } from "./overview.service";
import { AdminAccountsService } from "./accounts.service";
import { AdminLeadsService } from "./leads.service";

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin")
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly overviewService: AdminOverviewService,
    private readonly accounts: AdminAccountsService,
    private readonly leads: AdminLeadsService,
    private readonly prisma: PrismaService,
  ) {}

  // Todos os leads do site com o funil (/admin/leads).
  @Get("leads")
  listLeads(@Query() query: Record<string, string | undefined>) {
    const days = Number(query.periodo);
    return this.leads.list({
      days: [7, 30, 90].includes(days) ? days : undefined,
      status: query.etapa,
      source: query.origem,
      assetType: query.tipo === "vehicle" || query.tipo === "property" ? query.tipo : undefined,
      search: query.busca?.slice(0, 100),
      campaign: query.campanha?.slice(0, 100),
      acquisitionSource: query.canal && query.canal in ACQUISITION_SOURCES ? query.canal : undefined,
      page: Math.max(1, Number(query.pagina) || 1),
    });
  }

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

  @Get("listings")
  listAllListings(@Query() query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.pagina) || 1);
    return this.adminService.listAllListings({
      assetType: query.tipo === "property" ? "property" : "vehicle",
      sellerType: query.vendedor === "pf" || query.vendedor === "pj" ? query.vendedor : undefined,
      status: ["draft", "pending_review", "active", "paused", "sold", "rejected", "expired"].includes(query.situacao ?? "") ? query.situacao : undefined,
      search: query.busca?.slice(0, 100),
      ownerUserId: query.dono?.slice(0, 40) || undefined,
      page,
    });
  }

  // Exclusões pedem a senha do admin logado e um motivo (ver AdminAccountsService).
  @Post("listings/:id/delete")
  deleteListing(@CurrentUser() user: { id: string }, @Param("id") id: string, @Body() body: unknown) {
    return this.accounts.deleteListing(user.id, id, parseOrBadRequest(AdminDeleteInputSchema, body));
  }

  @Get("users/:id")
  userProfile(@Param("id") id: string) {
    return this.accounts.profile(id);
  }

  // Golpe confirmado: bloqueia sem apagar (POP MOD-05).
  @Post("users/:id/block")
  async blockUser(@CurrentUser() user: { id: string }, @Param("id") id: string, @Body() body: unknown) {
    await blockAccount(this.prisma, id, parseOrBadRequest(AdminBlockAccountInputSchema, body).reason, user.id);
    return { blocked: true };
  }

  @Post("users/:id/unblock")
  async unblockUser(@Param("id") id: string) {
    await unblockAccount(this.prisma, id);
    return { blocked: false };
  }

  // Contas em revisão por reincidência (3 recusas em 30 dias ou 2 denúncias procedentes).
  @Get("accounts/held")
  async heldAccounts(): Promise<HeldAccountItem[]> {
    return (await heldAccounts(this.prisma)).map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      since: a.moderationHoldAt.toISOString(),
      reason: a.moderationHoldReason ?? undefined,
    }));
  }

  @Post("users/:id/clear-hold")
  async clearHold(@Param("id") id: string) {
    await clearModerationHold(this.prisma, id);
    return { held: false };
  }

  @Post("users/:id/delete")
  deleteAccount(@CurrentUser() user: { id: string }, @Param("id") id: string, @Body() body: unknown) {
    return this.accounts.deleteAccount(user.id, id, parseOrBadRequest(AdminDeleteInputSchema, body));
  }

  @Patch("listings/:id/action")
  listingAction(@CurrentUser() user: { id: string }, @Param("id") id: string, @Body() body: unknown) {
    return this.adminService.listingAction(user.id, id, parseOrBadRequest(AdminListingActionInputSchema, body));
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

// Minha conta → Excluir minha conta (exigência da Apple e da Google para o app).
@UseGuards(JwtAuthGuard)
@Controller("me")
export class MyAccountController {
  constructor(private readonly accounts: AdminAccountsService) {}

  @Post("account/delete")
  deleteMine(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    const { password } = parseOrBadRequest(DeleteMyAccountInputSchema, body);
    return this.accounts.deleteOwnAccount(user.id, password);
  }
}

import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AdminAffiliateActionInputSchema, AdminAffiliatePayoutInputSchema, AffiliateApplyInputSchema } from "@novoseminovo/shared-types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard } from "../admin/admin.guard";
import { parseOrBadRequest } from "../common/parse";
import { AffiliatesService } from "./affiliates.service";

@Controller()
export class AffiliatesController {
  constructor(private readonly affiliates: AffiliatesService) {}

  // Público: o site chama quando alguém chega pelo link ?ref=CODIGO.
  @Post("affiliates/click")
  async click(@Body() body: { code?: string }) {
    await this.affiliates.recordClick(String(body?.code ?? ""));
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get("affiliates/me")
  async me(@CurrentUser() user: { id: string }) {
    return { affiliate: await this.affiliates.dashboard(user.id) };
  }

  @UseGuards(JwtAuthGuard)
  @Post("affiliates/apply")
  apply(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    return this.affiliates.apply(user.id, parseOrBadRequest(AffiliateApplyInputSchema, body));
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get("admin/affiliates")
  adminList() {
    return this.affiliates.adminList();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get("admin/affiliates/:id")
  adminDetail(@Param("id") id: string) {
    return this.affiliates.adminDetail(id);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch("admin/affiliates/:id")
  async adminAction(@Param("id") id: string, @Body() body: unknown) {
    await this.affiliates.adminAction(id, parseOrBadRequest(AdminAffiliateActionInputSchema, body));
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post("admin/affiliates/:id/payout")
  adminPayout(@Param("id") id: string, @Body() body: unknown) {
    return this.affiliates.adminPayout(id, parseOrBadRequest(AdminAffiliatePayoutInputSchema, body).note);
  }
}

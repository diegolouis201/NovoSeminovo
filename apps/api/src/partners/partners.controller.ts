import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import {
  AddPartnerMemberInputSchema,
  CreatePartnerInputSchema,
  SubscribeToPlanInputSchema,
  UpdateLeadStatusInputSchema,
  UpdatePartnerAdminNotesInputSchema,
} from "@novoseminovo/shared-types";
import { AdminGuard } from "../admin/admin.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { parseOrBadRequest } from "../common/parse";
import { PartnersService } from "./partners.service";

const ALLOWED_LOGO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// Mesmo padrão do upload de fotos de anúncio (ver ListingsController):
// buffer em memória, quem decide onde o arquivo mora é o PhotoStorage.
const logoInterceptor = FileInterceptor("logo", {
  storage: memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_LOGO_TYPES.has(file.mimetype)) {
      callback(new BadRequestException("Envie apenas imagens JPEG, PNG ou WebP."), false);
      return;
    }
    callback(null, true);
  },
});

@Controller()
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  @UseGuards(JwtAuthGuard)
  @Post("partners")
  create(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    const input = parseOrBadRequest(CreatePartnerInputSchema, body);
    return this.partnersService.create(user.id, input);
  }

  @UseGuards(JwtAuthGuard)
  @Get("partners/mine")
  getMine(@CurrentUser() user: { id: string }) {
    return this.partnersService.getMine(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @UseInterceptors(logoInterceptor)
  @Post("partners/mine/logo")
  uploadLogo(@CurrentUser() user: { id: string }, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("Envie um arquivo de imagem.");
    return this.partnersService.uploadLogo(user.id, file);
  }

  // Precisa vir antes de "partners/:slug" — mesmo caso do "mine" acima, "/partners"
  // sem segmento nenhum não bateria com ":slug" de qualquer forma, mas a ordem
  // deixa a intenção clara.
  @Get("partners")
  listFeatured(@Query("for") forParam?: string) {
    const forAssetType = forParam === "vehicle" || forParam === "property" ? forParam : undefined;
    return this.partnersService.listFeatured(forAssetType);
  }

  @Get("partners/:slug")
  getStorefront(@Param("slug") slug: string) {
    return this.partnersService.getStorefront(slug);
  }

  @UseGuards(JwtAuthGuard)
  @Get("partners/mine/leads")
  listLeads(@CurrentUser() user: { id: string }) {
    return this.partnersService.listLeads(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get("partners/mine/sales")
  listSales(@CurrentUser() user: { id: string }) {
    return this.partnersService.listSales(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch("leads/:id/status")
  updateLeadStatus(@CurrentUser() user: { id: string }, @Param("id") id: string, @Body() body: unknown) {
    const input = parseOrBadRequest(UpdateLeadStatusInputSchema, body);
    return this.partnersService.updateLeadStatus(user.id, id, input.status);
  }

  @UseGuards(JwtAuthGuard)
  @Get("partners/mine/members")
  listMembers(@CurrentUser() user: { id: string }) {
    return this.partnersService.listMembers(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post("partners/mine/members")
  addMember(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    const input = parseOrBadRequest(AddPartnerMemberInputSchema, body);
    return this.partnersService.addMember(user.id, input.email);
  }

  @UseGuards(JwtAuthGuard)
  @Delete("partners/mine/members/:memberId")
  removeMember(@CurrentUser() user: { id: string }, @Param("memberId") memberId: string) {
    return this.partnersService.removeMember(user.id, memberId);
  }

  @Get("plans")
  listPlans() {
    return this.partnersService.listPlans();
  }

  @UseGuards(JwtAuthGuard)
  @Post("partners/mine/subscription")
  subscribe(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    const input = parseOrBadRequest(SubscribeToPlanInputSchema, body);
    return this.partnersService.subscribe(user.id, input.planId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete("partners/mine/subscription")
  cancelSubscription(@CurrentUser() user: { id: string }) {
    return this.partnersService.cancelSubscription(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post("partners/mine/checkout-session")
  createCheckoutSession(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    const input = parseOrBadRequest(SubscribeToPlanInputSchema, body);
    const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
    const successUrl = `${webOrigin}/parceiro/plano?checkout_session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${webOrigin}/parceiro/plano?checkout=cancelado`;
    return this.partnersService
      .createCheckoutSession(user.id, input.planId, successUrl, cancelUrl)
      .then((url) => ({ url }));
  }

  @UseGuards(JwtAuthGuard)
  @Get("partners/mine/checkout-session/confirm")
  confirmCheckoutSession(@CurrentUser() user: { id: string }, @Query("session_id") sessionId?: string) {
    if (!sessionId) throw new BadRequestException("session_id é obrigatório");
    return this.partnersService.confirmCheckoutSession(user.id, sessionId);
  }

  @UseGuards(JwtAuthGuard)
  @Post("partners/mine/billing-portal")
  createBillingPortalSession(@CurrentUser() user: { id: string }) {
    const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
    return this.partnersService
      .createBillingPortalSession(user.id, `${webOrigin}/parceiro/plano`)
      .then((url) => ({ url }));
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get("admin/subscriptions")
  subscriptionBoard() {
    return this.partnersService.subscriptionBoard();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch("admin/partners/:id/notes")
  async updateAdminNotes(@Param("id") id: string, @Body() body: unknown) {
    const input = parseOrBadRequest(UpdatePartnerAdminNotesInputSchema, body);
    await this.partnersService.updateAdminNotes(id, input.adminNotes);
    return { ok: true };
  }
}

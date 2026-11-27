import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Param, Post, Query, Req, UseGuards, Optional } from "@nestjs/common";
import { clientIp } from "../common/client-ip";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request } from "express";
import {
  CampaignLeadInputSchema,
  CreateProspectInputSchema,
  CreateSalesMemberInputSchema,
  MoveProspectInputSchema,
  NextContactInputSchema,
  SalesNoteInputSchema,
  SocioBirthdayInputSchema,
  AddSocioInputSchema,
  CancelReasonInputSchema,
  ProspectProfileInputSchema,
  TicketInputSchema,
  TicketResolveInputSchema,
} from "@novoseminovo/shared-types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PasswordResetService } from "../auth/password-reset.service";
import { AdminGuard } from "../admin/admin.guard";
import { acquisitionFrom } from "../common/acquisition";
import { metaContextFrom } from "../meta/meta-conversions";
import { MetaConversionsService } from "../meta/meta-conversions.service";
import { parseOrBadRequest } from "../common/parse";
import { SalesGuard } from "./sales.guard";
import { SalesService } from "./sales.service";

type Me = { id: string };

// Área Comercial (equipe de vendas e admin).
@UseGuards(JwtAuthGuard, SalesGuard)
@Controller("sales")
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get("me")
  me(@CurrentUser() user: Me) {
    return this.sales.me(user.id);
  }

  @Get("board")
  board(@CurrentUser() user: Me, @Query("segmento") segmento: unknown, @Query("meus") meus: unknown) {
    const segment = segmento === "vehicle" || segmento === "property" ? segmento : undefined;
    return this.sales.board(user.id, { segment, mine: meus === "1" });
  }

  @Get("goals")
  goals(@CurrentUser() user: Me) {
    return this.sales.goals(user.id, new Date());
  }

  @Post("prospects")
  create(@CurrentUser() user: Me, @Body() body: unknown) {
    return this.sales.createProspect(user.id, parseOrBadRequest(CreateProspectInputSchema, body));
  }

  @Get("prospects/:id")
  detail(@Param("id") id: string) {
    return this.sales.detail(id);
  }

  @Post("prospects/:id/move")
  async move(@CurrentUser() user: Me, @Param("id") id: string, @Body() body: unknown) {
    await this.sales.move(user.id, id, parseOrBadRequest(MoveProspectInputSchema, body));
    return { ok: true };
  }

  @Post("prospects/:id/notes")
  async note(@CurrentUser() user: Me, @Param("id") id: string, @Body() body: unknown) {
    const input = parseOrBadRequest(SalesNoteInputSchema, body);
    await this.sales.addNote(user.id, id, input.body, input.kind);
    return { ok: true };
  }

  @Post("prospects/:id/next-contact")
  async nextContact(@CurrentUser() user: Me, @Param("id") id: string, @Body() body: unknown) {
    const { at, kind } = parseOrBadRequest(NextContactInputSchema, body);
    await this.sales.setNextContact(user.id, id, at ? new Date(at) : null, kind);
    return { ok: true };
  }

  @Post("prospects/:id/socios")
  async addSocio(@CurrentUser() user: Me, @Param("id") id: string, @Body() body: unknown) {
    await this.sales.addSocio(user.id, id, parseOrBadRequest(AddSocioInputSchema, body));
    return { ok: true };
  }

  @Post("socios/:id/birthday")
  async birthday(@CurrentUser() user: Me, @Param("id") id: string, @Body() body: unknown) {
    await this.sales.setSocioBirthday(user.id, id, parseOrBadRequest(SocioBirthdayInputSchema, body).birthday);
    return { ok: true };
  }

  @Post("prospects/:id/profile")
  async profile(@CurrentUser() user: Me, @Param("id") id: string, @Body() body: unknown) {
    await this.sales.updateProfile(user.id, id, parseOrBadRequest(ProspectProfileInputSchema, body));
    return { ok: true };
  }

  @Post("prospects/:id/cancel-reason")
  async cancelReason(@CurrentUser() user: Me, @Param("id") id: string, @Body() body: unknown) {
    await this.sales.setCancelReason(user.id, id, parseOrBadRequest(CancelReasonInputSchema, body));
    return { ok: true };
  }

  @Post("prospects/:id/tickets")
  openTicket(@CurrentUser() user: Me, @Param("id") id: string, @Body() body: unknown) {
    return this.sales.openTicket(user.id, id, parseOrBadRequest(TicketInputSchema, body));
  }

  @Post("tickets/:id/resolve")
  async resolveTicket(@CurrentUser() user: Me, @Param("id") id: string, @Body() body: unknown) {
    await this.sales.resolveTicket(user.id, id, parseOrBadRequest(TicketResolveInputSchema, body).resolution);
    return { ok: true };
  }

  @Post("prospects/:id/assign")
  async assign(@CurrentUser() user: Me, @Param("id") id: string) {
    await this.sales.assign(user.id, id);
    return { ok: true };
  }
}

// Equipe comercial: só o admin cria e convida.
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin/sales-team")
export class SalesTeamController {
  constructor(
    private readonly sales: SalesService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  @Get()
  list() {
    return this.sales.members();
  }

  @Post()
  async create(@Body() body: unknown) {
    const member = await this.sales.createMember(parseOrBadRequest(CreateSalesMemberInputSchema, body));
    await this.passwordReset.invite(member.id);
    return member;
  }

  @Post(":id/invite")
  async invite(@Param("id") id: string) {
    await this.passwordReset.invite(id);
    return { ok: true };
  }
}

// Formulário de campanha /para-lojas/comecar (público, sem login): no máximo
// 5 envios por visitante a cada 10 minutos. O site chama pela server action e
// repassa o IP do visitante em x-client-ip e a origem em x-ns-origem.
const CAMPAIGN_LIMIT = 5;
const CAMPAIGN_WINDOW_MS = 10 * 60 * 1000;
const campaignHits = new Map<string, number[]>();

export function campaignLeadRateLimited(ip: string, now = Date.now()): boolean {
  const hits = (campaignHits.get(ip) ?? []).filter((at) => now - at < CAMPAIGN_WINDOW_MS);
  if (hits.length >= CAMPAIGN_LIMIT) {
    campaignHits.set(ip, hits);
    return true;
  }
  hits.push(now);
  campaignHits.set(ip, hits);
  if (campaignHits.size > 5000) campaignHits.clear();
  return false;
}

@SkipThrottle()
@Controller("sales")
export class SalesCampaignController {
  constructor(
    private readonly sales: SalesService,
    @Optional() private readonly meta?: MetaConversionsService,
  ) {}

  @Post("campaign-lead")
  @HttpCode(200)
  async campaignLead(@Body() body: unknown, @Req() request: Request) {
    if (campaignLeadRateLimited(clientIp(request))) throw new HttpException("Muitos envios em pouco tempo. Tente de novo daqui a alguns minutos.", HttpStatus.TOO_MANY_REQUESTS);
    // Campo isca preenchido = robô: responde como se tivesse dado certo.
    if (body && typeof body === "object" && typeof (body as { website?: unknown }).website === "string" && (body as { website: string }).website.trim()) return { ok: true };
    const input = parseOrBadRequest(CampaignLeadInputSchema, body);
    await this.sales.campaignLead(input, acquisitionFrom(request));
    // Conversão para a Meta (só com aceite dos cookies; não espera a resposta).
    void this.meta?.track("Lead", metaContextFrom(request), { email: input.email, phone: input.phone }, "lojas");
    return { ok: true };
  }
}

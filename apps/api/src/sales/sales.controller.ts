import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import {
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
  board(@CurrentUser() user: Me, @Query("segmento") segmento?: string, @Query("meus") meus?: string) {
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

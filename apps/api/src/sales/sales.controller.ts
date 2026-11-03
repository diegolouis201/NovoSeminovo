import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import {
  CreateProspectInputSchema,
  CreateSalesMemberInputSchema,
  MoveProspectInputSchema,
  NextContactInputSchema,
  SalesNoteInputSchema,
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
    await this.sales.addNote(user.id, id, parseOrBadRequest(SalesNoteInputSchema, body).body);
    return { ok: true };
  }

  @Post("prospects/:id/next-contact")
  async nextContact(@CurrentUser() user: Me, @Param("id") id: string, @Body() body: unknown) {
    const { at } = parseOrBadRequest(NextContactInputSchema, body);
    await this.sales.setNextContact(user.id, id, at ? new Date(at) : null);
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

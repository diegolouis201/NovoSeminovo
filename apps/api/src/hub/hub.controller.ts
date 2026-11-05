import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { type HubAccess, HubGoalInputSchema, HubMarkInputSchema, HubMemberInputSchema, HubTaskInputSchema } from "@novoseminovo/shared-types";
import { z } from "zod";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { parseOrBadRequest } from "../common/parse";
import { CrmService } from "../crm/crm.service";
import { HubGuard, HubPermissionRequired } from "./hub.guard";
import { HubService } from "./hub.service";

type Me = { id: string };
const MonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const ActiveSchema = z.object({ active: z.boolean() });
const TaskFilterSchema = z.object({ status: z.enum(["abertas", "concluidas"]).default("abertas"), empresa: z.string().max(40).optional() });

// NovoSeminovo Hub (hub.novoseminovo.com.br). As ações do Comercial (etapa,
// anotação, próximo contato) são as mesmas rotas /sales/* do site.
@UseGuards(JwtAuthGuard, HubGuard)
@Controller("hub")
export class HubController {
  constructor(
    private readonly hub: HubService,
    private readonly crm: CrmService,
  ) {}

  @Get("me")
  me(@Req() req: { hub: HubAccess }) {
    return req.hub;
  }

  @HubPermissionRequired("crm.ver")
  @Get("crm")
  dados() {
    return this.crm.clientes();
  }

  @HubPermissionRequired("crm.ver")
  @Get("marcacoes")
  marcacoes() {
    return this.hub.marks();
  }

  @HubPermissionRequired("crm.editar")
  @Post("marcacoes/:key")
  async marcar(@CurrentUser() me: Me, @Param("key") key: string, @Body() body: unknown) {
    await this.hub.saveMark(parseOrBadRequest(z.string().min(1).max(40), key), parseOrBadRequest(HubMarkInputSchema, body), me.id);
    return { ok: true };
  }

  @HubPermissionRequired("financeiro")
  @Get("receitas")
  receitas() {
    return this.crm.receitas();
  }

  @HubPermissionRequired("crm.ver")
  @Get("tarefas")
  tarefas(@Query() query: unknown) {
    const f = parseOrBadRequest(TaskFilterSchema, query);
    return this.hub.tasks({ status: f.status ?? "abertas", prospectId: f.empresa });
  }

  @HubPermissionRequired("crm.editar")
  @Post("tarefas")
  criarTarefa(@CurrentUser() me: Me, @Body() body: unknown) {
    return this.hub.createTask(parseOrBadRequest(HubTaskInputSchema, body), me.id);
  }

  @HubPermissionRequired("crm.editar")
  @Post("tarefas/:id/concluir")
  async concluirTarefa(@CurrentUser() me: Me, @Param("id") id: string) {
    await this.hub.completeTask(id, me.id);
    return { ok: true };
  }

  @HubPermissionRequired("crm.ver")
  @Get("meta/:mes")
  async meta(@Param("mes") mes: string) {
    return { meta: await this.hub.goal(parseOrBadRequest(MonthSchema, mes)) };
  }

  @HubPermissionRequired("equipe")
  @Post("meta")
  async salvarMeta(@Body() body: unknown) {
    await this.hub.saveGoal(parseOrBadRequest(HubGoalInputSchema, body));
    return { ok: true };
  }

  @HubPermissionRequired("equipe")
  @Get("equipe")
  equipe() {
    return this.hub.members();
  }

  @HubPermissionRequired("equipe")
  @Post("equipe")
  salvarMembro(@CurrentUser() me: Me, @Body() body: unknown) {
    return this.hub.saveMember(parseOrBadRequest(HubMemberInputSchema, body), me.id);
  }

  @HubPermissionRequired("equipe")
  @Post("equipe/:userId/ativo")
  async ativo(@Param("userId") userId: string, @Body() body: unknown) {
    await this.hub.setMemberActive(userId, parseOrBadRequest(ActiveSchema, body).active);
    return { ok: true };
  }
}

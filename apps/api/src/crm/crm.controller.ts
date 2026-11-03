import { Body, Controller, Get, Headers, HttpException, HttpStatus, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { CrmOrderDoneInputSchema, CrmOrderInputSchema, CrmOverviewQuerySchema, NpsInputSchema } from "@novoseminovo/shared-types";
import { AdminGuard } from "../admin/admin.guard";
import { currentSecret } from "../auth/secret-file";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { parseOrBadRequest } from "../common/parse";
import { feedKeyCheck } from "../marketing/conversions.service";
import { SalesGuard } from "../sales/sales.guard";
import { CrmOrdersService } from "./crm-orders.service";
import { CrmService } from "./crm.service";
import { NpsService } from "./nps.service";

function secret(name: string): string | undefined {
  try {
    return currentSecret(name);
  } catch {
    return undefined;
  }
}

function assertKey(authorization: string | undefined, name: string, what: string): void {
  const check = feedKeyCheck(authorization, secret(name));
  if (check === "not_configured") throw new HttpException(`${what} não configurado no servidor.`, HttpStatus.SERVICE_UNAVAILABLE);
  if (check === "denied") throw new HttpException("Chave inválida.", HttpStatus.UNAUTHORIZED);
}

const StatusQuery = z.object({ status: z.enum(["aberta", "feita", "cancelada"]).optional() });

// Repositório "CRM NovoSeminovo" (sessão do Claude) com a chave de secrets/crm_feed_key:
//   GET  /crm/clientes      jornada de todas as empresas
//   GET  /crm/ordens        ordens e o que cada área fez
//   POST /crm/ordens        manda uma ordem para uma área
@Controller("crm")
export class CrmController {
  constructor(
    private readonly crm: CrmService,
    private readonly orders: CrmOrdersService,
  ) {}

  @Get("clientes")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async clientes(@Headers("authorization") authorization: string | undefined) {
    assertKey(authorization, "CRM_FEED_KEY", "Feed do CRM");
    return this.crm.clientes();
  }

  @Get("ordens")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async listOrders(@Headers("authorization") authorization: string | undefined, @Query() query: unknown) {
    assertKey(authorization, "CRM_FEED_KEY", "Feed do CRM");
    return this.orders.list(parseOrBadRequest(StatusQuery, query));
  }

  @Post("ordens")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async createOrder(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    assertKey(authorization, "CRM_FEED_KEY", "Feed do CRM");
    return this.orders.create(parseOrBadRequest(CrmOrderInputSchema, body));
  }
}

// Sessões de Marketing e Financeiro: pegam as ordens da área com a chave do
// próprio feed e respondem quando concluem.
@Controller()
export class AreaOrdersController {
  constructor(private readonly orders: CrmOrdersService) {}

  @Get("marketing/ordens")
  async marketing(@Headers("authorization") authorization: string | undefined) {
    assertKey(authorization, "MARKETING_FEED_KEY", "Feed de marketing");
    return this.orders.forArea("marketing");
  }

  @Post("marketing/ordens/:id/concluir")
  async marketingDone(@Headers("authorization") authorization: string | undefined, @Param("id") id: string, @Body() body: unknown) {
    assertKey(authorization, "MARKETING_FEED_KEY", "Feed de marketing");
    await this.orders.completeByArea("marketing", id, parseOrBadRequest(CrmOrderDoneInputSchema, body).resultado);
    return { ok: true };
  }

  @Get("financeiro/ordens")
  async finance(@Headers("authorization") authorization: string | undefined) {
    assertKey(authorization, "FINANCE_FEED_KEY", "Feed financeiro");
    return this.orders.forArea("financeiro");
  }

  @Post("financeiro/ordens/:id/concluir")
  async financeDone(@Headers("authorization") authorization: string | undefined, @Param("id") id: string, @Body() body: unknown) {
    assertKey(authorization, "FINANCE_FEED_KEY", "Feed financeiro");
    await this.orders.completeByArea("financeiro", id, parseOrBadRequest(CrmOrderDoneInputSchema, body).resultado);
    return { ok: true };
  }
}

// Equipe comercial: ordens da área no /comercial.
@UseGuards(JwtAuthGuard, SalesGuard)
@Controller("sales/orders")
export class SalesOrdersController {
  constructor(private readonly orders: CrmOrdersService) {}

  @Get()
  list() {
    return this.orders.forSales();
  }

  @Post(":id/done")
  async done(@CurrentUser() user: { id: string }, @Param("id") id: string, @Body() body: unknown) {
    await this.orders.completeBySales(user.id, id, parseOrBadRequest(CrmOrderDoneInputSchema, body).resultado);
    return { ok: true };
  }
}

// Pesquisa NPS no painel do parceiro (dono da empresa).
@UseGuards(JwtAuthGuard)
@Controller("partners/mine/nps")
export class NpsController {
  constructor(private readonly nps: NpsService) {}

  @Get()
  status(@CurrentUser() user: { id: string }) {
    return this.nps.status(user.id);
  }

  @Post()
  async answer(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    await this.nps.answer(user.id, parseOrBadRequest(NpsInputSchema, body));
    return { ok: true };
  }
}

// Visão geral do CRM no admin (/admin/crm): só administrador ativo.
@Controller("admin/crm")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminCrmController {
  constructor(private readonly crm: CrmService) {}

  @Get("overview")
  overview(@Query() query: unknown) {
    return this.crm.overview(parseOrBadRequest(CrmOverviewQuerySchema, query).tipo ?? "all");
  }
}

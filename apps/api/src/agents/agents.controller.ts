import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { AgentKind, AgentMessageInputSchema, FinancingLeadStatus } from "@novoseminovo/shared-types";
import { AdminGuard } from "../admin/admin.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../auth/optional-jwt-auth.guard";
import { parseOrBadRequest } from "../common/parse";
import { AgentsService, type AgentRequester } from "./agents.service";

// Agentes liberados pelo chat do site até agora — os outros entram aqui
// conforme forem construídos (ver AgentsService.buildAgent).
const WEB_AGENTS = new Set<AgentKind>(["buyer", "partner"]);

function parseKind(kind: string): AgentKind {
  const parsed = AgentKind.safeParse(kind);
  if (!parsed.success || !WEB_AGENTS.has(parsed.data)) throw new NotFoundException("Agente não encontrado");
  return parsed.data;
}

// O site chama a API pelo servidor (server action), então o IP da conexão é
// o do container do site — o IP do visitante vem no cabeçalho que o site
// repassa (ver apps/web/lib/actions/agents.ts). Só serve pro limite por
// pessoa; o teto diário global segura quem forjar esse cabeçalho.
function clientIp(request: Request): string {
  const forwarded = request.headers["x-client-ip"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return value?.split(",")[0]?.trim() || request.ip || "desconhecido";
}

@Controller()
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get("agents/status")
  status() {
    return { enabled: this.agentsService.isEnabled() };
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post("agents/:kind/messages")
  sendMessage(
    @Param("kind") kind: string,
    @Body() body: unknown,
    @CurrentUser() user: AgentRequester | undefined,
    @Req() request: Request,
  ) {
    const input = parseOrBadRequest(AgentMessageInputSchema, body);
    return this.agentsService.sendWebMessage(parseKind(kind), input, user, clientIp(request));
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get("agents/:kind/conversations/:id")
  getConversation(
    @Param("kind") kind: string,
    @Param("id") id: string,
    @CurrentUser() user: AgentRequester | undefined,
  ) {
    return this.agentsService.getWebConversation(parseKind(kind), id, user);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get("admin/financing-leads")
  listFinancingLeads(@Query("status") status?: string) {
    const parsed = FinancingLeadStatus.safeParse(status);
    return this.agentsService.listFinancingLeads(parsed.success ? parsed.data : undefined);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch("admin/financing-leads/:id")
  updateFinancingLead(@Param("id") id: string, @Body() body: unknown) {
    const { status } = parseOrBadRequest(z.object({ status: FinancingLeadStatus }), body);
    return this.agentsService.updateFinancingLeadStatus(id, status);
  }
}

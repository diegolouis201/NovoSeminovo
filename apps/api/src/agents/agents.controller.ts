import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import {
  AgentKind,
  AgentMessageInputSchema,
  CredihomeProposalInputSchema,
  CredihomeSimulateInputSchema,
  FinancingLeadStatus,
  SendToCredihomeInputSchema,
  UpdateFinancingLeadInputSchema,
} from "@novoseminovo/shared-types";
import { AdminGuard } from "../admin/admin.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../auth/optional-jwt-auth.guard";
import { acquisitionFrom } from "../common/acquisition";
import { parseOrBadRequest } from "../common/parse";
import { AgentsService, type AgentRequester } from "./agents.service";
import { CredihomeService } from "./credihome.service";

// Agentes liberados pelo chat do site até agora — os outros entram aqui
// conforme forem construídos (ver AgentsService.buildAgent).
const WEB_AGENTS = new Set<AgentKind>(["buyer", "partner", "admin"]);

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
  constructor(
    private readonly agentsService: AgentsService,
    private readonly credihome: CredihomeService,
  ) {}

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
    return this.agentsService.sendWebMessage(parseKind(kind), input, user, clientIp(request), acquisitionFrom(request));
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
  listFinancingLeads(@Query("status") status?: string, @Query("assetType") assetType?: string) {
    const parsed = FinancingLeadStatus.safeParse(status);
    return this.agentsService.listFinancingLeads(
      parsed.success ? parsed.data : undefined,
      assetType === "vehicle" || assetType === "property" ? assetType : undefined,
    );
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch("admin/financing-leads/:id")
  updateFinancingLead(@CurrentUser() user: { id: string }, @Param("id") id: string, @Body() body: unknown) {
    return this.agentsService.updateFinancingLead(user.id, id, parseOrBadRequest(UpdateFinancingLeadInputSchema, body));
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post("admin/financing-leads/:id/credihome")
  sendToCredihome(@Param("id") id: string, @Body() body: unknown) {
    return this.credihome.send(id, parseOrBadRequest(SendToCredihomeInputSchema, body));
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post("admin/financing-leads/:id/credihome/refresh")
  refreshCredihome(@Param("id") id: string) {
    return this.credihome.refresh(id);
  }

  // Simulador de crédito na página do imóvel (público).
  @Post("listings/:id/credihome/simulate")
  simulateCredihome(@Param("id") id: string, @Body() body: unknown, @Req() request: Request) {
    return this.credihome.simulate(id, parseOrBadRequest(CredihomeSimulateInputSchema, body), clientIp(request));
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post("listings/:id/credihome/proposal")
  requestCredihomeProposal(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: Request,
    @CurrentUser() user: { id: string } | undefined,
  ) {
    return this.credihome.requestProposal(
      id,
      parseOrBadRequest(CredihomeProposalInputSchema, body),
      clientIp(request),
      acquisitionFrom(request),
      user?.id,
    );
  }
}

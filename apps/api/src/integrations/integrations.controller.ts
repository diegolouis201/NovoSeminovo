import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { CreateIntegrationFeedInputSchema, CreatePartnerApiKeyInputSchema } from "@novoseminovo/shared-types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { parseOrBadRequest } from "../common/parse";
import { ApiKeyGuard, IntegrationPartnerParam } from "./api-key.guard";
import { IntegrationsService, type IntegrationPartner } from "./integrations.service";

const BatchSchema = z.object({
  listings: z.array(z.unknown()).min(1, "Envie pelo menos 1 anúncio").max(100, "Máximo de 100 anúncios por lote"),
});
const SoldSchema = z.object({ soldPrice: z.number().positive().optional() }).optional();

// Painel do parceiro: configurar feed e chaves (login de pessoa, só o dono).
@Controller("partners/mine/integrations")
@UseGuards(JwtAuthGuard)
export class PartnerIntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  overview(@CurrentUser() user: { id: string }) {
    return this.integrations.overview(user.id);
  }

  @Post("feeds")
  createFeed(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    return this.integrations.createFeed(user.id, parseOrBadRequest(CreateIntegrationFeedInputSchema, body));
  }

  @Delete("feeds/:id")
  deleteFeed(@CurrentUser() user: { id: string }, @Param("id") id: string) {
    return this.integrations.deleteFeed(user.id, id);
  }

  @Post("feeds/:id/sync")
  @HttpCode(200)
  syncFeed(@CurrentUser() user: { id: string }, @Param("id") id: string) {
    return this.integrations.requestSync(user.id, id);
  }

  @Post("api-keys")
  createKey(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    return this.integrations.createApiKey(user.id, parseOrBadRequest(CreatePartnerApiKeyInputSchema, body).name);
  }

  @Delete("api-keys/:id")
  revokeKey(@CurrentUser() user: { id: string }, @Param("id") id: string) {
    return this.integrations.revokeApiKey(user.id, id);
  }
}

// API pública de integração (CRM → NovoSeminovo, chave nsk_...). Contrato
// documentado em /parceiro/integracoes/api no site — mudar algo aqui é
// quebrar integração de terceiro, então só acrescentar, nunca renomear.
@Controller("integrations/v1")
@UseGuards(ApiKeyGuard)
export class PublicIntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get("me")
  me(@IntegrationPartnerParam() partner: IntegrationPartner) {
    return { partnerId: partner.id, verified: partner.verified };
  }

  @Get("listings")
  list(@IntegrationPartnerParam() partner: IntegrationPartner) {
    return this.integrations.apiList(partner);
  }

  @Put("listings/:externalId")
  async upsert(@IntegrationPartnerParam() partner: IntegrationPartner, @Param("externalId") externalId: string, @Body() body: unknown) {
    const item = body && typeof body === "object" ? { ...(body as object), externalId } : { externalId };
    const { results } = await this.integrations.apiUpsert(partner, [item]);
    return results[0];
  }

  @Post("listings/batch")
  @HttpCode(200)
  batch(@IntegrationPartnerParam() partner: IntegrationPartner, @Body() body: unknown) {
    return this.integrations.apiUpsert(partner, parseOrBadRequest(BatchSchema, body).listings);
  }

  @Post("listings/:externalId/sold")
  @HttpCode(200)
  sold(@IntegrationPartnerParam() partner: IntegrationPartner, @Param("externalId") externalId: string, @Body() body: unknown) {
    return this.integrations.apiMarkSold(partner, externalId, parseOrBadRequest(SoldSchema, body)?.soldPrice);
  }

  @Delete("listings/:externalId")
  remove(@IntegrationPartnerParam() partner: IntegrationPartner, @Param("externalId") externalId: string) {
    return this.integrations.apiRemove(partner, externalId);
  }
}

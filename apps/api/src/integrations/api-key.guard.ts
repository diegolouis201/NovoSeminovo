import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, createParamDecorator } from "@nestjs/common";
import type { Request } from "express";
import { IntegrationsService, type IntegrationPartner } from "./integrations.service";

type RequestWithPartner = Request & { integrationPartner?: IntegrationPartner };

// API de integração (CRM → NovoSeminovo): autentica pela chave criada em
// /parceiro/integracoes, nunca pelo login de uma pessoa. A chave identifica
// a loja/imobiliária; tudo o que ela cria fica em nome do dono da loja.
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly integrations: IntegrationsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithPartner>();
    const header = request.headers.authorization;
    const key = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : undefined;
    if (!key) throw new UnauthorizedException("Envie a chave de integração no cabeçalho Authorization: Bearer nsk_...");
    const partner = await this.integrations.authenticateApiKey(key);
    if (!partner) throw new UnauthorizedException("Chave de integração inválida ou revogada.");
    request.integrationPartner = partner;
    return true;
  }
}

export const IntegrationPartnerParam = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): IntegrationPartner =>
    ctx.switchToHttp().getRequest<RequestWithPartner>().integrationPartner!,
);

import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  NotFoundException,
  PayloadTooLargeException,
  Post,
  Query,
  Req,
  type RawBodyRequest,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { checkSubscription, leadgenChangesOf, metaLeadsConfig, verifyMetaSignature } from "./meta-leads";
import { MetaLeadsService } from "./meta-leads.service";

// Corpo do webhook da Meta é pequeno (ids); o resto vem da Graph API.
export const META_WEBHOOK_MAX_BYTES = 256 * 1024;

// Webhook dos formulários de Lead Ads (público, sem login). Quem garante que
// a chamada é da Meta: o token de verificação (GET) e a assinatura
// X-Hub-Signature-256 sobre o corpo cru (POST; main.ts liga rawBody). Sem
// os arquivos de configuração, responde 404 e não faz nada.
@Controller("webhooks/meta")
export class MetaLeadsController {
  constructor(private readonly leads: MetaLeadsService) {}

  @Get("leadgen")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Header("Content-Type", "text/plain; charset=utf-8")
  verify(@Query() query: Record<string, unknown>): string {
    const { verifyToken, appSecret } = metaLeadsConfig();
    if (!verifyToken || !appSecret) throw new NotFoundException();
    const challenge = checkSubscription(query ?? {}, verifyToken);
    if (!challenge) throw new ForbiddenException("Token de verificação inválido.");
    return challenge;
  }

  @Post("leadgen")
  @HttpCode(200)
  // A Meta manda rajadas (vários leads de uma vez): limite alto, mas com teto.
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  receive(@Req() req: RawBodyRequest<Request>, @Headers("x-hub-signature-256") signature?: string): { ok: true } {
    const { appSecret, verifyToken } = metaLeadsConfig();
    if (!appSecret || !verifyToken) throw new NotFoundException();
    if (req.rawBody && req.rawBody.length > META_WEBHOOK_MAX_BYTES) throw new PayloadTooLargeException();
    if (!verifyMetaSignature(req.rawBody, signature, appSecret)) throw new ForbiddenException("Assinatura inválida.");
    const changes = leadgenChangesOf(req.body);
    if (!changes) throw new BadRequestException("Corpo do webhook fora do formato esperado.");
    if (changes.length) this.leads.receive(changes);
    return { ok: true };
  }
}

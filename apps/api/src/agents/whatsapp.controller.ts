import { Controller, ForbiddenException, Get, Headers, HttpCode, Post, Query, RawBodyRequest, Req, Res, ServiceUnavailableException } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { WhatsAppService } from "./whatsapp.service";
import { checkSubscription } from "../meta/meta-leads";

// Webhook do WhatsApp Cloud API. Sem guard de login — quem garante que é a
// Meta é a assinatura X-Hub-Signature-256 (ver WhatsAppService), checada
// sobre o corpo cru (main.ts liga rawBody). @SkipThrottle: a Meta é quem
// chama aqui, não uma pessoa — o limite global por IP (ver app.module.ts)
// não deve derrubar notificação de mensagem nova.
@SkipThrottle()
@Controller("webhooks/whatsapp")
export class WhatsAppController {
  constructor(private readonly whatsapp: WhatsAppService) {}

  @Get()
  verify(@Query() query: unknown, @Res() res: Response) {
    // Mesma conferência do webhook de Lead Ads (meta-leads.ts): token em
    // tempo constante e challenge só com números.
    const expected = process.env.WHATSAPP_VERIFY_TOKEN;
    const echo = expected && query && typeof query === "object" ? checkSubscription(query as Record<string, unknown>, expected) : undefined;
    if (!echo) throw new ForbiddenException("Token de verificação inválido.");
    // A Meta espera o challenge puro no corpo, não JSON.
    res.status(200).type("text/plain").send(echo);
  }

  @Post()
  @HttpCode(200)
  receive(@Req() req: RawBodyRequest<Request>, @Headers("x-hub-signature-256") signature?: string) {
    if (!this.whatsapp.isEnabled()) throw new ServiceUnavailableException("Canal WhatsApp não configurado.");
    if (!this.whatsapp.isValidSignature(req.rawBody, signature)) throw new ForbiddenException("Assinatura inválida.");
    this.whatsapp.handleWebhook(req.body);
    return { received: true };
  }
}

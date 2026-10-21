import { Controller, ForbiddenException, Get, Headers, HttpCode, Post, Query, RawBodyRequest, Req, Res, ServiceUnavailableException } from "@nestjs/common";
import type { Request, Response } from "express";
import { WhatsAppService } from "./whatsapp.service";

// Webhook do WhatsApp Cloud API. Sem guard de login — quem garante que é a
// Meta é a assinatura X-Hub-Signature-256 (ver WhatsAppService), checada
// sobre o corpo cru (main.ts liga rawBody).
@Controller("webhooks/whatsapp")
export class WhatsAppController {
  constructor(private readonly whatsapp: WhatsAppService) {}

  @Get()
  verify(
    @Query("hub.mode") mode: string | undefined,
    @Query("hub.verify_token") token: string | undefined,
    @Query("hub.challenge") challenge: string | undefined,
    @Res() res: Response,
  ) {
    const echo = this.whatsapp.verifySubscription(mode, token, challenge);
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

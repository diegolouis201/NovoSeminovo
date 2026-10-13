import { BadRequestException, Controller, Headers, Logger, Post, RawBodyRequest, Req } from "@nestjs/common";
import type { Request } from "express";
import { PartnersService } from "../partners/partners.service";
import { PaymentsService } from "../payments/payments.service";

// Sem guard — quem garante que a chamada é legítima é a assinatura do
// Stripe (Stripe-Signature), verificada aqui antes de confiar em qualquer
// coisa do corpo. Precisa do corpo cru (ver main.ts, NestFactory.create com
// rawBody: true) porque a verificação é um HMAC sobre os bytes exatos que o
// Stripe enviou — o corpo já reserializado pelo parser JSON não bate.
@Controller("webhooks")
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly payments: PaymentsService,
    private readonly partners: PartnersService,
  ) {}

  @Post("stripe")
  async handleStripeWebhook(@Req() req: RawBodyRequest<Request>, @Headers("stripe-signature") signature?: string) {
    if (!req.rawBody || !signature) throw new BadRequestException("Requisição sem corpo bruto ou assinatura");

    const event = this.payments.constructWebhookEvent(req.rawBody, signature);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const partnerId = session.metadata?.partnerId;
        const planId = session.metadata?.planId;
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (partnerId && planId && subscriptionId) {
          await this.partners.activateSubscriptionFromWebhook(partnerId, planId, subscriptionId);
          this.logger.log(`Assinatura ativada via webhook pro parceiro ${partnerId}`);
        }
        break;
      }
      default:
        // Outros eventos (ex.: customer.subscription.updated/deleted) ainda
        // não têm ação aqui — a confirmação síncrona no retorno do Checkout
        // (ver PartnersService.confirmCheckoutSession) já cobre o caminho
        // principal; isso é só reforço pra quem fecha a aba antes de voltar.
        break;
    }

    return { received: true };
  }
}

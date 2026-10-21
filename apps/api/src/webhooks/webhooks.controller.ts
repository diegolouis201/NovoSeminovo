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

    let event: ReturnType<PaymentsService["constructWebhookEvent"]>;
    try {
      event = this.payments.constructWebhookEvent(req.rawBody, signature);
    } catch {
      throw new BadRequestException("Assinatura do webhook inválida");
    }

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
      // Renovação paga, cartão recusado (past_due), cancelamento pelo portal
      // do Stripe ou por falta de pagamento depois das novas tentativas.
      // O período fica nos itens da assinatura (API do Stripe 2025+).
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const item = subscription.items?.data?.[0];
        const period = item
          ? { start: new Date(item.current_period_start * 1000), end: new Date(item.current_period_end * 1000) }
          : undefined;
        const status = event.type === "customer.subscription.deleted" ? "canceled" : subscription.status;
        const updated = await this.partners.syncSubscriptionFromStripe(subscription.id, status, period);
        if (updated > 0) this.logger.log(`Assinatura ${subscription.id} sincronizada: ${status}`);
        break;
      }
      default:
        break;
    }

    return { received: true };
  }
}

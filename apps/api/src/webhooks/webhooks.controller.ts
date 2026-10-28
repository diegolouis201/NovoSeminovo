import { BadRequestException, Controller, Headers, Logger, Post, RawBodyRequest, Req } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request } from "express";
import { PartnersService } from "../partners/partners.service";
import { PaymentsService } from "../payments/payments.service";
import { ListingsService } from "../listings/listings.service";
import { AffiliatesService } from "../affiliates/affiliates.service";

// Sem guard — quem garante que a chamada é legítima é a assinatura do
// Stripe (Stripe-Signature), verificada aqui antes de confiar em qualquer
// coisa do corpo. Precisa do corpo cru (ver main.ts, NestFactory.create com
// rawBody: true) porque a verificação é um HMAC sobre os bytes exatos que o
// Stripe enviou — o corpo já reserializado pelo parser JSON não bate.
// @SkipThrottle: o limite global por IP (ver app.module.ts) não pode
// derrubar confirmação de pagamento numa rajada de eventos do Stripe.
@SkipThrottle()
@Controller("webhooks")
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly payments: PaymentsService,
    private readonly partners: PartnersService,
    private readonly listings: ListingsService,
    private readonly affiliates: AffiliatesService,
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
        // Plano de anúncio de pessoa física (pagamento único).
        if (session.metadata?.kind === "listing_boost" && session.metadata.purchaseId) {
          if (session.payment_status === "paid") await this.listings.applyBoost(session.metadata.purchaseId);
          break;
        }
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
      // Toda fatura paga de assinatura (a primeira e as renovações) — base da
      // comissão recorrente do afiliado que indicou a loja/imobiliária.
      case "invoice.paid": {
        const invoice = event.data.object as {
          id: string;
          amount_paid: number;
          subscription?: string | { id: string } | null;
          parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null;
          status_transitions?: { paid_at?: number | null };
        };
        const ref = invoice.parent?.subscription_details?.subscription ?? invoice.subscription;
        const stripeSubscriptionId = typeof ref === "string" ? ref : ref?.id;
        if (stripeSubscriptionId) {
          await this.affiliates.recordPartnerInvoice({
            invoiceId: invoice.id,
            stripeSubscriptionId,
            amountPaid: (invoice.amount_paid ?? 0) / 100,
            paidAt: invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000) : new Date(),
          });
        }
        break;
      }
      // Estorno feito no painel do Stripe (total ou parcial).
      case "charge.refunded": {
        const charge = event.data.object as { payment_intent?: string | { id: string } | null; amount: number; amount_refunded: number; refunded: boolean };
        const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
        if (!paymentIntentId) break;
        const target = await this.payments.findRefundTarget(paymentIntentId);
        const fullRefund = charge.refunded || charge.amount_refunded >= charge.amount;
        if (target?.kind === "boost") await this.listings.refundBoost(target.purchaseId, fullRefund);
        if (target?.kind === "invoice") await this.affiliates.recordInvoiceRefund(target.invoiceId, charge.amount_refunded / 100, fullRefund);
        if (!target) this.logger.warn(`Estorno de um pagamento que o site não reconhece (${paymentIntentId}).`);
        break;
      }
      default:
        break;
    }

    return { received: true };
  }
}

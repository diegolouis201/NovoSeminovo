import { Injectable, Logger } from "@nestjs/common";
import Stripe from "stripe";
import { PrismaService } from "../prisma/prisma.service";

export type CheckoutSessionMetadata = { partnerId: string; planId: string };

// Cobrança via Stripe é opcional (ver README "Próximos passos" e
// PaymentsStatusSchema no shared-types): sem STRIPE_SECRET_KEY, isEnabled()
// devolve false e quem chama (PartnersService) cai de volta na simulação de
// sempre — nada quebra pra quem não configurou Stripe.
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private client: Stripe | undefined;

  isEnabled(): boolean {
    return Boolean(process.env.STRIPE_SECRET_KEY);
  }

  private getClient(): Stripe {
    if (!this.client) {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) throw new Error("STRIPE_SECRET_KEY não configurada");
      // Cliente baseado em fetch (em vez do cliente HTTP padrão baseado em
      // node:http) porque o fetch nativo do Node respeita HTTPS_PROXY quando
      // o processo roda com NODE_USE_ENV_PROXY=1 — necessário em ambientes
      // atrás de um proxy de saída (ex.: este sandbox). Sem isso configurado,
      // comporta-se como conexão direta normal.
      this.client = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
    }
    return this.client;
  }

  constructor(private readonly prisma: PrismaService) {}

  // Garante que todo Plan sem stripePriceId ganhe um Product + Price de
  // verdade no Stripe (criados via API, sem precisar mexer no dashboard) —
  // chamado sob demanda antes de criar uma sessão de checkout, idempotente
  // (só cria o que ainda não tem preço).
  async ensureStripeCatalog(): Promise<void> {
    if (!this.isEnabled()) return;
    const client = this.getClient();

    const plans = await this.prisma.plan.findMany({ where: { stripePriceId: null } });
    for (const plan of plans) {
      const product = await client.products.create({ name: `NovoSeminovo — Plano ${plan.name}` });
      const price = await client.prices.create({
        product: product.id,
        currency: "brl",
        unit_amount: Math.round(Number(plan.priceMonth) * 100),
        recurring: { interval: "month" },
      });
      await this.prisma.plan.update({ where: { id: plan.id }, data: { stripePriceId: price.id } });
      this.logger.log(`Price criado no Stripe pro plano "${plan.name}": ${price.id}`);
    }
  }

  private async ensureCustomer(partner: { id: string; legalName: string; stripeCustomerId: string | null }): Promise<string> {
    if (partner.stripeCustomerId) return partner.stripeCustomerId;

    const client = this.getClient();
    const customer = await client.customers.create({
      name: partner.legalName,
      metadata: { partnerId: partner.id },
    });
    await this.prisma.partner.update({ where: { id: partner.id }, data: { stripeCustomerId: customer.id } });
    return customer.id;
  }

  async createCheckoutSession(
    partner: { id: string; legalName: string; stripeCustomerId: string | null },
    plan: { id: string; stripePriceId: string | null },
    successUrl: string,
    cancelUrl: string,
  ): Promise<string> {
    await this.ensureStripeCatalog();
    const client = this.getClient();
    const customerId = await this.ensureCustomer(partner);

    // stripePriceId pode ter acabado de ser criado por ensureStripeCatalog —
    // relê em vez de confiar no valor que chegou por parâmetro.
    const freshPlan = await this.prisma.plan.findUniqueOrThrow({ where: { id: plan.id } });
    if (!freshPlan.stripePriceId) throw new Error(`Plano ${plan.id} sem stripePriceId mesmo depois de ensureStripeCatalog`);

    const session = await client.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: freshPlan.stripePriceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { partnerId: partner.id, planId: plan.id },
      subscription_data: { metadata: { partnerId: partner.id, planId: plan.id } },
    });

    if (!session.url) throw new Error("Stripe não devolveu uma URL de checkout");
    return session.url;
  }

  // Chamado quando a pessoa volta do Checkout (success_url) — confirma
  // direto na API do Stripe em vez de confiar só no redirecionamento do
  // navegador, que pode ser forjado.
  async confirmCheckoutSession(
    sessionId: string,
  ): Promise<{ metadata: CheckoutSessionMetadata; stripeSubscriptionId: string } | undefined> {
    const client = this.getClient();
    const session = await client.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });

    if (session.status !== "complete" || session.payment_status !== "paid") return undefined;
    const partnerId = session.metadata?.partnerId;
    const planId = session.metadata?.planId;
    if (!partnerId || !planId) return undefined;

    const subscriptionId =
      typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    if (!subscriptionId) return undefined;

    return { metadata: { partnerId, planId }, stripeSubscriptionId: subscriptionId };
  }

  async cancelStripeSubscription(stripeSubscriptionId: string): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      await this.getClient().subscriptions.cancel(stripeSubscriptionId);
    } catch (error) {
      // Já pode ter sido cancelada do lado do Stripe (ex.: pelo portal do
      // cliente) — não falha o cancelamento do nosso lado por isso.
      this.logger.warn(`Falha ao cancelar assinatura ${stripeSubscriptionId} no Stripe: ${error}`);
    }
  }

  constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET não configurada");
    return this.getClient().webhooks.constructEvent(payload, signature, secret);
  }
}

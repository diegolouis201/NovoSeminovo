import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
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
  // Os preços já gravados nos planos foram conferidos contra o modo atual
  // (teste/real) nesta execução da API?
  private catalogChecked = false;

  isEnabled(): boolean {
    return Boolean(process.env.STRIPE_SECRET_KEY);
  }

  isTestMode(): boolean {
    return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
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

    // Preço criado no modo de teste não existe no modo real (e vice-versa):
    // ao trocar as chaves, o que não serve mais é recriado no modo atual.
    if (!this.catalogChecked) {
      const priced = await this.prisma.plan.findMany({ where: { stripePriceId: { not: null } } });
      for (const plan of priced) {
        if (!(await this.usablePrice(plan.stripePriceId!))) {
          await this.prisma.plan.update({ where: { id: plan.id }, data: { stripePriceId: null } });
          this.logger.log(`Preço do plano "${plan.name}" era de outro modo do Stripe — será recriado.`);
        }
      }
      this.catalogChecked = true;
    }

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

  // Preço existe, está ativo e é do mesmo modo (teste/real) da chave atual.
  private async usablePrice(priceId: string): Promise<boolean> {
    try {
      const price = await this.getClient().prices.retrieve(priceId);
      return price.active && price.livemode === !this.isTestMode();
    } catch (error) {
      if ((error as { code?: string }).code === "resource_missing") return false;
      throw error;
    }
  }

  private async usableCustomer(customerId: string): Promise<boolean> {
    try {
      const customer = await this.getClient().customers.retrieve(customerId);
      return !customer.deleted && customer.livemode === !this.isTestMode();
    } catch (error) {
      if ((error as { code?: string }).code === "resource_missing") return false;
      throw error;
    }
  }

  private async ensureCustomer(partner: { id: string; legalName: string; stripeCustomerId: string | null }, email?: string): Promise<string> {
    // Cliente criado no modo de teste não serve no modo real: cria outro.
    if (partner.stripeCustomerId && (await this.usableCustomer(partner.stripeCustomerId))) return partner.stripeCustomerId;

    // E-mail do dono no Customer — é pra ele que o Stripe manda recibo e o
    // aviso de cartão recusado com o link de atualizar o pagamento.
    const client = this.getClient();
    const customer = await client.customers.create({
      name: partner.legalName,
      email,
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
    ownerEmail?: string,
  ): Promise<string> {
    // Qualquer falha de rede/API do Stripe aqui (fora do ar, chave inválida,
    // timeout) vira uma mensagem clara em vez do "Internal server error"
    // genérico do filtro padrão do Nest — quem está tentando contratar um
    // plano não devia ver um erro de infraestrutura cru.
    try {
      await this.ensureStripeCatalog();
      const client = this.getClient();
      const customerId = await this.ensureCustomer(partner, ownerEmail);

      // stripePriceId pode ter acabado de ser criado por ensureStripeCatalog —
      // relê em vez de confiar no valor que chegou por parâmetro.
      const freshPlan = await this.prisma.plan.findUniqueOrThrow({ where: { id: plan.id } });
      if (!freshPlan.stripePriceId) {
        throw new Error(`Plano ${plan.id} sem stripePriceId mesmo depois de ensureStripeCatalog`);
      }

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
    } catch (error) {
      this.logger.error(`Falha ao criar checkout Stripe pro parceiro ${partner.id}: ${error}`);
      throw new ServiceUnavailableException(
        "Não foi possível iniciar o checkout agora — o Stripe está indisponível. Tente novamente em instantes.",
      );
    }
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

  // Plano de anúncio de pessoa física (pagamento único, sem catálogo no
  // Stripe — o preço vai inline). metadata.kind diferencia do checkout de
  // assinatura no webhook.
  async createListingBoostCheckout(params: {
    purchaseId: string;
    listingId: string;
    tierName: string;
    amount: number;
    email?: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string; sessionId: string }> {
    try {
      const session = await this.getClient().checkout.sessions.create({
        mode: "payment",
        customer_email: params.email,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "brl",
              unit_amount: Math.round(params.amount * 100),
              product_data: { name: `NovoSeminovo — Anúncio ${params.tierName}` },
            },
          },
        ],
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: { kind: "listing_boost", purchaseId: params.purchaseId, listingId: params.listingId },
      });
      if (!session.url) throw new Error("Stripe não devolveu uma URL de checkout");
      return { url: session.url, sessionId: session.id };
    } catch (error) {
      this.logger.error(`Falha ao criar checkout do anúncio ${params.listingId}: ${error}`);
      throw new ServiceUnavailableException("Não foi possível abrir o pagamento agora. Tente novamente em instantes.");
    }
  }

  // Volta do checkout: confirma direto no Stripe (o redirecionamento do
  // navegador sozinho pode ser forjado).
  async confirmListingBoostSession(sessionId: string): Promise<string | undefined> {
    const session = await this.getClient().checkout.sessions.retrieve(sessionId);
    if (session.status !== "complete" || session.payment_status !== "paid") return undefined;
    if (session.metadata?.kind !== "listing_boost") return undefined;
    return session.metadata.purchaseId;
  }

  // Portal do cliente do Stripe: a loja troca o cartão, vê as faturas e
  // cancela por lá. Precisa estar ativado no dashboard (Configurações →
  // Billing → Customer portal), senão o Stripe recusa a sessão.
  async createBillingPortalSession(customerId: string, returnUrl: string): Promise<string> {
    try {
      const session = await this.getClient().billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
      return session.url;
    } catch (error) {
      this.logger.error(`Falha ao abrir o portal do Stripe pro customer ${customerId}: ${error}`);
      throw new ServiceUnavailableException(
        "Não foi possível abrir a área de pagamento agora. Tente novamente em instantes ou fale com a gente no WhatsApp.",
      );
    }
  }

  constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET não configurada");
    return this.getClient().webhooks.constructEvent(payload, signature, secret);
  }
}

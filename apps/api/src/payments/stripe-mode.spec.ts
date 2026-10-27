import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { PrismaService } from "../prisma/prisma.service";
import { PaymentsService } from "./payments.service";

// Troca das chaves de teste pelas reais: preço e cliente criados no modo de
// teste não existem no modo real — são recriados, sem erro no checkout.
function setup(key: string, plans: Array<{ id: string; name: string; priceMonth: number; stripePriceId: string | null }>, partnerCustomer: string | null) {
  process.env.STRIPE_SECRET_KEY = key;
  const stripePrices: Record<string, { active: boolean; livemode: boolean }> = { price_teste: { active: true, livemode: false } };
  const stripeCustomers: Record<string, { deleted?: boolean; livemode: boolean }> = { cus_teste: { livemode: false } };
  const created = { prices: 0, customers: 0, sessions: [] as unknown[] };
  const missing = () => Object.assign(new Error("No such object"), { code: "resource_missing" });
  const fake = {
    prices: {
      retrieve: async (id: string) => {
        if (!stripePrices[id]) throw missing();
        return stripePrices[id];
      },
      create: async () => {
        const id = `price_real_${++created.prices}`;
        stripePrices[id] = { active: true, livemode: true };
        return { id };
      },
    },
    products: { create: async () => ({ id: "prod_1" }) },
    customers: {
      retrieve: async (id: string) => {
        if (!stripeCustomers[id]) throw missing();
        return stripeCustomers[id];
      },
      create: async () => {
        const id = `cus_real_${++created.customers}`;
        stripeCustomers[id] = { livemode: true };
        return { id };
      },
    },
    checkout: {
      sessions: {
        create: async (params: unknown) => {
          created.sessions.push(params);
          return { url: "https://checkout.stripe.com/x" };
        },
      },
    },
  };
  const partner = { id: "p1", legalName: "Loja", stripeCustomerId: partnerCustomer };
  const prisma = {
    plan: {
      findMany: async ({ where }: { where: { stripePriceId: null | { not: null } } }) =>
        plans.filter((plan) => (where.stripePriceId === null ? plan.stripePriceId === null : plan.stripePriceId !== null)),
      update: async ({ where, data }: { where: { id: string }; data: { stripePriceId: string | null } }) => {
        const plan = plans.find((p) => p.id === where.id)!;
        plan.stripePriceId = data.stripePriceId;
        return plan;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => plans.find((p) => p.id === where.id)!,
    },
    partner: {
      update: async ({ data }: { data: { stripeCustomerId: string } }) => {
        partner.stripeCustomerId = data.stripeCustomerId;
        return partner;
      },
    },
  } as unknown as PrismaService;
  const service = new PaymentsService(prisma);
  (service as unknown as { client: unknown }).client = fake;
  return { service, created, partner };
}

describe("Stripe: troca do modo de teste para o real", () => {
  test("preço e cliente do modo de teste são recriados no modo real", async () => {
    const plans = [{ id: "plano1", name: "Turbo", priceMonth: 99, stripePriceId: "price_teste" }];
    const { service, created, partner } = setup("sk_live_x", plans, "cus_teste");
    await service.createCheckoutSession(partner, plans[0]!, "https://s/ok", "https://s/cancel", "dono@loja.com");
    assert.equal(plans[0]!.stripePriceId, "price_real_1");
    assert.equal(partner.stripeCustomerId, "cus_real_1");
    const session = created.sessions[0] as { customer: string; line_items: Array<{ price: string }> };
    assert.equal(session.customer, "cus_real_1");
    assert.equal(session.line_items[0]!.price, "price_real_1");
  });

  test("no mesmo modo, nada é recriado", async () => {
    const plans = [{ id: "plano1", name: "Turbo", priceMonth: 99, stripePriceId: "price_teste" }];
    const { service, created, partner } = setup("sk_test_x", plans, "cus_teste");
    await service.createCheckoutSession(partner, plans[0]!, "https://s/ok", "https://s/cancel");
    assert.equal(created.prices, 0);
    assert.equal(created.customers, 0);
    assert.equal(plans[0]!.stripePriceId, "price_teste");
  });
});

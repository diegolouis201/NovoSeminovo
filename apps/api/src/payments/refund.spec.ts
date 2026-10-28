import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { PrismaService } from "../prisma/prisma.service";
import type { AffiliatesService } from "../affiliates/affiliates.service";
import { ListingsService } from "../listings/listings.service";

// Estorno no Stripe (charge.refunded): o plano de anúncio sai da receita, a
// comissão do afiliado cai e o anúncio volta ao plano que continua pago.
// Precisa do PostgreSQL local (DATABASE_URL).
const withDb = Boolean(process.env.DATABASE_URL);

describe("Estorno de plano de anúncio (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const canceled: string[] = [];
  const affiliates = { cancelCommission: async (ref: string) => void canceled.push(ref) } as unknown as AffiliatesService;
  const Ctor = ListingsService as unknown as new (...args: unknown[]) => ListingsService;
  const service = new Ctor(prisma, undefined, undefined, undefined, undefined, undefined, undefined, affiliates);
  const tag = `estorno-${Date.now()}`;
  const ids = { user: "", listing: "", flex: "", nitro: "" };

  before(async () => {
    ids.user = (await prisma.user.create({ data: { name: "Paula", email: `${tag}@teste.local`, role: "buyer" } })).id;
    ids.listing = (
      await prisma.listing.create({
        data: { type: "vehicle", ownerUserId: ids.user, title: "Carro de teste", description: "Anúncio de teste do estorno.", price: 50000, city: "BH", state: "MG", status: "active", planTier: "nitro", tierRank: 3 },
      })
    ).id;
    ids.flex = (await prisma.listingBoostPurchase.create({ data: { listingId: ids.listing, userId: ids.user, tier: "flex", amount: 39.9, status: "paid", paidAt: new Date() } })).id;
    ids.nitro = (await prisma.listingBoostPurchase.create({ data: { listingId: ids.listing, userId: ids.user, tier: "nitro", amount: 129.9, status: "paid", paidAt: new Date() } })).id;
  });

  after(async () => {
    await prisma.listingBoostPurchase.deleteMany({ where: { listingId: ids.listing } });
    await prisma.listing.deleteMany({ where: { id: ids.listing } });
    await prisma.user.deleteMany({ where: { id: ids.user } });
    await prisma.$disconnect();
  });

  test("estorno parcial não muda nada", async () => {
    await service.refundBoost(ids.nitro, false);
    assert.equal((await prisma.listingBoostPurchase.findUniqueOrThrow({ where: { id: ids.nitro } })).status, "paid");
    assert.deepEqual(canceled, []);
  });

  test("estorno total: sai da receita, cancela a comissão e o anúncio volta ao plano ainda pago", async () => {
    await service.refundBoost(ids.nitro, true);
    const purchase = await prisma.listingBoostPurchase.findUniqueOrThrow({ where: { id: ids.nitro } });
    assert.equal(purchase.status, "refunded");
    assert.ok(purchase.refundedAt);
    assert.deepEqual(canceled, [`boost:${ids.nitro}`]);
    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: ids.listing } });
    assert.equal(listing.planTier, "flex");
    assert.equal(listing.tierRank, 1);
  });

  test("último plano estornado: volta ao Grátis; estorno repetido é ignorado", async () => {
    await prisma.listing.update({ where: { id: ids.listing }, data: { planTier: "flex", tierRank: 1 } });
    await service.refundBoost(ids.flex, true);
    await service.refundBoost(ids.flex, true);
    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: ids.listing } });
    assert.equal(listing.planTier, "free");
    assert.equal(canceled.filter((ref) => ref === `boost:${ids.flex}`).length, 1);
  });
});

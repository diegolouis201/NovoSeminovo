import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { PrismaService } from "../prisma/prisma.service";
import { FinanceFeedService } from "./finance-feed.service";

// "Ligação direta" com o CRM financeiro (repositório do Diego no Claude):
// GET /financeiro/eventos com chave secreta devolve entradas, saídas e
// assinaturas, para lançar no caixa e conciliar com o Stripe e o banco.
const withDb = Boolean(process.env.DATABASE_URL);

describe("Feed do CRM financeiro (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const service = new FinanceFeedService(prisma);
  const tag = `fin-${Date.now()}`;
  const cpf = `9${String(Date.now()).slice(-10).split("").reverse().join("")}`;
  const ids = { owner: "", buyer: "", affUser: "", partner: "", listing: "", payment: "", boost: "", affiliate: "", commission: "", deal: "", sub: "" };

  before(async () => {
    ids.owner = (await prisma.user.create({ data: { name: "Dono Loja", email: `dono-${tag}@teste.local`, cpf } })).id;
    ids.buyer = (await prisma.user.create({ data: { name: "Comprador PF", email: `pf-${tag}@teste.local`, phone: "31911112222" } })).id;
    ids.affUser = (await prisma.user.create({ data: { name: "Afiliada", email: `af-${tag}@teste.local` } })).id;
    ids.partner = (
      await prisma.partner.create({ data: { ownerUserId: ids.owner, type: "dealership", legalName: `Loja ${tag}`, document: "11222333000181", slug: tag } })
    ).id;
    ids.listing = (
      await prisma.listing.create({
        data: { type: "vehicle", ownerUserId: ids.buyer, title: `Gol ${tag}`, description: "teste", price: 30000, city: "BH", state: "MG", status: "active" },
      })
    ).id;
    ids.payment = (
      await prisma.subscriptionPayment.create({
        data: { stripeInvoiceId: `in_${tag}`, partnerId: ids.partner, partnerType: "dealership", amount: 199.9, paidAt: new Date() },
      })
    ).id;
    ids.boost = (
      await prisma.listingBoostPurchase.create({
        data: { listingId: ids.listing, userId: ids.buyer, tier: "turbo", amount: 39.9, stripeSessionId: `cs_${tag}`, status: "paid", paidAt: new Date() },
      })
    ).id;
    ids.affiliate = (await prisma.affiliate.create({ data: { userId: ids.affUser, code: tag, channels: "instagram", pixKey: "chave-pix-secreta@teste.local" } })).id;
    ids.commission = (
      await prisma.affiliateCommission.create({
        data: {
          affiliateId: ids.affiliate,
          source: "partner_subscription",
          sourceRef: `ref-${tag}`,
          referredUserId: ids.owner,
          partnerId: ids.partner,
          description: "Mensalidade Loja",
          baseAmount: 199.9,
          rate: 20,
          amount: 39.98,
          status: "available",
          availableAt: new Date(),
        },
      })
    ).id;
    ids.deal = (
      await prisma.financingDeal.create({
        data: {
          buyerName: "Cliente Financiamento",
          financingProvider: "credihome",
          assetValue: 300000,
          financedAmount: 200000,
          commissionAmount: 2000,
          rebatePercent: 20,
          rebateAmount: 400,
          registeredByUserId: ids.owner,
          commissionReceivedAt: new Date(),
        },
      })
    ).id;
    const plan = await prisma.plan.findFirst();
    if (plan) {
      const now = new Date();
      ids.sub = (
        await prisma.subscription.create({
          data: { partnerId: ids.partner, planId: plan.id, status: "active", currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000) },
        })
      ).id;
    }
  });

  after(async () => {
    if (ids.sub) await prisma.subscription.delete({ where: { id: ids.sub } });
    await prisma.financingDeal.deleteMany({ where: { id: ids.deal } });
    await prisma.affiliateCommission.deleteMany({ where: { id: ids.commission } });
    await prisma.affiliate.deleteMany({ where: { id: ids.affiliate } });
    await prisma.subscriptionPayment.deleteMany({ where: { id: ids.payment } });
    await prisma.listingBoostPurchase.deleteMany({ where: { id: ids.boost } });
    await prisma.listing.deleteMany({ where: { id: ids.listing } });
    await prisma.partner.deleteMany({ where: { id: ids.partner } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.owner, ids.buyer, ids.affUser] } } });
    await prisma.$disconnect();
  });

  test("entradas: mensalidade, plano de anúncio e comissão de financiamento recebida", async () => {
    const feed = await service.feed(new Date(Date.now() - 86_400_000));
    const monthly = feed.entradas.find((e) => e.referencia === `in_${tag}`);
    assert.equal(monthly?.tipo, "mensalidade");
    assert.equal(monthly?.valor, 199.9);
    assert.equal(monthly?.cliente?.nome, `Loja ${tag}`);
    assert.equal(monthly?.cliente?.documento, "11222333000181");
    assert.equal(monthly?.origem, "stripe");

    const boost = feed.entradas.find((e) => e.referencia === `cs_${tag}`);
    assert.equal(boost?.tipo, "plano_anuncio");
    assert.equal(boost?.valor, 39.9);
    assert.equal(boost?.cliente?.email, `pf-${tag}@teste.local`);

    const financing = feed.entradas.find((e) => e.id === ids.deal);
    assert.equal(financing?.tipo, "comissao_financiamento");
    assert.equal(financing?.valor, 2000);
    assert.equal(financing?.origem, "banco");
  });

  test("saídas: comissão de afiliado a pagar, sem chave Pix; cashback não existe mais (mesmo em negócio antigo com rebate)", async () => {
    const feed = await service.feed(new Date(Date.now() - 86_400_000));
    const commission = feed.saidas.find((s) => s.id === ids.commission);
    assert.equal(commission?.tipo, "comissao_afiliado");
    assert.equal(commission?.status, "a_pagar");
    assert.equal(commission?.valor, 39.98);
    assert.equal(commission?.favorecido, "Afiliada");
    assert.equal(feed.saidas.find((s) => s.id === ids.deal), undefined, "financiamento não gera saída de cashback");
    assert.ok(!/cashback/i.test(JSON.stringify(feed)), "nenhuma linha fala em cashback");
    const text = JSON.stringify(feed);
    assert.ok(!text.includes("chave-pix-secreta"));
    assert.ok(!text.includes(cpf), "CPF não sai");
    assert.ok(!text.includes("31911112222"), "telefone não sai");
  });

  test("assinaturas ativas com plano e valor mensal", async () => {
    if (!ids.sub) return;
    const feed = await service.feed(new Date(Date.now() - 86_400_000));
    const sub = feed.assinaturas.find((a) => a.id === ids.sub);
    assert.equal(sub?.empresa, `Loja ${tag}`);
    assert.equal(sub?.status, "ativa");
    assert.equal(typeof sub?.valorMensal, "number");
  });

  test("estorno aparece na entrada", async () => {
    await prisma.subscriptionPayment.update({ where: { id: ids.payment }, data: { refundedAmount: 199.9, refundedAt: new Date() } });
    const feed = await service.feed(new Date(Date.now() - 86_400_000));
    const monthly = feed.entradas.find((e) => e.referencia === `in_${tag}`);
    assert.equal(monthly?.estornado, true);
    assert.equal(monthly?.valorEstornado, 199.9);
  });

  test("data de corte deixa de fora o que é antigo", async () => {
    const feed = await service.feed(new Date(Date.now() + 86_400_000));
    assert.ok(!feed.entradas.some((e) => e.referencia === `in_${tag}`));
  });
});

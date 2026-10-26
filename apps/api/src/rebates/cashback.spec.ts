import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { PrismaService } from "../prisma/prisma.service";
import type { NotificationsService } from "../notifications/notifications.service";
import { RebatesService } from "./rebates.service";

// Cashback no financiamento: 20% da comissão bruta para quem contratou, só
// depois que a comissão é recebida. Precisa do PostgreSQL local (DATABASE_URL).
const withDb = Boolean(process.env.DATABASE_URL);

describe("Cashback de quem contratou o financiamento (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const notified: Array<{ userId: string; type: string }> = [];
  const notifications = { notify: async (userId: string, type: string) => void notified.push({ userId, type }) } as unknown as NotificationsService;
  const service = new RebatesService(prisma, notifications);
  const tag = `cashback-${Date.now()}`;
  const ids = { admin: "", buyer: "", lead: "", leadNoAccount: "" };

  before(async () => {
    ids.admin = (await prisma.user.create({ data: { name: "Admin", email: `admin-${tag}@teste.local`, role: "admin" } })).id;
    ids.buyer = (await prisma.user.create({ data: { name: "Bruna", email: `bruna-${tag}@teste.local`, role: "buyer", cpf: tag.replace(/\D/g, "").slice(-11).padStart(11, "1") } })).id;
    ids.lead = (
      await prisma.financingLead.create({
        data: { channel: "web", name: "Bruna", phone: "31911112222", email: `BRUNA-${tag}@teste.local`, assetType: "vehicle", assetValue: 100000 },
      })
    ).id;
    ids.leadNoAccount = (
      await prisma.financingLead.create({
        data: { channel: "web", name: "Sem Conta", phone: "31933334444", email: `semconta-${tag}@teste.local`, assetType: "property", assetValue: 500000 },
      })
    ).id;
  });

  after(async () => {
    await prisma.financingLead.updateMany({ where: { id: { in: [ids.lead, ids.leadNoAccount] } }, data: { financingDealId: null } });
    await prisma.financingDeal.deleteMany({ where: { registeredByUserId: ids.admin } });
    await prisma.financingLead.deleteMany({ where: { id: { in: [ids.lead, ids.leadNoAccount] } } });
    // Outros testes rodando junto avisam todos os admins (inclusive este).
    await prisma.notification.deleteMany({ where: { userId: { in: [ids.admin, ids.buyer] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.admin, ids.buyer] } } });
    await prisma.$disconnect();
  });

  test("20% da comissão bruta, ligado à conta pelo e-mail, sem pagar antes da comissão", async () => {
    const deal = await service.registerCashback(ids.admin, {
      leadId: ids.lead,
      financingProvider: "Banco Teste",
      assetValue: 100000,
      financedAmount: 80000,
      commissionRate: 1,
    });
    const row = await prisma.financingDeal.findUniqueOrThrow({ where: { id: deal.id } });
    assert.equal(Number(row.commissionAmount), 800);
    assert.equal(Number(row.rebateAmount), 160);
    assert.equal(row.buyerUserId, ids.buyer);
    assert.equal(row.listingId, null);
    assert.ok(notified.some((n) => n.userId === ids.buyer && n.type === "cashback_registered"));

    await assert.rejects(service.markPaid(deal.id), /só é pago depois/);
    const released = await service.markCommissionReceived(deal.id);
    assert.equal(released.stage, "to_pay");
    const paid = await service.markPaid(deal.id, "Pix 155,00 líquido");
    assert.equal(paid.stage, "paid");
    assert.deepEqual(
      notified.filter((n) => n.userId === ids.buyer).map((n) => n.type),
      ["cashback_registered", "cashback_released", "cashback_paid"],
    );
    await assert.rejects(service.deleteUnpaidDeal(deal.id), /já foi pago/);

    const mine = await service.myCashback(ids.buyer);
    assert.equal(mine.deals.length, 1);
    assert.equal(mine.deals[0].buyerCpf, undefined, "CPF não vai para a tela do cliente");
    assert.match(mine.totalPaidLabel, /160/);
    assert.equal(mine.cpfMissing, false);
  });

  test("cliente sem conta: cashback fica guardado e liga quando ele se cadastra com o mesmo e-mail", async () => {
    const deal = await service.registerCashback(ids.admin, {
      leadId: ids.leadNoAccount,
      financingProvider: "Credihome",
      assetValue: 500000,
      financedAmount: 400000,
      commissionRate: 1,
    });
    assert.equal((await prisma.financingDeal.findUniqueOrThrow({ where: { id: deal.id } })).buyerUserId, null);
    const later = await prisma.user.create({ data: { name: "Sem Conta", email: `semconta-${tag}@teste.local`, role: "buyer" } });
    try {
      const mine = await service.myCashback(later.id);
      assert.equal(mine.deals.length, 1);
      assert.equal(mine.deals[0].cashbackAmount, 800);
      assert.equal(mine.deals[0].stage, "awaiting_commission");
      assert.equal(mine.cpfMissing, true);
    } finally {
      await prisma.financingDeal.updateMany({ where: { buyerUserId: later.id }, data: { buyerUserId: null } });
      await prisma.user.delete({ where: { id: later.id } });
    }
  });
});

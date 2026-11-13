import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { PATH_METADATA } from "@nestjs/common/constants";
import { PrismaService } from "../prisma/prisma.service";
import { FinancingDealsController } from "./financing-deals.controller";
import { FinancingDealsService } from "./financing-deals.service";

// Financiamento fechado: o NovoSeminovo guarda a comissão que o banco paga
// e ela fica toda com a empresa. O cashback ao cliente acabou em 06/11/2026
// (decisão do Diego) — nada de valor devolvido, aviso ao cliente ou rota.

describe("Rotas de financiamento fechado (sem cashback)", () => {
  const routes = Object.getOwnPropertyNames(FinancingDealsController.prototype)
    .filter((name) => name !== "constructor")
    .map((name) => String(Reflect.getMetadata(PATH_METADATA, (FinancingDealsController.prototype as unknown as Record<string, object>)[name]) ?? ""));

  test("'Meu cashback' e 'marcar cashback como pago' não existem mais", () => {
    assert.ok(routes.length > 0);
    for (const route of routes) {
      assert.doesNotMatch(route, /cashback/i, route);
      assert.doesNotMatch(route, /\/pay$/, route);
    }
  });

  test("o admin ainda lista os negócios, marca a comissão recebida e baixa o fechamento do mês", () => {
    assert.deepEqual(
      [...routes].sort(),
      ["admin/financing-deals", "admin/financing-deals/:id/commission-received", "admin/financing-report", "admin/partner-sends"].sort(),
    );
  });
});

const withDb = Boolean(process.env.DATABASE_URL);

describe("Financiamento fechado guarda a comissão da empresa (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const service = new FinancingDealsService(prisma);
  const tag = `findeal-${Date.now()}`;
  const ids = { admin: "", buyer: "", lead: "", leadNoAccount: "" };

  before(async () => {
    // Papel "buyer" de propósito: outros testes avisam todos os admins e a
    // notificação nova travaria a limpeza deste usuário.
    ids.admin = (await prisma.user.create({ data: { name: "Admin", email: `admin-${tag}@teste.local`, role: "buyer" } })).id;
    ids.buyer = (await prisma.user.create({ data: { name: "Bruna", email: `bruna-${tag}@teste.local`, role: "buyer" } })).id;
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
    await prisma.notification.deleteMany({ where: { userId: { in: [ids.admin, ids.buyer] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.admin, ids.buyer] } } });
    await prisma.$disconnect();
  });

  test("comissão inteira da empresa, sem cashback e sem aviso de cashback ao cliente", async () => {
    const deal = await service.registerDeal(ids.admin, {
      leadId: ids.lead,
      financingProvider: "Banco Teste",
      assetValue: 100000,
      financedAmount: 80000,
      commissionRate: 1,
    });
    const row = await prisma.financingDeal.findUniqueOrThrow({ where: { id: deal.id } });
    assert.equal(Number(row.commissionAmount), 800);
    assert.equal(Number(row.rebateAmount), 0, "nada é devolvido ao cliente");
    assert.equal(Number(row.rebatePercent), 0);
    assert.equal(row.buyerUserId, ids.buyer, "continua ligado à conta de quem contratou (pelo e-mail)");
    assert.equal(await prisma.notification.count({ where: { userId: ids.buyer } }), 0, "cliente não recebe aviso de cashback");

    const [listed] = (await service.listDeals("awaiting_commission")).filter((item) => item.id === deal.id);
    assert.equal(listed?.commissionAmount, 800);
    assert.equal(listed?.stage, "awaiting_commission");
    assert.ok(!/cashback/i.test(JSON.stringify(listed)));

    const received = await service.markCommissionReceived(deal.id);
    assert.equal(received.stage, "received");
    assert.ok(received.commissionReceivedAt);
    assert.equal(await prisma.notification.count({ where: { userId: ids.buyer } }), 0);
    await assert.rejects(service.markCommissionReceived(deal.id), /já foi marcada como recebida/);
    assert.ok((await service.listDeals("received")).some((item) => item.id === deal.id));

    // Comissão já recebida: o negócio entrou na receita e não pode sumir.
    await assert.rejects(service.deleteOpenDeal(deal.id), /comissão deste financiamento já foi recebida/);
  });

  test("negócio aguardando comissão pode ser desfeito (lead saiu de Concluído)", async () => {
    const deal = await service.registerDeal(ids.admin, {
      leadId: ids.leadNoAccount,
      financingProvider: "Credihome",
      assetValue: 500000,
      financedAmount: 400000,
      commissionRate: 1,
    });
    assert.equal((await prisma.financingDeal.findUniqueOrThrow({ where: { id: deal.id } })).buyerUserId, null);
    await service.deleteOpenDeal(deal.id);
    assert.equal(await prisma.financingDeal.findUnique({ where: { id: deal.id } }), null);
  });

  test("fechamento mensal traz a comissão da empresa, sem cashback nem CPF de cliente", async () => {
    const now = new Date(Date.now() - 3 * 3_600_000); // horário de Brasília
    const month = now.toISOString().slice(0, 7);
    const rows = await service.monthlyReport(month);
    const mine = rows.filter((row) => row.client === "Bruna");
    assert.ok(mine.length >= 1);
    assert.equal(mine[0]!.commissionAmount, 800);
    const keys = Object.keys(mine[0]!);
    assert.ok(!keys.some((key) => /cashback|cpf|net|paid/i.test(key)), keys.join(","));
    await assert.rejects(service.monthlyReport("2026-13x"), /Mês inválido/);
  });
});

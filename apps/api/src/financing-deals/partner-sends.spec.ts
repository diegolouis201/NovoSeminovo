import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { PrismaService } from "../prisma/prisma.service";
import { FinancingDealsService } from "./financing-deals.service";

// Envios aos parceiros de crédito da IBS (Creditas para veículo, Credihome
// para imóvel): quanto foi enviado no mês e o volume potencial (valor a
// financiar e comissão estimada). Serve para o Diego medir o potencial e para
// conferir com a IBS, pedido a pedido, pelo id do lead no parceiro.

const withDb = Boolean(process.env.DATABASE_URL);

describe("Envios aos parceiros de crédito (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const service = new FinancingDealsService(prisma);
  const tag = `envios-${Date.now()}`;
  const ids: string[] = [];
  // 15/03/2031 12:00 em Brasília — mês só deste teste.
  const inMonth = new Date(Date.UTC(2031, 2, 15, 15));
  const nextMonth = new Date(Date.UTC(2031, 3, 1, 4));

  before(async () => {
    const base = { channel: "web" as const, phone: "31900000000", email: `${tag}@teste.local` };
    const make = async (data: Record<string, unknown>) =>
      ids.push((await prisma.financingLead.create({ data: { ...base, ...data } as never })).id);
    await make({ name: "Carro Um", assetType: "vehicle", assetValue: 120000, downPayment: 20000, negotiatedValue: 100000, bank: "Creditas", creditasLeadId: `cr-${tag}-1`, creditasSentAt: inMonth, createdAt: inMonth });
    await make({ name: "Carro Dois", assetType: "vehicle", assetValue: 60000, downPayment: 10000, negotiatedValue: 50000, commissionRate: 2, bank: "Creditas", creditasLeadId: `cr-${tag}-2`, creditasSentAt: inMonth, createdAt: inMonth });
    await make({ name: "Casa Um", assetType: "property", assetValue: 500000, downPayment: 100000, negotiatedValue: 400000, bank: "Credihome", credihomeLeadId: `ch-${tag}-1`, credihomeSentAt: inMonth, credihomePhase: "analysis", createdAt: inMonth });
    // Pedido do mês que não foi ao parceiro (ficou só no quadro).
    await make({ name: "Não Foi", assetType: "vehicle", assetValue: 80000, downPayment: 0, createdAt: inMonth });
    // Enviado no mês seguinte: não entra.
    await make({ name: "Mês Seguinte", assetType: "vehicle", assetValue: 90000, negotiatedValue: 90000, creditasLeadId: `cr-${tag}-3`, creditasSentAt: nextMonth, createdAt: nextMonth });
  });

  after(async () => {
    await prisma.financingLead.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  test("totais por parceiro: quantidade, valor a financiar e comissão potencial", async () => {
    const report = await service.partnerSends("2031-03");
    assert.equal(report.month, "2031-03");
    assert.deepEqual(report.byPartner.Creditas, { count: 2, financingValue: 150000, potentialCommission: 2000 });
    assert.deepEqual(report.byPartner.Credihome, { count: 1, financingValue: 400000, potentialCommission: 4000 });
    assert.deepEqual(report.total, { count: 3, financingValue: 550000, potentialCommission: 6000 });
    assert.equal(report.notSent, 1);
  });

  test("uma linha por envio, com o id do lead no parceiro para conferir com a IBS, sem CPF", async () => {
    const report = await service.partnerSends("2031-03");
    assert.equal(report.rows.length, 3);
    const carro = report.rows.find((row) => row.partnerLeadId === `cr-${tag}-1`);
    assert.ok(carro);
    assert.equal(carro.partner, "Creditas");
    assert.equal(carro.client, "Carro Um");
    assert.equal(carro.assetType, "vehicle");
    assert.equal(carro.assetValue, 120000);
    assert.equal(carro.downPayment, 20000);
    assert.equal(carro.financingValue, 100000);
    assert.equal(carro.potentialCommission, 1000);
    const casa = report.rows.find((row) => row.partner === "Credihome");
    assert.equal(casa?.partnerPhase, "analysis");
    for (const row of report.rows) assert.ok(!Object.keys(row).some((key) => /cpf|birth|nasc/i.test(key)));
  });

  test("mês inválido é recusado", async () => {
    await assert.rejects(service.partnerSends("2031-13"), /Mês inválido/);
  });
});

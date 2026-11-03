import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildCrmRevenue, type RevenueInput } from "./crm-revenue";

// Receitas por categoria no CRM: planos (faturamento principal), lojas
// parceiras pelos links de afiliado (faturamento), financiamentos (só
// acompanhamento, fora do faturamento) e o programa de afiliados.

const hoje = new Date("2026-11-15T12:00:00Z");
const d = (iso: string) => new Date(`${iso}T12:00:00Z`);

const input: RevenueInput = {
  subscriptionPayments: [
    { paidAt: d("2026-11-02"), amount: 389, refundedAmount: 0 },
    { paidAt: d("2026-10-02"), amount: 389, refundedAmount: 89 },
    { paidAt: d("2026-10-10"), amount: 149, refundedAmount: 0 },
    { paidAt: d("2025-10-10"), amount: 999, refundedAmount: 0 },
  ],
  listingPlans: [
    { paidAt: d("2026-11-05"), amount: 29.9 },
    { paidAt: d("2026-09-05"), amount: 49.9 },
  ],
  mrr: 538,
  assinantes: 2,
  deals: [
    { createdAt: d("2026-11-03"), financedAmount: 80000, commissionAmount: 800, rebateAmount: 200, status: "registered", commissionReceivedAt: null },
    { createdAt: d("2026-10-03"), financedAmount: 50000, commissionAmount: 500, rebateAmount: 125, status: "paid", commissionReceivedAt: d("2026-10-20") },
    { createdAt: d("2025-01-03"), financedAmount: 10000, commissionAmount: 100, rebateAmount: 25, status: "paid", commissionReceivedAt: d("2025-02-01") },
  ],
  leadsAbertos: 4,
  storeEarnings: [
    { month: "2026-10", store: "amazon", amount: 120 },
    { month: "2026-10", store: "mercadolivre", amount: 30 },
    { month: "2026-11", store: "amazon", amount: 50 },
    { month: "2025-06", store: "amazon", amount: 999 },
  ],
  storeClicks30d: 42,
  affiliates: [
    { id: "a1", code: "ANA10", name: "Ana Influencer", status: "approved", referrals: 3, clicks30d: 120 },
    { id: "a2", code: "BETO", name: "Beto", status: "approved", referrals: 1, clicks30d: 5 },
    { id: "a3", code: "NOVO", name: "Novo", status: "pending", referrals: 0, clicks30d: 0 },
  ],
  commissions: [
    { affiliateId: "a1", baseAmount: 389, amount: 77.8, status: "paid", createdAt: d("2026-09-02") },
    { affiliateId: "a1", baseAmount: 389, amount: 77.8, status: "available", createdAt: d("2026-10-02") },
    { affiliateId: "a1", baseAmount: 389, amount: 77.8, status: "pending", createdAt: d("2026-11-02") },
    { affiliateId: "a2", baseAmount: 149, amount: 29.8, status: "canceled", createdAt: d("2026-10-10") },
  ],
};

describe("Receitas por categoria", () => {
  const r = buildCrmRevenue(input, hoje);

  test("planos: assinaturas + planos de anúncio, sem estornos, 12 meses", () => {
    assert.equal(r.planos.porMes.length, 12);
    assert.equal(r.planos.porMes[11].mes, "2026-11");
    const nov = r.planos.porMes[11];
    assert.deepEqual(nov, { mes: "2026-11", assinaturas: 389, anuncios: 29.9, total: 418.9 });
    const out = r.planos.porMes.find((m) => m.mes === "2026-10")!;
    assert.equal(out.assinaturas, 449, "389 - 89 de estorno + 149");
    assert.equal(r.planos.total12m, 917.8);
    assert.equal(r.planos.esteMes, 418.9);
    assert.equal(r.planos.mesPassado, 449);
    assert.equal(r.planos.estornos12m, 89);
    assert.equal(r.planos.mrr, 538);
  });

  test("consolidado = planos + lojas parceiras; financiamento fica de fora", () => {
    const out = r.consolidado.porMes.find((m) => m.mes === "2026-10")!;
    assert.deepEqual(out, { mes: "2026-10", planos: 449, lojas: 150, total: 599 });
    assert.equal(r.consolidado.esteMes, 468.9);
    assert.equal(r.consolidado.total12m, 1117.8);
  });

  test("financiamentos: comissão menos cashback, a receber e cashback a pagar", () => {
    const nov = r.financiamentos.porMes.find((m) => m.mes === "2026-11")!;
    assert.deepEqual(nov, { mes: "2026-11", negocios: 1, comissao: 800, cashback: 200, liquido: 600 });
    assert.equal(r.financiamentos.negocios12m, 2);
    assert.equal(r.financiamentos.valorFinanciado12m, 130000);
    assert.equal(r.financiamentos.liquido12m, 975);
    assert.equal(r.financiamentos.comissaoRecebida, 600, "todos os negócios com comissão recebida");
    assert.equal(r.financiamentos.comissaoAReceber, 800);
    assert.equal(r.financiamentos.cashbackAPagar, 200);
    assert.equal(r.financiamentos.leadsAbertos, 4);
  });

  test("lojas parceiras (links de afiliado): por mês e por loja", () => {
    assert.equal(r.afiliados.lojas.total12m, 200);
    assert.deepEqual(r.afiliados.lojas.porLoja, [
      { loja: "Amazon", valor12m: 170 },
      { loja: "Mercado Livre", valor12m: 30 },
    ]);
    assert.equal(r.afiliados.lojas.cliques30d, 42);
  });

  test("programa de afiliados: indicados, receita gerada e comissões por situação", () => {
    const p = r.afiliados.programa;
    assert.equal(p.ativos, 2);
    assert.equal(p.pendentes, 1);
    assert.equal(p.indicados, 4);
    assert.equal(p.cliques30d, 125);
    assert.equal(p.receitaGerada12m, 389 * 3, "comissão cancelada (estorno) não conta");
    assert.deepEqual(p.comissoes, { aConfirmar: 77.8, disponivel: 77.8, paga: 77.8, cancelada: 29.8 });
    assert.deepEqual(p.ranking[0], { codigo: "ANA10", nome: "Ana Influencer", indicados: 3, receitaGerada: 1167, comissao: 233.4 });
    assert.ok(!p.ranking.some((a) => a.codigo === "NOVO"), "sem indicação nem comissão não entra no ranking");
  });
});

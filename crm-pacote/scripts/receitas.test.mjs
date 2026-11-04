// Testes do relatório de receitas. Rodar: node --test scripts/receitas.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { brl, buildRevenueReport } from "./receitas-relatorio.mjs";

const months = (fill) => Array.from({ length: 12 }, (_, i) => fill(`2026-${String(i + 1).padStart(2, "0")}`.replace("2026-12", "2026-12")));
const receitas = {
  geradoEm: "2026-11-15T12:00:00Z",
  consolidado: { porMes: months((mes) => ({ mes, planos: 100, lojas: 10, financiamentos: 50, total: 100 })), total12m: 1200, esteMes: 100, mesPassado: 200, acompanhamento12m: { lojas: 200, financiamentos: 975 } },
  planos: { porMes: months((mes) => ({ mes, assinaturas: 90, anuncios: 10, total: 100 })), total12m: 1200, esteMes: 100, mesPassado: 200, estornos12m: 89, mrr: 538, assinantes: 2 },
  financiamentos: { porMes: [], negocios12m: 2, valorFinanciado12m: 130000, liquido12m: 975, comissaoRecebida: 600, comissaoAReceber: 800, cashbackAPagar: 200, leadsAbertos: 4 },
  afiliados: {
    lojas: { porMes: [], porLoja: [{ loja: "Amazon", valor12m: 170 }], total12m: 200, cliques30d: 42 },
    programa: { ativos: 2, pendentes: 1, indicados: 4, cliques30d: 125, receitaGerada12m: 1167, comissoes: { aConfirmar: 77.8, disponivel: 77.8, paga: 77.8, cancelada: 29.8 }, ranking: [{ codigo: "ANA10", nome: "Ana", indicados: 3, receitaGerada: 1167, comissao: 233.4 }] },
  },
};

test("valor em reais no padrão brasileiro", () => {
  assert.equal(brl(1234.5), "R$ 1.234,50");
  assert.equal(brl(0), "R$ 0,00");
});

test("faturamento é só planos; lojas parceiras e financiamentos aparecem como só visualização", () => {
  const md = buildRevenueReport(receitas);
  assert.match(md, /Faturamento do mês \(em andamento\): R\$ 100,00/);
  assert.match(md, /Faturamento 12 meses: R\$ 1\.200,00/);
  assert.match(md, /## Lojas parceiras \(links de afiliado\) — só visualização/);
  assert.match(md, /## Financiamentos — só visualização \(não entra no caixa nem no faturamento\)/);
  assert.match(md, /Líquido 12 meses: R\$ 975,00/);
  assert.match(md, /Amazon: R\$ 170,00/);
});

test("programa de afiliados como custo e pendências de dinheiro vão para o Diego decidir", () => {
  const md = buildRevenueReport(receitas);
  assert.match(md, /ANA10/);
  assert.match(md, /## Para o Diego decidir/);
  assert.match(md, /Comissões de afiliados liberadas para pagar: R\$ 77,80/);
  assert.match(md, /Cashback de financiamento a pagar: R\$ 200,00/);
  assert.match(md, /Comissão de financiamento a receber do banco: R\$ 800,00/);
});

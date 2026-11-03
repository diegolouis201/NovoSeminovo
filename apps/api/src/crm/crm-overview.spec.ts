import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { CrmOverviewQuerySchema } from "@novoseminovo/shared-types";
import { buildCrmOverview } from "./crm-overview";
import type { CrmEmpresa, CrmFeed, CrmProspeccao } from "./crm.service";

// Visão geral do CRM no admin: números da empresa toda calculados a partir do
// mesmo feed que o repositório do CRM usa (uma fonte só para os dois).

const hoje = new Date("2026-11-15T12:00:00Z");

function empresa(extra: Partial<CrmEmpresa>): CrmEmpresa {
  return {
    id: "p",
    nome: "Empresa",
    tipo: "Loja de veículos",
    segmento: "vehicle",
    cnpj: "11222333000181",
    pagina: "/empresa/p",
    cadastroNoSiteEm: "2026-08-01",
    periodoGratisAte: "2026-10-30",
    verificada: true,
    pais: "Brasil",
    perfil: {},
    responsavel: { nome: "Dono", email: "dono@teste.local" },
    uso: { visualizacoes: 0 },
    chamados: { total: 0, abertos: 0 },
    socios: [],
    etapa: { id: "cadastrou", nome: "Cadastrou (período grátis)" },
    pagamentos: { quantidade: 0, totalPago: 0 },
    anuncios: { noAr: 0, total: 0 },
    leads: { total: 0, ultimos30Dias: 0, vendidos: 0, paradosMais3Dias: 0 },
    ultimasAnotacoes: [],
    ...extra,
  };
}

function prospect(extra: Partial<CrmProspeccao>): CrmProspeccao {
  return { cardId: "c", nome: "Prospect", segmento: "vehicle", perfil: {}, etapa: { id: "a_abordar", nome: "A abordar" }, criadoEm: "2026-10-01T00:00:00Z", ...extra };
}

const feed: CrmFeed = {
  geradoEm: hoje.toISOString(),
  empresas: [
    empresa({
      id: "a",
      nome: "Loja A",
      cardId: "ca",
      vendedor: "Ana",
      etapa: { id: "assinante", nome: "Assinante" },
      plano: { nome: "Inicial", valorMensal: 149, status: "ativa", mudouEm: "2026-11-02T00:00:00Z", periodoAte: "2026-12-02" },
      pagamentos: { quantidade: 1, totalPago: 149, ticketMedio: 149, primeiro: "2026-11-02", ultimo: "2026-11-02" },
      origemMarketing: { canal: "google_ads", meio: "cpc" },
      nps: { nota: 10, data: "2026-11-05T00:00:00Z", classificacao: "promotor" },
      uso: { visualizacoes: 50, diasSemAcesso: 2 },
    }),
    empresa({
      id: "b",
      nome: "Imob B",
      cardId: "cb",
      segmento: "property",
      tipo: "Imobiliária",
      etapa: { id: "assinante", nome: "Assinante" },
      plano: { nome: "Pack 35", valorMensal: 389, status: "ativa", mudouEm: "2026-06-01T00:00:00Z", periodoAte: "2026-12-01" },
      pagamentos: { quantidade: 5, totalPago: 1945, ticketMedio: 389, primeiro: "2026-06-01", ultimo: "2026-11-01" },
      nps: { nota: 3, data: "2026-11-03T00:00:00Z", classificacao: "detrator", comentario: "Poucos leads" },
      uso: { visualizacoes: 10, diasSemAcesso: 40 },
      chamados: { total: 2, abertos: 1, abertoDesde: "2026-11-10T00:00:00Z", tempoMedioResolucaoHoras: 10 },
    }),
    empresa({
      id: "c",
      nome: "Loja C",
      cardId: "cc",
      vendedor: "Ana",
      etapa: { id: "cancelou", nome: "Cancelou" },
      plano: { nome: "Inicial", valorMensal: 149, status: "cancelada", mudouEm: "2026-11-08T00:00:00Z", periodoAte: "2026-11-08" },
      pagamentos: { quantidade: 2, totalPago: 298, ticketMedio: 149, primeiro: "2026-09-08", ultimo: "2026-10-08" },
      motivoPerda: { categoria: "Preço" },
      origemMarketing: { canal: "google_ads" },
      nps: { nota: 8, data: "2026-10-20T00:00:00Z", classificacao: "neutro" },
      chamados: { total: 1, abertos: 0, tempoMedioResolucaoHoras: 30 },
    }),
    empresa({ id: "d", nome: "Loja D", etapa: { id: "publicou", nome: "Publicou anúncio" }, plano: { nome: "Inicial", valorMensal: 149, status: "em_atraso", mudouEm: "2026-11-01T00:00:00Z", periodoAte: "2026-11-30" } }),
  ],
  prospeccao: [
    prospect({ cardId: "p1", nome: "Loja X", vendedor: "Ana" }),
    prospect({ cardId: "p2", nome: "Loja Y", vendedor: "Bruno", etapa: { id: "proposta", nome: "Proposta enviada" } }),
    prospect({ cardId: "p3", nome: "Imob Z", segmento: "property", etapa: { id: "perdida", nome: "Perdida" }, motivoPerda: { categoria: "Preço" } }),
    prospect({ cardId: "p4", nome: "Loja W", etapa: { id: "perdida", nome: "Perdida" }, motivoPerda: { categoria: "Prefere outro portal" } }),
  ],
};

const payments = [
  { paidAt: new Date("2026-06-01T10:00:00Z"), amount: 389, refundedAmount: 0 },
  { paidAt: new Date("2026-09-08T10:00:00Z"), amount: 149, refundedAmount: 0 },
  { paidAt: new Date("2026-10-08T10:00:00Z"), amount: 149, refundedAmount: 49 },
  { paidAt: new Date("2026-11-01T10:00:00Z"), amount: 389, refundedAmount: 0 },
  { paidAt: new Date("2026-11-02T10:00:00Z"), amount: 149, refundedAmount: 0 },
  { paidAt: new Date("2025-01-01T10:00:00Z"), amount: 999, refundedAmount: 0 },
];

describe("Visão geral do CRM", () => {
  const all = buildCrmOverview(feed, payments, hoje, "all");

  test("números principais: assinantes, mensalidades, novas e cancelamentos do mês", () => {
    assert.equal(all.numeros.empresas, 4);
    assert.equal(all.numeros.assinantes, 3, "ativa ou em atraso conta como assinante");
    assert.equal(all.numeros.mrr, 149 + 389 + 149);
    assert.equal(all.numeros.ticketMedio, 229);
    assert.equal(all.numeros.novasAssinaturasMes, 1, "primeiro pagamento neste mês");
    assert.equal(all.numeros.cancelamentosMes, 1);
    assert.equal(all.numeros.emRisco, 1, "assinante sem entrar no painel há 30+ dias");
    assert.equal(all.numeros.chamadosAbertos, 1);
    assert.equal(all.numeros.tempoMedioResolucaoHoras, 20);
  });

  test("NPS dos últimos 90 dias: % promotores menos % detratores", () => {
    assert.deepEqual(all.numeros.nps, { score: 0, respostas: 3, promotores: 1, neutros: 1, detratores: 1 });
  });

  test("funil na ordem das etapas, com prospecção e empresas do site", () => {
    const qty = Object.fromEntries(all.funil.map((f) => [f.etapa, f.quantidade]));
    assert.equal(all.funil[0].etapa, "a_abordar");
    assert.deepEqual(qty, { a_abordar: 1, em_contato: 0, interessada: 0, proposta: 1, cadastrou: 0, publicou: 1, assinante: 2, perdida: 2, cancelou: 1 });
  });

  test("receita recebida nos últimos 12 meses, já sem estornos", () => {
    assert.equal(all.receitaPorMes.length, 12);
    assert.equal(all.receitaPorMes[11].mes, "2026-11");
    assert.equal(all.receitaPorMes[0].mes, "2025-12");
    const byMonth = Object.fromEntries(all.receitaPorMes.map((m) => [m.mes, m.valor]));
    assert.equal(byMonth["2026-11"], 538);
    assert.equal(byMonth["2026-10"], 100);
    assert.equal(byMonth["2026-07"], 0);
  });

  test("motivos de perda e cancelamento somados por categoria", () => {
    assert.deepEqual(all.motivos, [
      { categoria: "Preço", quantidade: 2 },
      { categoria: "Prefere outro portal", quantidade: 1 },
    ]);
  });

  test("origem dos cadastros e desempenho por vendedor", () => {
    assert.deepEqual(all.origem, [
      { canal: "google_ads", quantidade: 2 },
      { canal: "Direto / sem origem", quantidade: 2 },
    ]);
    const ana = all.vendedores.find((v) => v.nome === "Ana");
    assert.deepEqual(ana, { nome: "Ana", cards: 3, cadastradas: 2, assinantes: 1, mrr: 149 });
    assert.ok(all.vendedores.some((v) => v.nome === "Sem dono"));
  });

  test("lista de atenção: atraso, detrator, chamado parado e risco, urgentes primeiro", () => {
    const motivos = all.atencao.map((a) => `${a.empresa}: ${a.motivo}`);
    assert.ok(motivos.some((m) => /Loja D: pagamento atrasado/i.test(m)));
    assert.ok(motivos.some((m) => /Imob B: nota 3 no NPS/i.test(m)));
    assert.ok(motivos.some((m) => /Imob B: chamado aberto/i.test(m)));
    assert.ok(motivos.some((m) => /Imob B: .*40 dias/i.test(m)));
    assert.equal(all.atencao[0].nivel, "urgente");
    assert.equal(all.atencao.find((a) => a.empresa === "Imob B")?.cardId, "cb");
  });

  test("recorte por segmento: só imóveis", () => {
    const prop = buildCrmOverview(feed, payments, hoje, "property");
    assert.equal(prop.recorte, "property");
    assert.equal(prop.numeros.empresas, 1);
    assert.equal(prop.numeros.mrr, 389);
    assert.equal(prop.funil.find((f) => f.etapa === "perdida")?.quantidade, 1);
  });

  test("query do recorte só aceita valores conhecidos", () => {
    assert.equal(CrmOverviewQuerySchema.parse({}).tipo, "all");
    assert.equal(CrmOverviewQuerySchema.safeParse({ tipo: "x'; drop" }).success, false);
  });
});

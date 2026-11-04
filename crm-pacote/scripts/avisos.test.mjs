// Testes das regras de avisos. Rodar: node --test scripts/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAlerts } from "./avisos-regras.mjs";
import { csvCell, nextFromDdMm, sectorDate } from "./lib.mjs";

const hoje = new Date(Date.UTC(2026, 10, 3)); // 03/11/2026

const empresa = (extra) => ({
  id: "p1",
  nome: "Loja Exemplo",
  segmento: "vehicle",
  cidade: "Belo Horizonte",
  cadastroNoSiteEm: "2026-09-01",
  periodoGratisAte: "2026-11-30",
  socios: [],
  etapa: { id: "publicou", nome: "Publicou anúncio" },
  pagamentos: { quantidade: 0, totalPago: 0 },
  anuncios: { noAr: 5, total: 5 },
  leads: { total: 0, ultimos30Dias: 0, vendidos: 0, paradosMais3Dias: 0 },
  ultimasAnotacoes: [],
  cardId: "c1",
  ...extra,
});

test("datas do setor: fixa, n-ésimo domingo e última sexta", () => {
  assert.equal(sectorDate("27/08", 2026).toISOString().slice(0, 10), "2026-08-27");
  assert.equal(sectorDate("2o domingo de maio", 2026).toISOString().slice(0, 10), "2026-05-10");
  assert.equal(sectorDate("ultima sexta de novembro", 2026).toISOString().slice(0, 10), "2026-11-27");
});

test("aniversário DD/MM: próxima ocorrência e data inválida", () => {
  assert.equal(nextFromDdMm("05/11", hoje).toISOString().slice(0, 10), "2026-11-05");
  assert.equal(nextFromDdMm("01/01", hoje).toISOString().slice(0, 10), "2027-01-01");
  assert.equal(nextFromDdMm("xx", hoje), undefined);
});

test("planilha neutraliza fórmula", () => {
  assert.equal(csvCell("=HYPERLINK(1)"), `"'=HYPERLINK(1)"`);
  assert.equal(csvCell('Loja "A"'), `"Loja ""A"""`);
});

test("período grátis acabando com anúncio no ar: urgente com ordem para o Comercial", () => {
  const alerts = buildAlerts({ empresas: [empresa({ periodoGratisAte: "2026-11-10" })], prospeccao: [] }, {}, [], hoje);
  const alert = alerts.find((a) => a.tipo === "fim_periodo_gratis");
  assert.equal(alert?.nivel, "urgente");
  assert.match(alert.texto, /7 dia/);
  assert.equal(alert.ordem?.area, "comercial");
});

test("pagamento atrasado e cancelamento recente são urgentes", () => {
  const atrasada = empresa({ id: "p2", etapa: { id: "assinante" }, plano: { nome: "Inicial", valorMensal: 149, status: "em_atraso", mudouEm: "2026-11-01T00:00:00Z" } });
  const cancelou = empresa({ id: "p3", etapa: { id: "cancelou" }, plano: { nome: "Inicial", valorMensal: 149, status: "cancelada", mudouEm: "2026-11-01T00:00:00Z" } });
  const tipos = buildAlerts({ empresas: [atrasada, cancelou], prospeccao: [] }, {}, [], hoje).map((a) => `${a.nivel}:${a.tipo}`);
  assert.ok(tipos.includes("urgente:pagamento_atrasado"));
  assert.ok(tipos.includes("urgente:cancelou"));
});

test("aniversários: empresa, parceria e sócio na semana", () => {
  const e = empresa({ abertaEm: "2015-11-06", cadastroNoSiteEm: "2025-11-08", socios: [{ nome: "Maria", aniversario: "04/11" }] });
  const alerts = buildAlerts({ empresas: [e], prospeccao: [] }, {}, [], hoje);
  assert.match(alerts.find((a) => a.tipo === "aniversario_empresa")?.texto ?? "", /11 anos/);
  assert.match(alerts.find((a) => a.tipo === "aniversario_parceria")?.texto ?? "", /1 ano/);
  assert.match(alerts.find((a) => a.tipo === "aniversario_socio")?.texto ?? "", /Maria/);
});

test("quem pediu para não ser contatado não entra em oportunidade de marketing", () => {
  const e = empresa({ abertaEm: "2015-11-06" });
  const alerts = buildAlerts({ empresas: [e], prospeccao: [] }, { p1: { naoContatar: true } }, [], hoje);
  assert.equal(alerts.some((a) => a.tipo === "aniversario_empresa"), false);
});

test("data do setor próxima com público certo", () => {
  const calendar = [{ data: "10/11", nome: "Data teste", publico: "vehicle", ideia: "Ideia" }];
  const alerts = buildAlerts({ empresas: [empresa({ etapa: { id: "assinante" } })], prospeccao: [] }, {}, calendar, hoje);
  const alert = alerts.find((a) => a.tipo === "data_do_setor");
  assert.match(alert?.texto ?? "", /Data teste/);
  assert.equal(alert?.ordem?.area, "marketing");
});

test("empresa importante aparece primeiro e prospecção com contato vencido é lembrada", () => {
  const a = empresa({ id: "a", nome: "A", periodoGratisAte: "2026-11-10" });
  const b = empresa({ id: "b", nome: "B", periodoGratisAte: "2026-11-10" });
  const prospeccao = [{ cardId: "x", nome: "Imob X", etapa: { id: "em_contato" }, proximoContato: "2026-11-01T13:00:00Z", vendedor: "Ana" }];
  const alerts = buildAlerts({ empresas: [a, b], prospeccao }, { b: { importante: true } }, [], hoje);
  assert.equal(alerts[0].empresa, "B");
  assert.ok(alerts.some((x) => x.tipo === "contato_vencido" && /Imob X/.test(x.texto)));
});

test("NPS: detrator recente é urgente; promotor vira pedido de indicação", () => {
  const detrator = empresa({ id: "d", nome: "D", nps: { nota: 3, data: "2026-10-30T12:00:00Z", classificacao: "detrator", comentario: "Poucos leads" } });
  const promotor = empresa({ id: "p", nome: "P", nps: { nota: 10, data: "2026-10-30T12:00:00Z", classificacao: "promotor" } });
  const alerts = buildAlerts({ empresas: [detrator, promotor], prospeccao: [] }, {}, [], hoje);
  assert.equal(alerts.find((a) => a.tipo === "nps_detrator")?.nivel, "urgente");
  assert.equal(alerts.find((a) => a.tipo === "nps_promotor")?.nivel, "oportunidade");
});

test("chamado aberto há mais de 2 dias e assinante sem acesso há 30 dias", () => {
  const e = empresa({
    etapa: { id: "assinante" },
    plano: { nome: "Inicial", valorMensal: 149, status: "ativa", mudouEm: "2026-09-01T00:00:00Z" },
    chamados: { total: 1, abertos: 1, abertoDesde: "2026-10-29T12:00:00Z" },
    uso: { diasSemAcesso: 35, visualizacoes: 10 },
  });
  const tipos = buildAlerts({ empresas: [e], prospeccao: [] }, {}, [], hoje).map((a) => `${a.nivel}:${a.tipo}`);
  assert.ok(tipos.includes("urgente:chamado_parado"));
  assert.ok(tipos.includes("urgente:risco_cancelamento"));
});

test("boas-vindas nas redes: assinou + logo + autorizou → ordem ao Marketing com as @ e a legenda", () => {
  const e = empresa({
    id: "bv",
    nome: "Loja Nova",
    pagina: "/lojas/loja-nova",
    etapa: { id: "assinante" },
    plano: { nome: "Inicial", valorMensal: 149, status: "ativa", mudouEm: "2026-11-01T00:00:00Z" },
    logo: "/uploads/logo-loja-nova.webp",
    redesSociais: { instagram: "loja.nova", facebook: "LojaNova" },
    autorizaDivulgacaoEm: "2026-11-02T10:00:00Z",
  });
  const alert = buildAlerts({ empresas: [e], prospeccao: [] }, {}, [], hoje, [], { apiBase: "https://api.exemplo" }).find((a) => a.tipo === "boas_vindas_redes");
  assert.equal(alert?.nivel, "oportunidade");
  assert.equal(alert.ordem.area, "marketing");
  assert.equal(alert.ordem.titulo, "Post de boas-vindas: Loja Nova");
  assert.match(alert.ordem.detalhes, /@loja\.nova/);
  assert.match(alert.ordem.detalhes, /facebook\.com\/LojaNova/);
  assert.match(alert.ordem.detalhes, /https:\/\/api\.exemplo\/uploads\/logo-loja-nova\.webp/);
  assert.match(alert.ordem.detalhes, /prévia ao Diego/);
});

test("boas-vindas: não repete depois da ordem, nem para quem pediu para não ser contatado", () => {
  const e = empresa({
    id: "bv",
    nome: "Loja Nova",
    etapa: { id: "assinante" },
    plano: { nome: "Inicial", valorMensal: 149, status: "ativa", mudouEm: "2026-11-01T00:00:00Z" },
    logo: "/uploads/x.webp",
    redesSociais: { instagram: "loja.nova" },
    autorizaDivulgacaoEm: "2026-11-02T10:00:00Z",
  });
  const ordens = [{ empresaId: "bv", titulo: "Post de boas-vindas: Loja Nova", status: "aberta" }];
  assert.equal(buildAlerts({ empresas: [e], prospeccao: [] }, {}, [], hoje, ordens).some((a) => a.tipo.startsWith("boas_vindas")), false);
  assert.equal(buildAlerts({ empresas: [e], prospeccao: [] }, { bv: { naoContatar: true } }, [], hoje, []).some((a) => a.tipo.startsWith("boas_vindas")), false);
  const cancelada = [{ ...ordens[0], status: "cancelada" }];
  assert.ok(buildAlerts({ empresas: [e], prospeccao: [] }, {}, [], hoje, cancelada).some((a) => a.tipo === "boas_vindas_redes"), "ordem cancelada não conta");
});

test("boas-vindas pendente: assinante sem logo, @ ou autorização → Comercial pede o que falta", () => {
  const e = empresa({
    id: "bp",
    nome: "Loja Sem Logo",
    etapa: { id: "assinante" },
    plano: { nome: "Inicial", valorMensal: 149, status: "ativa", mudouEm: "2026-11-01T00:00:00Z" },
    redesSociais: { instagram: "loja.semlogo" },
  });
  const alert = buildAlerts({ empresas: [e], prospeccao: [] }, {}, [], hoje, []).find((a) => a.tipo === "boas_vindas_pendente");
  assert.equal(alert?.nivel, "acompanhar");
  assert.equal(alert.ordem.area, "comercial");
  assert.match(alert.texto, /logo/);
  assert.match(alert.texto, /autorização/);
  assert.doesNotMatch(alert.texto, /Instagram ou Facebook/, "o @ já foi informado");
});

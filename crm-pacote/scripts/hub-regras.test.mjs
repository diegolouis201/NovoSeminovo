// Testes das regras do NovoSeminovo Hub: régua de relacionamento, meta do mês
// com ritmo, empresas sem próximo passo e NPS pendente.
// Rodar: node --test scripts/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { npsPendentes, regua, ritmoMeta, semProximoPasso } from "./hub-regras.mjs";

const hoje = new Date("2026-11-05T12:00:00Z");
const empresa = (over) => ({
  id: "p1",
  cardId: "c1",
  nome: "Loja A",
  cadastroNoSiteEm: "2026-09-01T10:00:00Z",
  etapa: { id: "assinante", nome: "Assinante" },
  plano: { nome: "Profissional", valorMensal: 199, status: "ativa" },
  ...over,
});

test("régua: assinante a cada 30 dias, período grátis a cada 15; atrasado, vencendo e em dia", () => {
  const feed = {
    empresas: [
      empresa({ id: "a", nome: "Atrasada", ultimoContato: { data: "2026-09-20T10:00:00Z", tipo: "ligacao" } }),
      empresa({ id: "b", nome: "Vencendo", ultimoContato: { data: "2026-10-10T10:00:00Z", tipo: "whatsapp" } }),
      empresa({ id: "c", nome: "Em dia", ultimoContato: { data: "2026-11-01T10:00:00Z", tipo: "reuniao" } }),
      empresa({ id: "d", nome: "Grátis", plano: undefined, etapa: { id: "publicou" }, cadastroNoSiteEm: "2026-10-30T10:00:00Z" }),
      empresa({ id: "e", nome: "Cancelou", plano: { nome: "X", valorMensal: 99, status: "cancelada" }, etapa: { id: "cancelou" } }),
      empresa({ id: "f", nome: "Não contatar" }),
    ],
  };
  const r = regua(feed, hoje, { f: { naoContatar: true } });
  const by = Object.fromEntries(r.map((x) => [x.nome, x]));
  assert.deepEqual(Object.keys(by).sort(), ["Atrasada", "Em dia", "Grátis", "Vencendo"], "cancelada e não contatar ficam fora");
  assert.equal(by["Atrasada"].situacao, "atrasado");
  assert.equal(by["Atrasada"].vence, "2026-10-20");
  assert.equal(by["Atrasada"].dias, -16);
  assert.equal(by["Vencendo"].situacao, "vencendo");
  assert.equal(by["Vencendo"].dias, 4);
  assert.equal(by["Em dia"].situacao, "em_dia");
  assert.equal(by["Grátis"].ciclo, 15);
  assert.equal(by["Grátis"].ultimo, undefined, "nunca teve contato: conta a partir do cadastro");
  assert.equal(by["Grátis"].vence, "2026-11-14");
  assert.equal(r[0].nome, "Atrasada", "mais atrasada primeiro");
  assert.ok(by["Atrasada"].progresso > 1 && by["Em dia"].progresso < 0.5);
});

test("meta do mês: ritmo para hoje, quanto falta e se está abaixo do ritmo", () => {
  const m = ritmoMeta({ newSubscriptions: 30, revenue: 6000 }, { assinaturas: 2, faturamento: 900 }, hoje);
  assert.equal(m.assinaturas.ritmoHoje, 5, "dia 5 de 30 dias: 1/6 da meta");
  assert.equal(m.assinaturas.falta, 28);
  assert.equal(m.assinaturas.situacao, "abaixo");
  assert.equal(m.faturamento.ritmoHoje, 1000);
  assert.equal(m.faturamento.situacao, "abaixo");
  assert.equal(ritmoMeta({ newSubscriptions: 30, revenue: 0 }, { assinaturas: 6, faturamento: 0 }, hoje).assinaturas.situacao, "acima");
  assert.equal(ritmoMeta(null, { assinaturas: 1, faturamento: 0 }, hoje), null, "sem meta definida");
});

test("sem próximo passo: em negociação sem contato marcado e sem tarefa aberta", () => {
  const feed = {
    empresas: [empresa({ id: "x", cardId: "cx", nome: "Publicou sem passo", plano: undefined, etapa: { id: "publicou" } })],
    prospeccao: [
      { cardId: "p1", nome: "Interessada sem passo", etapa: { id: "interessada" }, ultimoContato: { data: "2026-10-25T10:00:00Z", tipo: "ligacao" } },
      { cardId: "p2", nome: "Com contato marcado", etapa: { id: "proposta" }, proximoContato: "2026-11-07T13:00:00Z" },
      { cardId: "p3", nome: "Com tarefa", etapa: { id: "em_contato" } },
      { cardId: "p4", nome: "Contato vencido", etapa: { id: "em_contato" }, proximoContato: "2026-11-01T13:00:00Z" },
      { cardId: "p5", nome: "A abordar", etapa: { id: "a_abordar" } },
      { cardId: "p6", nome: "Perdida", etapa: { id: "perdida" } },
    ],
  };
  const tarefas = [{ id: "t1", empresa: { id: "p3" } }];
  const r = semProximoPasso(feed, tarefas, hoje, { p4: {} });
  assert.deepEqual(r.map((x) => x.nome).sort(), ["Contato vencido", "Interessada sem passo", "Publicou sem passo"]);
  assert.equal(r.find((x) => x.nome === "Interessada sem passo").diasSemContato, 11);
  assert.equal(r.find((x) => x.nome === "Publicou sem passo").cardId, "cx");
});

test("NPS pendente: cadastrada há 30+ dias sem resposta nos últimos 180 dias", () => {
  const feed = {
    empresas: [
      empresa({ id: "n1", nome: "Nunca respondeu" }),
      empresa({ id: "n2", nome: "Respondeu faz tempo", nps: { nota: 9, data: "2026-03-01T10:00:00Z" } }),
      empresa({ id: "n3", nome: "Respondeu agora", nps: { nota: 8, data: "2026-10-01T10:00:00Z" } }),
      empresa({ id: "n4", nome: "Nova", cadastroNoSiteEm: "2026-10-20T10:00:00Z" }),
      empresa({ id: "n5", nome: "Não contatar" }),
    ],
  };
  const r = npsPendentes(feed, hoje, { n5: { naoContatar: true } });
  assert.deepEqual(r.map((x) => x.nome), ["Nunca respondeu", "Respondeu faz tempo"]);
  assert.equal(r[0].ultimaResposta, undefined);
});

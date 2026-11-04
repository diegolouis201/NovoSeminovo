// Testes da higiene de dados. Rodar: node --test scripts/higiene.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkHygiene } from "./higiene-regras.mjs";

const hoje = new Date(Date.UTC(2026, 10, 3));
const base = (extra) => ({
  id: "e1",
  nome: "Loja A",
  cnpj: "11222333000181",
  cidade: "BH",
  setor: "Comércio de veículos",
  abertaEm: "2015-01-01",
  responsavel: { nome: "Ana", email: "ana@loja.com.br", telefone: "31999990000" },
  socios: [{ nome: "Ana" }],
  ultimasAnotacoes: [],
  ...extra,
});

test("aponta dado faltando, e-mail inválido e Receita pendente", () => {
  const problemas = checkHygiene(
    { empresas: [base({ cidade: undefined, setor: undefined, abertaEm: undefined, responsavel: { nome: "Ana", email: "ana@", telefone: undefined } })], prospeccao: [] },
    {},
    hoje,
  ).map((p) => p.tipo);
  assert.ok(problemas.includes("sem_cidade"));
  assert.ok(problemas.includes("sem_telefone"));
  assert.ok(problemas.includes("email_invalido"));
  assert.ok(problemas.includes("receita_pendente"));
});

test("duplicados por CNPJ ou telefone entre empresas e prospecção", () => {
  const feed = {
    empresas: [base({})],
    prospeccao: [{ cardId: "c9", nome: "Loja A (cadastro manual)", telefone: "(31) 99999-0000", etapa: { id: "a_abordar" }, criadoEm: "2026-10-01T00:00:00Z" }],
  };
  const dup = checkHygiene(feed, {}, hoje).find((p) => p.tipo === "duplicado");
  assert.ok(dup);
  assert.match(dup.texto, /Loja A/);
});

test("card esquecido, sem dono e marcação órfã", () => {
  const feed = {
    empresas: [],
    prospeccao: [{ cardId: "c1", nome: "Imob Velha", telefone: "31988887777", etapa: { id: "a_abordar" }, criadoEm: "2026-08-01T00:00:00Z" }],
  };
  const tipos = checkHygiene(feed, { sumiu: { nome: "Empresa que saiu" } }, hoje).map((p) => p.tipo);
  assert.ok(tipos.includes("card_esquecido"));
  assert.ok(tipos.includes("sem_dono"));
  assert.ok(tipos.includes("marcacao_orfa"));
});

test("base limpa não gera problema", () => {
  assert.deepEqual(checkHygiene({ empresas: [base({ vendedor: "Ana" })], prospeccao: [] }, {}, hoje), []);
});

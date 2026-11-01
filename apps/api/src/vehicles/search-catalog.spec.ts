import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mergeBrandNames, mergeModelNames } from "./search-catalog";

// Filtro de marca e modelo da busca de carros: todas as marcas da FIPE mais
// as que já têm anúncio (funciona mesmo com a FIPE fora do ar), sem repetir
// a mesma marca com dois nomes (VW e Volkswagen).
describe("Catálogo da busca: marcas", () => {
  test("junta FIPE e anúncios em ordem alfabética, sem repetir", () => {
    assert.deepEqual(mergeBrandNames(["Toyota", "Fiat", "Volkswagen"], ["Fiat", "Honda"]), ["Fiat", "Honda", "Toyota", "Volkswagen"]);
  });

  test("VW e Volkswagen, GM e Chevrolet viram uma marca só (fica o nome da FIPE)", () => {
    assert.deepEqual(mergeBrandNames(["Volkswagen", "Chevrolet"], ["VW", "GM"]), ["Chevrolet", "Volkswagen"]);
  });

  test("FIPE fora do ar: ficam as marcas dos anúncios", () => {
    assert.deepEqual(mergeBrandNames([], ["Toyota", "Jeep"]), ["Jeep", "Toyota"]);
  });
});

describe("Catálogo da busca: modelos", () => {
  test("junta FIPE e anúncios sem diferenciar maiúscula e acento", () => {
    assert.deepEqual(mergeModelNames(["Corolla", "Hilux", "Yaris"], ["COROLLA", "Etios"]), ["Corolla", "Etios", "Hilux", "Yaris"]);
  });

  test("nome vazio é ignorado", () => {
    assert.deepEqual(mergeModelNames(["", " "], ["Compass"]), ["Compass"]);
  });
});

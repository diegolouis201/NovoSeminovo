import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSearchQuery } from "./listings.service";

// "?state[x]=1" ou "?city[]=a" chegam como objeto/lista: viram texto vazio
// em vez de derrubar a busca com erro 500.
describe("Busca: parâmetros malformados", () => {
  test("objeto e lista em campo de texto são descartados", () => {
    const query = normalizeSearchQuery({ state: { x: "1" }, city: ["a", "b"], q: "Corolla", priceMin: { $gt: "" } } as never);
    assert.equal(query.state, undefined);
    assert.equal(query.city, undefined);
    assert.equal(query.priceMin, undefined);
    assert.equal(query.q, "Corolla");
  });

  test("listas que aceitam vários valores continuam funcionando", () => {
    const query = normalizeSearchQuery({ features: ["air_conditioning", "multimedia"], conditions: "single_owner" } as never);
    assert.deepEqual(query.features, ["air_conditioning", "multimedia"]);
    assert.equal(query.conditions, "single_owner");
  });

  test("texto muito longo é cortado", () => {
    assert.equal(normalizeSearchQuery({ q: "x".repeat(500) } as never).q?.length, 200);
  });
});

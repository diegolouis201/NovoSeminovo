import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mostrarFormularioCreditas } from "@novoseminovo/shared-types";

// Quem vê o formulário da Creditas no anúncio de carro. Enquanto o termo
// BACEN não é liberado (advogado + Creditas), só administrador vê — para o
// Diego testar no site de verdade sem o cliente ver.
describe("formulário da Creditas no anúncio", () => {
  test("padrão (sem configurar): só administrador vê", () => {
    assert.equal(mostrarFormularioCreditas(undefined, "admin"), true);
    assert.equal(mostrarFormularioCreditas(undefined, "buyer"), false);
    assert.equal(mostrarFormularioCreditas(undefined, undefined), false);
    assert.equal(mostrarFormularioCreditas("admin", "admin"), true);
    assert.equal(mostrarFormularioCreditas("admin", "partner"), false);
  });

  test("1 liga para todos; 0 desliga até para administrador", () => {
    assert.equal(mostrarFormularioCreditas("1", undefined), true);
    assert.equal(mostrarFormularioCreditas("1", "buyer"), true);
    assert.equal(mostrarFormularioCreditas("0", "admin"), false);
  });
});

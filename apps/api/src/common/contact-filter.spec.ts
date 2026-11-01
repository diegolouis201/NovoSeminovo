import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { assertNoContactInfo, scrubContactInline, stripContactInfo } from "./contact-filter";

// Contato (telefone, e-mail, link, @) não entra em anúncio: vale para quem
// digita, para o que vem do CRM e para as legendas das fotos.

describe("Filtro de contato", () => {
  test("texto do CRM: linhas com contato saem, o resto fica", () => {
    const text = "Apartamento reformado.\nLigue 31 99999-8888 ou acesse www.golpe.shop\n2 quartos, 1 vaga.";
    assert.equal(stripContactInfo(text), "Apartamento reformado.\n2 quartos, 1 vaga.");
  });

  test("título do CRM: tira só o contato e mantém o título", () => {
    assert.equal(scrubContactInline("Casa 3 quartos - WhatsApp 31 99999-8888"), "Casa 3 quartos");
    assert.equal(scrubContactInline("Apto Savassi | contato@imob.com.br"), "Apto Savassi");
    assert.equal(scrubContactInline("Corolla XEi 2020"), "Corolla XEi 2020");
  });

  test("legenda de foto com contato é recusada com mensagem clara", () => {
    assert.throws(() => assertNoContactInfo("Chama no zap 31999998888", "na legenda da foto"), /telefone na legenda da foto/);
    assert.doesNotThrow(() => assertNoContactInfo("Sala com vista para a serra", "na legenda da foto"));
  });
});

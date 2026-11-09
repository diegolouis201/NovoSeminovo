import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { CONSENTIMENTO_CREDITO } from "@novoseminovo/shared-types";

// Autorização que o cliente marca antes de os dados irem para o crédito.
// Exigência dos contratos da IBS (Creditas 3.1(v) e 7.8; Loft 1.6): o cliente
// sabe para quem vão os dados, com quem podem ser compartilhados, e que pode
// retirar a autorização. A versão vai junto com cada pedido, como prova.

describe("texto de consentimento do crédito", () => {
  test("imóvel: dados vão para a IBS, que compartilha com a Loft/Credihome", () => {
    const t = CONSENTIMENTO_CREDITO.imovel;
    assert.match(t, /IBS Capital Corretora de Seguros Ltda/);
    assert.match(t, /61\.452\.517\/0001-06/);
    assert.match(t, /Loft\/Credihome/);
    assert.match(t, /outras instituições financeiras, fintechs e parceiros/);
    assert.match(t, /não é instituição financeira/);
    assert.match(t, /aprovação depende de análise/);
    assert.match(t, /retirar esta autorização/);
  });

  test("veículo: mesmo texto, com a Creditas", () => {
    const t = CONSENTIMENTO_CREDITO.veiculo;
    assert.match(t, /IBS Capital Corretora de Seguros Ltda/);
    assert.match(t, /Creditas/);
    assert.doesNotMatch(t, /Credihome/);
    assert.match(t, /retirar esta autorização/);
  });

  test("tem versão com data, para guardar junto do aceite", () => {
    assert.match(CONSENTIMENTO_CREDITO.versao, /^\d{4}-\d{2}-\d{2}$/);
  });
});

import { createHash } from "node:crypto";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  CONSENTIMENTO_CREDITO,
  CONSENTIMENTO_CREDITO_HISTORICO,
  CredihomeProposalInputSchema,
  CreditasProposalInputSchema,
  LINK_POLITICA_PRIVACIDADE,
  SendToCredihomeInputSchema,
  textoConsentimentoCredito,
} from "@novoseminovo/shared-types";

// Autorização que o cliente marca antes de os dados irem para o crédito.
// Desde o parecer jurídico LGPD de 17/11/2026 (item 3.1), os textos são os do
// advogado, palavra por palavra, um por modalidade, cada um com a sua versão.
// Todas as versões ficam no código para sempre: o registro de cada aceite
// guarda a versão, e o texto exato daquela versão precisa continuar
// recuperável (item 2.1.4 ii do parecer).

const IMOVEL =
  "Autorizo o NovoSeminovo a encaminhar meus dados cadastrais e de simulação à IBS Capital Corretora de Seguros Ltda. (CNPJ 61.452.517/0001-06), empresa parceira responsável pelo atendimento de crédito e pela intermediação da solicitação de crédito, e autorizo a IBS a compartilhá-los com a Loft/Credihome e instituições financeiras parceiras para realização da simulação solicitada, análise da possibilidade de concessão de crédito e contato relacionado ao atendimento da solicitação. Declaro ciência de que posso revogar este consentimento a qualquer momento. Política de Privacidade";
const VEICULO =
  "Autorizo o NovoSeminovo a encaminhar meus dados cadastrais e do veículo à IBS Capital Corretora de Seguros Ltda. (CNPJ 61.452.517/0001-06), parceira responsável pelo atendimento de crédito, e autorizo a IBS a compartilhá-los com a Creditas e financeiras parceiras para fins de simulação, análise de crédito e propostas. Declaro ciência de que posso revogar este consentimento a qualquer momento. Política de Privacidade";

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

describe("texto de consentimento do crédito (parecer jurídico LGPD de 17/11/2026)", () => {
  test("imóvel: texto do parecer, palavra por palavra, com versão própria", () => {
    assert.equal(CONSENTIMENTO_CREDITO.imovel.texto, IMOVEL);
    assert.equal(CONSENTIMENTO_CREDITO.imovel.versao, "2026-11-17-parecer-imovel");
    assert.equal(CONSENTIMENTO_CREDITO.imovel.modalidade, "imovel");
    assert.equal(CONSENTIMENTO_CREDITO.imovel.produto, "credihome");
  });

  test("veículo: texto do parecer, palavra por palavra, com versão própria", () => {
    assert.equal(CONSENTIMENTO_CREDITO.veiculo.texto, VEICULO);
    assert.equal(CONSENTIMENTO_CREDITO.veiculo.versao, "2026-11-17-parecer-veiculo");
    assert.equal(CONSENTIMENTO_CREDITO.veiculo.modalidade, "veiculo");
    assert.equal(CONSENTIMENTO_CREDITO.veiculo.produto, "creditas");
  });

  test("os dois textos terminam no link da Política de Privacidade (/privacidade)", () => {
    assert.deepEqual(LINK_POLITICA_PRIVACIDADE, { texto: "Política de Privacidade", href: "/privacidade" });
    for (const atual of [CONSENTIMENTO_CREDITO.imovel, CONSENTIMENTO_CREDITO.veiculo]) {
      assert.ok(atual.texto.endsWith(` ${LINK_POLITICA_PRIVACIDADE.texto}`));
    }
  });

  test("toda versão continua recuperável, inclusive a anterior ao parecer, sem edição", () => {
    assert.equal(textoConsentimentoCredito("2026-11-17-parecer-imovel", "imovel"), IMOVEL);
    assert.equal(textoConsentimentoCredito("2026-11-17-parecer-veiculo", "veiculo"), VEICULO);
    // Versão de 09/11/2026 (antes do parecer): o texto não pode mudar nunca.
    // O hash prende o texto: mexeu nele, este teste falha.
    const antigoImovel = textoConsentimentoCredito("2026-11-09", "imovel");
    const antigoVeiculo = textoConsentimentoCredito("2026-11-09", "veiculo");
    assert.equal(sha256(antigoImovel ?? ""), "b3c613192ee85f04e41c67551742e3adc5df7925eab7d1d98dd08b45ae423de4");
    assert.equal(sha256(antigoVeiculo ?? ""), "b32650e9b619b342cca381731f7c2d8c06b432422e6c063d9b5baba56c8475e5");
    // Versão de uma modalidade não serve para a outra; versão inventada não existe.
    assert.equal(textoConsentimentoCredito("2026-11-17-parecer-imovel", "veiculo"), undefined);
    assert.equal(textoConsentimentoCredito("1999-01-01", "imovel"), undefined);
  });

  test("histórico sem versão repetida na mesma modalidade e com as atuais dentro", () => {
    const chaves = CONSENTIMENTO_CREDITO_HISTORICO.map((item) => `${item.versao}|${item.modalidade}`);
    assert.equal(new Set(chaves).size, chaves.length);
    assert.ok(CONSENTIMENTO_CREDITO_HISTORICO.includes(CONSENTIMENTO_CREDITO.imovel));
    assert.ok(CONSENTIMENTO_CREDITO_HISTORICO.includes(CONSENTIMENTO_CREDITO.veiculo));
  });
});

describe("pedido de crédito leva a versão do texto que a pessoa viu", () => {
  const creditas = {
    name: "Cliente Teste",
    cpf: "529.982.247-25",
    birthDate: "1990-01-01",
    phone: "31988887777",
    email: "cliente@teste.local",
    timeToPurchase: "ONE_MONTH",
    consent: true,
    bacenConsent: true,
  };
  const credihome = {
    realtyPrice: 500000,
    mortgageValue: 350000,
    dateOfBirth: "1990-05-20",
    months: 360,
    purchaseWindow: "ate_3_meses",
    name: "Cliente Teste",
    cpf: "529.982.247-25",
    phone: "31988887777",
    email: "cliente@teste.local",
    useFgts: false,
    consent: true,
  };

  test("veículo: só a versão atual do veículo é aceita", () => {
    assert.equal(CreditasProposalInputSchema.safeParse({ ...creditas, consentVersion: "2026-11-17-parecer-veiculo" }).success, true);
    assert.equal(CreditasProposalInputSchema.safeParse(creditas).success, false);
    assert.equal(CreditasProposalInputSchema.safeParse({ ...creditas, consentVersion: "2026-11-09" }).success, false);
    assert.equal(CreditasProposalInputSchema.safeParse({ ...creditas, consentVersion: "2026-11-17-parecer-imovel" }).success, false);
  });

  test("imóvel: só a versão atual do imóvel é aceita (site e envio pelo admin)", () => {
    assert.equal(CredihomeProposalInputSchema.safeParse({ ...credihome, consentVersion: "2026-11-17-parecer-imovel" }).success, true);
    assert.equal(CredihomeProposalInputSchema.safeParse(credihome).success, false);
    assert.equal(CredihomeProposalInputSchema.safeParse({ ...credihome, consentVersion: "2026-11-17-parecer-veiculo" }).success, false);
    const admin = {
      cpf: "529.982.247-25",
      dateOfBirth: "1990-05-20",
      email: "cliente@teste.local",
      realtyPrice: 500000,
      mortgageValue: 350000,
      useFgts: false,
      consent: true,
    };
    assert.equal(SendToCredihomeInputSchema.safeParse({ ...admin, consentVersion: "2026-11-17-parecer-imovel" }).success, true);
    assert.equal(SendToCredihomeInputSchema.safeParse(admin).success, false);
  });

  test("versão com texto estranho (script, SQL) é recusada", () => {
    for (const consentVersion of ["<script>alert(1)</script>", "' OR '1'='1", "a".repeat(5000)]) {
      assert.equal(CreditasProposalInputSchema.safeParse({ ...creditas, consentVersion }).success, false);
    }
  });
});

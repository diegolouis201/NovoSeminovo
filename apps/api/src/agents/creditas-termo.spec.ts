import { describe, test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import {
  CONSENTIMENTO_CREDITO,
  CREDITAS_TIME_TO_PURCHASE,
  CreditasProposalInputSchema,
  TERMO_BACEN_CREDITAS,
  termoBacenCreditas,
} from "@novoseminovo/shared-types";

// Termo de autorização de consulta ao SCR (BACEN) que a Creditas exige ver,
// palavra por palavra, junto com cada lead: o texto que a pessoa leu e aceitou.
describe("Creditas: termo BACEN", () => {
  test("vem preenchido com os dados da IBS Capital e sem marcador sobrando", () => {
    const texto = TERMO_BACEN_CREDITAS.texto;
    assert.match(texto, /IBS CAPITAL CORRETORA DE SEGUROS LTDA/);
    assert.match(texto, /61\.452\.517\/0001-06/);
    assert.match(texto, /doravante denominada IBS Capital/);
    assert.match(texto, /AUTORIZO expressamente IBS Capital/);
    assert.match(texto, /Sistema de Informações de Crédito \(SCR\)/);
    assert.match(texto, /www\.bcb\.gov\.br\.$/);
    assert.ok(!texto.includes("{") && !texto.includes("}"), "sobrou marcador {VARIAVEL} no termo");
    assert.match(TERMO_BACEN_CREDITAS.versao, /^\d{4}-\d{2}-\d{2}$/);
  });

  test("a função troca todas as ocorrências de cada dado", () => {
    const texto = termoBacenCreditas({ nomeEmpresa: "EMPRESA X", cnpj: "00.000.000/0001-00", nomeFantasia: "Fantasia X" });
    assert.equal(texto.match(/Fantasia X/g)?.length, 2);
    assert.ok(!texto.includes("IBS"));
    assert.equal(termoBacenCreditas(), TERMO_BACEN_CREDITAS.texto);
  });

  test("autorização do NovoSeminovo para veículo cita a Creditas", () => {
    assert.match(CONSENTIMENTO_CREDITO.veiculo, /Creditas/);
  });
});

describe("Creditas: validação do formulário do anúncio", () => {
  const valid = {
    name: "Maria Compradora",
    cpf: "529.982.247-25",
    birthDate: "1990-05-20",
    phone: "(31) 98888-7777",
    email: " Maria@Teste.Local ",
    downValue: 10000,
    timeToPurchase: "ONE_MONTH",
    consent: true,
    bacenConsent: true,
  };
  const yearsAgo = (years: number, extraDays = 0) => {
    const date = new Date();
    date.setUTCFullYear(date.getUTCFullYear() - years);
    date.setUTCDate(date.getUTCDate() + extraDays);
    return date.toISOString().slice(0, 10);
  };

  test("aceita o pedido válido e normaliza telefone e e-mail", () => {
    const parsed = CreditasProposalInputSchema.parse(valid);
    assert.equal(parsed.phone, "31988887777");
    assert.equal(parsed.email, "maria@teste.local");
    assert.equal(parsed.downValue, 10000);
  });

  test("entrada pode ficar vazia (a API trata como zero)", () => {
    const { downValue: _omit, ...rest } = valid;
    assert.equal(CreditasProposalInputSchema.parse(rest).downValue ?? 0, 0);
  });

  test("recusa CPF inválido, menor de 18, mais de 80, data malformada, entrada negativa", () => {
    const bad = (patch: Record<string, unknown>) => CreditasProposalInputSchema.safeParse({ ...valid, ...patch }).success;
    assert.equal(bad({ cpf: "111.111.111-11" }), false);
    assert.equal(bad({ cpf: "529.982.247-24" }), false);
    assert.equal(bad({ birthDate: yearsAgo(17) }), false);
    assert.equal(bad({ birthDate: yearsAgo(18, -2) }), true);
    assert.equal(bad({ birthDate: yearsAgo(81) }), false);
    assert.equal(bad({ birthDate: "20/05/1990" }), false);
    assert.equal(bad({ birthDate: "1990-02-31" }), false);
    assert.equal(bad({ downValue: -1 }), false);
    assert.equal(bad({ phone: "3199" }), false);
    assert.equal(bad({ email: "nao-e-email" }), false);
    assert.equal(bad({ name: "Al" }), false);
    assert.equal(bad({ name: "A".repeat(121) }), false);
  });

  test("prazo de compra só nos valores da Creditas, com rótulo em português", () => {
    assert.deepEqual(Object.keys(CREDITAS_TIME_TO_PURCHASE), ["ONE_WEEK", "ONE_MONTH", "SIX_MONTHS", "JUST_RESEARCHING"]);
    assert.equal(CreditasProposalInputSchema.safeParse({ ...valid, timeToPurchase: "TOMORROW" }).success, false);
  });

  test("as duas autorizações são obrigatórias", () => {
    assert.equal(CreditasProposalInputSchema.safeParse({ ...valid, consent: false }).success, false);
    assert.equal(CreditasProposalInputSchema.safeParse({ ...valid, bacenConsent: false }).success, false);
    const { bacenConsent: _omit, ...withoutBacen } = valid;
    assert.equal(CreditasProposalInputSchema.safeParse(withoutBacen).success, false);
  });

  test("texto com script ou SQL no nome não quebra nada: vira só texto (limite de tamanho)", () => {
    const parsed = CreditasProposalInputSchema.parse({ ...valid, name: "Robert'); DROP TABLE listings;-- <script>" });
    assert.equal(parsed.name, "Robert'); DROP TABLE listings;-- <script>");
  });
});

describe("Creditas: script de teste do servidor", () => {
  const root = join(__dirname, "..", "..", "..", "..");

  test("usa exatamente o mesmo termo BACEN do site", () => {
    const script = readFileSync(join(root, "scripts", "creditas-teste.mjs"), "utf8");
    assert.ok(script.includes(`const TERMO = ${JSON.stringify(TERMO_BACEN_CREDITAS.texto)};`), "termo do script diferente do shared-types");
  });

  test("o lead de teste com dados reais nunca vai para o GitHub; o exemplo é só marcador", () => {
    assert.match(readFileSync(join(root, ".gitignore"), "utf8"), /^scripts\/creditas-lead-teste\.json$/m);
    const exemplo = JSON.parse(readFileSync(join(root, "scripts", "creditas-lead-teste.exemplo.json"), "utf8"));
    assert.equal(exemplo.lead.cpf, "00000000000");
    assert.equal(exemplo.bacenAuthorization.authorizationTerm, "__TERMO_IBS__");
  });
});

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  CreateListingInputSchema,
  CreatePartnerInputSchema,
  CreateReportInputSchema,
  CreateVehicleEventInputSchema,
  GenerateListingDraftInputSchema,
  RegisterInputSchema,
} from "@novoseminovo/shared-types";

// Texto livre tem tamanho máximo: sem isso um texto gigante vai para o banco,
// para os e-mails e para os prompts da IA (custo e abuso).
const long = (n: number) => "a".repeat(n);

function rejects(schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown, label: string) {
  assert.equal(schema.safeParse(value).success, false, label);
}

describe("Limites de tamanho nas entradas", () => {
  test("nome no cadastro: até 120", () => {
    rejects(RegisterInputSchema, { name: long(121), email: "a@b.com", password: "Senha@123", cpf: "52998224725" }, "nome");
  });

  test("anúncio: título até 150 e descrição até 10.000", () => {
    const base = { assetType: "vehicle", title: "Corolla XEi 2020", description: long(30), price: 1000, city: "BH", state: "MG" };
    rejects(CreateListingInputSchema, { ...base, title: long(151) }, "título");
    rejects(CreateListingInputSchema, { ...base, description: long(10_001) }, "descrição");
  });

  test("texto para a IA montar o anúncio: até 3.000", () => {
    rejects(GenerateListingDraftInputSchema, { assetType: "vehicle", freeText: long(3_001) }, "freeText");
  });

  test("denúncia: até 1.000", () => {
    rejects(CreateReportInputSchema, { reason: long(1_001) }, "motivo");
  });

  test("empresa: razão social até 200 e descrição até 3.000", () => {
    rejects(CreatePartnerInputSchema, { document: "11222333000181", legalName: long(201) }, "razão social");
    rejects(CreatePartnerInputSchema, { document: "11222333000181", description: long(3_001) }, "descrição");
  });

  test("evento do veículo: título até 120 e descrição até 2.000", () => {
    rejects(CreateVehicleEventInputSchema, { type: "repair", title: long(121) }, "título");
    rejects(CreateVehicleEventInputSchema, { type: "repair", title: "Troca de óleo", description: long(2_001) }, "descrição");
  });
});

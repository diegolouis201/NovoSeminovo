import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { CnpjLookup } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import type { PaymentsService } from "../payments/payments.service";
import type { AiService } from "../listings/ai.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { ContactsService } from "../marketing/contacts.service";
import type { CnpjService } from "./cnpj.service";
import { PartnersService } from "./partners.service";

// Selo de verificada automático no cadastro de empresa: só quando a Receita
// confirma CNPJ ativo e o tipo pela atividade principal. Usa o PostgreSQL
// local (DATABASE_URL) só para conferir que o CNPJ ainda não tem conta.
const withDb = Boolean(process.env.DATABASE_URL);

const base: CnpjLookup = {
  cnpj: "00000000000191",
  legalName: "Imobiliária Teste Ltda",
  active: true,
  situation: "Ativa",
  detectedType: "real_estate_agency",
  detectedLabel: "Imobiliária",
};

function service(lookup: () => Promise<CnpjLookup>, prisma: PrismaService) {
  const cnpj = { lookup } as unknown as CnpjService;
  return new PartnersService(prisma, {} as PaymentsService, {} as AiService, {} as NotificationsService, cnpj, {} as ContactsService);
}

describe("Cadastro de empresa: selo de verificada automático", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  // CNPJ que nenhum teste grava: a conferência de duplicidade passa.
  const document = "99.888.777/0001-66";

  after(async () => {
    await prisma.$disconnect();
  });

  test("CNPJ ativo com o tipo pela atividade principal: verificada", async () => {
    const result = await service(async () => base, prisma).resolveCompany({ document });
    assert.equal(result.type, "real_estate_agency");
    assert.equal(result.autoVerified, true);
  });

  test("tipo vindo de atividade secundária: fica para o admin", async () => {
    const result = await service(async () => ({ ...base, detectedFromSecondary: true }), prisma).resolveCompany({ document, type: "real_estate_agency" });
    assert.equal(result.autoVerified, false);
  });

  test("pessoa escolheu outro tipo que a Receita não confirma: fica para o admin", async () => {
    const result = await service(async () => ({ ...base, detectedType: undefined }), prisma).resolveCompany({ document, type: "broker" });
    assert.equal(result.autoVerified, false);
  });

  test("consulta da Receita fora do ar: fica para o admin", async () => {
    const offline = async () => {
      throw Object.assign(new Error("fora do ar"), { status: 503 });
    };
    const result = await service(offline, prisma).resolveCompany({ document, type: "real_estate_agency", legalName: "Imobiliária Teste" });
    assert.equal(result.autoVerified, false);
  });

  test("CNPJ inativo continua recusado", async () => {
    await assert.rejects(service(async () => ({ ...base, active: false, situation: "Baixada" }), prisma).resolveCompany({ document }), /só aceitamos empresas ativas/);
  });
});

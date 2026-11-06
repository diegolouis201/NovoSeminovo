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

function service(lookup: (cnpj: string) => Promise<CnpjLookup>, prisma: PrismaService) {
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

  test("cidade e UF vêm do endereço do CNPJ", async () => {
    const result = await service(async () => ({ ...base, city: "Belo Horizonte", state: "MG" }), prisma).resolveCompany({ document });
    assert.equal(result.city, "Belo Horizonte");
    assert.equal(result.state, "MG");
  });

  test("empresas antigas sem cidade ganham a cidade do CNPJ", async () => {
    const tag = `cidade-${Date.now()}`;
    const owner = await prisma.user.create({ data: { name: "Dono", email: `${tag}@teste.local` } });
    const partner = await prisma.partner.create({
      data: { ownerUserId: owner.id, type: "dealership", legalName: `Loja ${tag}`, document: "45723174000110", slug: tag },
    });
    try {
      // Conta só a consulta desta empresa: outros arquivos de teste rodam ao
      // mesmo tempo e podem criar empresas sem cidade.
      let calls = 0;
      const lookup = async (cnpj: string) => {
        if (cnpj === "45723174000110") calls++;
        return { ...base, city: "Contagem", state: "MG" };
      };
      await service(lookup, prisma).fillMissingCities();
      const saved = await prisma.partner.findUniqueOrThrow({ where: { id: partner.id } });
      assert.equal(saved.city, "Contagem");
      assert.equal(saved.state, "MG");
      const before = calls;
      await service(lookup, prisma).fillMissingCities();
      assert.equal(calls, before, "quem já tem cidade não é consultado de novo");
    } finally {
      await prisma.partner.delete({ where: { id: partner.id } });
      await prisma.user.delete({ where: { id: owner.id } });
    }
  });

  test("empresa apagada enquanto a cidade é consultada: pula e continua", async () => {
    const tag = `cidade-apagada-${Date.now()}`;
    const owner = await prisma.user.create({ data: { name: "Dono", email: `${tag}@teste.local` } });
    const partner = await prisma.partner.create({
      data: { ownerUserId: owner.id, type: "dealership", legalName: `Loja ${tag}`, document: "11222333000181", slug: tag },
    });
    try {
      const lookup = async () => {
        await prisma.partner.deleteMany({ where: { id: partner.id } });
        return { ...base, city: "Contagem", state: "MG" };
      };
      await service(lookup, prisma).fillMissingCities();
    } finally {
      await prisma.partner.deleteMany({ where: { id: partner.id } });
      await prisma.user.delete({ where: { id: owner.id } });
    }
  });

  test("CNPJ inativo continua recusado", async () => {
    await assert.rejects(service(async () => ({ ...base, active: false, situation: "Baixada" }), prisma).resolveCompany({ document }), /só aceitamos empresas ativas/);
  });
});

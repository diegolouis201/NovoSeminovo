import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { PrismaService } from "../prisma/prisma.service";
import { factsFromBrasilApi, factsFromCnpjWs, type CnpjService } from "./cnpj.service";
import { fillCompanyFacts } from "./company-facts";

// CRM geral: sócios e data de abertura da empresa vêm da Receita (dado
// público do CNPJ) — base para aniversário da empresa e campanhas com o
// nome dos sócios.

describe("Leitura dos dados da Receita", () => {
  test("BrasilAPI: data de abertura e sócios", () => {
    const facts = factsFromBrasilApi({
      data_inicio_atividade: "2015-03-20",
      qsa: [
        { nome_socio: "MARIA DA SILVA", qualificacao_socio: "Sócio-Administrador" },
        { nome_socio: "JOAO SOUZA", qualificacao_socio: "Sócio" },
        { nome_socio: "  " },
      ],
    });
    assert.equal(facts.openedAt, "2015-03-20");
    assert.deepEqual(facts.partners, [
      { name: "MARIA DA SILVA", role: "Sócio-Administrador" },
      { name: "JOAO SOUZA", role: "Sócio" },
    ]);
  });

  test("CNPJ.ws: data de abertura e sócios", () => {
    const facts = factsFromCnpjWs({
      estabelecimento: { data_inicio_atividade: "2019-07-01" },
      socios: [{ nome: "ANA LIMA", qualificacao_socio: { descricao: "Administrador" } }],
    });
    assert.equal(facts.openedAt, "2019-07-01");
    assert.deepEqual(facts.partners, [{ name: "ANA LIMA", role: "Administrador" }]);
  });

  test("perfil da empresa: setor, porte e capital social", () => {
    const brasil = factsFromBrasilApi({ cnae_fiscal_descricao: "Comércio a varejo de automóveis", porte: "MICRO EMPRESA", capital_social: 150000 });
    assert.deepEqual([brasil.activity, brasil.size, brasil.shareCapital], ["Comércio a varejo de automóveis", "Microempresa", 150000]);
    const ws = factsFromCnpjWs({
      capital_social: "500000.00",
      porte: { descricao: "Empresa de Pequeno Porte" },
      estabelecimento: { atividade_principal: { descricao: "Corretagem de imóveis" } },
    });
    assert.deepEqual([ws.activity, ws.size, ws.shareCapital], ["Corretagem de imóveis", "Empresa de pequeno porte", 500000]);
    assert.equal(factsFromBrasilApi({ porte: "DEMAIS" }).size, "Média ou grande");
  });

  test("data inválida não entra", () => {
    assert.equal(factsFromBrasilApi({ data_inicio_atividade: "nada" }).openedAt, undefined);
  });
});

const withDb = Boolean(process.env.DATABASE_URL);

describe("Preenchimento dos sócios (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const tag = `socios-${Date.now()}`;
  const ids = { owner: "", partner: "" };
  let calls = 0;
  const cnpj = {
    companyFacts: async () => {
      calls++;
      return {
        openedAt: "2015-03-20",
        partners: [{ name: "MARIA DA SILVA", role: "Sócio-Administrador" }],
        activity: "Comércio a varejo de automóveis",
        size: "Microempresa",
        shareCapital: 150000,
      };
    },
  } as unknown as CnpjService;

  before(async () => {
    ids.owner = (await prisma.user.create({ data: { name: "Dono", email: `dono-${tag}@teste.local` } })).id;
    ids.partner = (
      await prisma.partner.create({ data: { ownerUserId: ids.owner, type: "dealership", legalName: `Loja ${tag}`, document: "11222333000181", slug: tag } })
    ).id;
  });

  after(async () => {
    await prisma.partnerSocio.deleteMany({ where: { partnerId: ids.partner } });
    await prisma.partner.deleteMany({ where: { id: ids.partner } });
    await prisma.user.deleteMany({ where: { id: ids.owner } });
    await prisma.$disconnect();
  });

  test("grava abertura e sócios uma vez só", async () => {
    await fillCompanyFacts(prisma, cnpj, [ids.partner]);
    const partner = await prisma.partner.findUniqueOrThrow({ where: { id: ids.partner }, include: { socios: true } });
    assert.equal(partner.foundedAt?.toISOString().slice(0, 10), "2015-03-20");
    assert.ok(partner.receitaCheckedAt);
    assert.equal(partner.mainActivity, "Comércio a varejo de automóveis");
    assert.equal(partner.companySize, "Microempresa");
    assert.equal(Number(partner.shareCapital), 150000);
    assert.deepEqual(
      partner.socios.map((s) => [s.name, s.role, s.source]),
      [["MARIA DA SILVA", "Sócio-Administrador", "receita"]],
    );
    const before = calls;
    await fillCompanyFacts(prisma, cnpj, [ids.partner]);
    assert.equal(calls, before, "empresa já conferida não consulta de novo");
    assert.equal(await prisma.partnerSocio.count({ where: { partnerId: ids.partner } }), 1, "não duplica");
  });

  test("empresa apagada enquanto a Receita é consultada: pula e continua", async () => {
    const owner = await prisma.user.create({ data: { name: "Dono 2", email: `dono2-${tag}@teste.local` } });
    const sumiu = await prisma.partner.create({ data: { ownerUserId: owner.id, type: "dealership", legalName: `Loja some ${tag}`, document: "11444777000161", slug: `${tag}-some` } });
    const apagaNoMeio = {
      companyFacts: async () => {
        await prisma.partner.deleteMany({ where: { id: sumiu.id } });
        return { openedAt: "2015-03-20", partners: [{ name: "JOAO", role: "Sócio" }], activity: "x", size: "Microempresa", shareCapital: 1 };
      },
    } as unknown as CnpjService;
    try {
      assert.equal(await fillCompanyFacts(prisma, apagaNoMeio, [sumiu.id]), 0);
    } finally {
      await prisma.partner.deleteMany({ where: { id: sumiu.id } });
      await prisma.user.delete({ where: { id: owner.id } });
    }
  });
});

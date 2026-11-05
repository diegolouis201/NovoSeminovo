import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { PrismaService } from "../prisma/prisma.service";
import { SalesService } from "../sales/sales.service";
import { CrmController } from "./crm.controller";
import { CrmService } from "./crm.service";

// CRM geral (repositório "CRM NovoSeminovo" no Claude): GET /crm/clientes com
// a chave secreta devolve a jornada de cada empresa — cadastro, sócios,
// datas, plano, pagamentos, anúncios, leads, etapa no Comercial e anotações.

describe("Chave do feed do CRM", () => {
  const controller = new CrmController({} as CrmService, {} as never);
  test("sem chave configurada no servidor: indisponível", async () => {
    delete process.env.CRM_FEED_KEY;
    await assert.rejects(controller.clientes("Bearer qualquer"), /não configurado/);
  });
  test("chave errada: recusa", async () => {
    process.env.CRM_FEED_KEY = "chave-do-crm-para-testes-com-mais-de-32-caracteres";
    await assert.rejects(controller.clientes("Bearer errada"), /Chave inválida/);
    await assert.rejects(controller.clientes(undefined), /Chave inválida/);
  });
});

const withDb = Boolean(process.env.DATABASE_URL);

describe("Jornada das empresas no feed (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const sales = new SalesService(prisma);
  const service = new CrmService(prisma, sales);
  const tag = `crm-${Date.now()}`;
  const ids = { owner: "", seller: "", buyer: "", partner: "", listing: "", prospect: "", plan: "" };

  before(async () => {
    ids.owner = (await prisma.user.create({ data: { name: "Dona Loja", email: `dona-${tag}@teste.local`, phone: "31955554444", role: "partner_owner" } })).id;
    ids.buyer = (await prisma.user.create({ data: { name: "Comprador", email: `comp-${tag}@teste.local` } })).id;
    ids.seller = (await sales.createMember({ name: "Vendedora CRM", email: `vend-${tag}@teste.local` })).id;
    ids.partner = (
      await prisma.partner.create({
        data: {
          ownerUserId: ids.owner,
          type: "dealership",
          legalName: `Loja ${tag}`,
          document: "11222333000181",
          slug: tag,
          city: "Belo Horizonte",
          state: "MG",
          foundedAt: new Date("2015-03-20T12:00:00Z"),
          receitaCheckedAt: new Date(),
        },
      })
    ).id;
    await prisma.partnerSocio.create({ data: { partnerId: ids.partner, name: "MARIA DA SILVA", role: "Sócio-Administrador", birthday: "07/09" } });
    ids.listing = (
      await prisma.listing.create({
        data: { type: "vehicle", ownerUserId: ids.owner, partnerId: ids.partner, title: `Gol ${tag}`, description: "teste", price: 40000, city: "BH", state: "MG", status: "active" },
      })
    ).id;
    await prisma.lead.create({ data: { partnerId: ids.partner, listingId: ids.listing, buyerId: ids.buyer, source: "chat", status: "won" } });
    await prisma.lead.create({
      data: { partnerId: ids.partner, listingId: ids.listing, buyerId: ids.buyer, source: "chat", status: "new", statusChangedAt: new Date(Date.now() - 5 * 86_400_000) },
    });
    ids.plan = (await prisma.plan.findFirst({ where: { audience: "vehicle", active: true } }))?.id ?? "";
    if (ids.plan) {
      const now = new Date();
      await prisma.subscription.create({ data: { partnerId: ids.partner, planId: ids.plan, status: "active", currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000) } });
      await prisma.subscriptionPayment.create({ data: { stripeInvoiceId: `in_${tag}`, partnerId: ids.partner, partnerType: "dealership", amount: 149, paidAt: now } });
    }
    await sales.linkSignup(ids.partner);
    ids.prospect = (await prisma.salesProspect.findUniqueOrThrow({ where: { partnerId: ids.partner } })).id;
    await sales.assign(ids.seller, ids.prospect);
    await sales.addNote(ids.seller, ids.prospect, "Cliente pediu destaque extra no fim do mês.");
  });

  after(async () => {
    await prisma.salesNote.deleteMany({ where: { prospectId: ids.prospect } });
    await prisma.salesProspect.deleteMany({ where: { id: ids.prospect } });
    await prisma.subscriptionPayment.deleteMany({ where: { partnerId: ids.partner } });
    await prisma.subscription.deleteMany({ where: { partnerId: ids.partner } });
    await prisma.lead.deleteMany({ where: { partnerId: ids.partner } });
    await prisma.listing.deleteMany({ where: { id: ids.listing } });
    await prisma.partnerSocio.deleteMany({ where: { partnerId: ids.partner } });
    await prisma.partner.deleteMany({ where: { id: ids.partner } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.owner, ids.buyer, ids.seller] } } });
    await prisma.$disconnect();
  });

  test("empresa com cadastro, sócios, datas, contato e etapa", async () => {
    const feed = await service.clientes();
    const empresa = feed.empresas.find((e) => e.id === ids.partner);
    assert.ok(empresa);
    assert.equal(empresa.nome, `Loja ${tag}`);
    assert.equal(empresa.segmento, "vehicle");
    assert.equal(empresa.cidade, "Belo Horizonte");
    assert.equal(empresa.abertaEm, "2015-03-20");
    assert.deepEqual(empresa.socios, [{ nome: "MARIA DA SILVA", cargo: "Sócio-Administrador", aniversario: "07/09" }]);
    assert.equal(empresa.responsavel.nome, "Dona Loja");
    assert.equal(empresa.responsavel.telefone, "31955554444");
    assert.equal(empresa.vendedor, "Vendedora CRM");
    assert.equal(empresa.etapa.id, ids.plan ? "assinante" : "publicou");
    assert.ok(empresa.ultimasAnotacoes.some((n) => n.texto.includes("destaque extra")));
  });

  test("último contato: só ligação, WhatsApp, e-mail ou reunião contam (anotação de sistema não)", async () => {
    let empresa = (await service.clientes()).empresas.find((e) => e.id === ids.partner)!;
    assert.equal(empresa.ultimoContato, undefined, "anotação comum não é contato");
    await sales.addNote(ids.seller, ids.prospect, "Liguei, pediu retorno semana que vem.", "ligacao");
    for (let i = 0; i < 6; i++) await sales.addNote(ids.seller, ids.prospect, `Anotação ${i}`);
    empresa = (await service.clientes()).empresas.find((e) => e.id === ids.partner)!;
    assert.equal(empresa.ultimoContato?.tipo, "ligacao", "acha o contato mesmo fora das 5 últimas anotações");
    assert.ok(empresa.ultimoContato?.data);
  });

  test("uso do site: anúncios, leads e leads parados", async () => {
    const empresa = (await service.clientes()).empresas.find((e) => e.id === ids.partner)!;
    assert.equal(empresa.anuncios.noAr, 1);
    assert.equal(empresa.leads.total, 2);
    assert.equal(empresa.leads.vendidos, 1);
    assert.equal(empresa.leads.paradosMais3Dias, 1);
  });

  test("plano e pagamentos", async (t) => {
    if (!ids.plan) return t.skip("sem plano no banco local");
    const empresa = (await service.clientes()).empresas.find((e) => e.id === ids.partner)!;
    assert.equal(empresa.plano?.status, "ativa");
    assert.ok((empresa.plano?.valorMensal ?? 0) > 0);
    assert.equal(empresa.pagamentos.quantidade, 1);
    assert.equal(empresa.pagamentos.totalPago, 149);
  });

  test("não expõe CPF nem senha", async () => {
    // CPF válido e único gerado no teste (o CPF é único por conta).
    const base = String(Date.now()).slice(-9).split("").map(Number);
    for (const start of [10, 11]) {
      const sum = base.reduce((acc, n, i) => acc + n * (start - i), 0);
      base.push(((sum * 10) % 11) % 10);
    }
    const cpf = base.join("");
    await prisma.user.update({ where: { id: ids.owner }, data: { cpf } });
    const text = JSON.stringify(await service.clientes());
    assert.ok(!text.includes(cpf));
    assert.ok(!text.toLowerCase().includes("passwordhash"));
  });
});

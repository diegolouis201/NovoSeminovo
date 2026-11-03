import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { NpsInputSchema } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { SalesService } from "../sales/sales.service";
import { CrmService } from "./crm.service";
import { NpsService } from "./nps.service";

// Pós-venda no CRM: chamados de suporte por empresa (tempo de resolução) e
// pesquisa NPS automática no painel do parceiro. Também confere que o feed
// traz perfil, origem, interações e comportamento de uso.

describe("Nota do NPS", () => {
  test("só de 0 a 10", () => {
    assert.equal(NpsInputSchema.safeParse({ score: 11 }).success, false);
    assert.equal(NpsInputSchema.safeParse({ score: -1 }).success, false);
    assert.equal(NpsInputSchema.safeParse({ score: 9, comment: "Bom" }).success, true);
  });
});

const withDb = Boolean(process.env.DATABASE_URL);

describe("Chamados, NPS e feed completo (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const sales = new SalesService(prisma);
  const nps = new NpsService(prisma);
  const crm = new CrmService(prisma, sales);
  const tag = `pos-${Date.now()}`;
  const ids = { owner: "", newOwner: "", seller: "", partner: "", newPartner: "", card: "" };

  before(async () => {
    ids.seller = (await sales.createMember({ name: "Vendedora Pós", email: `vp-${tag}@teste.local` })).id;
    ids.owner = (
      await prisma.user.create({
        data: { name: "Dono Antigo", email: `da-${tag}@teste.local`, role: "partner_owner", acqSource: "google_ads", acqMedium: "cpc", acqCampaign: "lojas-bh-nov26", lastActiveAt: new Date(Date.now() - 40 * 86_400_000) },
      })
    ).id;
    ids.newOwner = (await prisma.user.create({ data: { name: "Dono Novo", email: `dn-${tag}@teste.local`, role: "partner_owner" } })).id;
    ids.partner = (
      await prisma.partner.create({
        data: {
          ownerUserId: ids.owner,
          type: "real_estate_agency",
          legalName: `Imob ${tag}`,
          document: "11222333000181",
          slug: tag,
          createdAt: new Date(Date.now() - 60 * 86_400_000),
          mainActivity: "Corretagem na compra, venda e avaliação de imóveis",
          companySize: "Microempresa",
          shareCapital: 50000,
        },
      })
    ).id;
    ids.newPartner = (await prisma.partner.create({ data: { ownerUserId: ids.newOwner, type: "dealership", legalName: `Loja Nova ${tag}`, document: "11444777000161", slug: `${tag}-n` } })).id;
    await prisma.listing.create({
      data: { type: "property", ownerUserId: ids.owner, partnerId: ids.partner, title: `Apto ${tag}`, description: "teste", price: 300000, city: "BH", state: "MG", status: "active", viewsCount: 120 },
    });
    await sales.linkSignup(ids.partner);
    ids.card = (await prisma.salesProspect.findUniqueOrThrow({ where: { partnerId: ids.partner } })).id;
    await sales.updateProfile(ids.seller, ids.card, { contactRole: "Diretora", employeesRange: "6-20", revenueRange: "ate_4_8mi" });
    await sales.addNote(ids.seller, ids.card, "Prefere falar por WhatsApp depois das 14h.", "preferencia");
  });

  after(async () => {
    await prisma.npsResponse.deleteMany({ where: { partnerId: { in: [ids.partner, ids.newPartner] } } });
    await prisma.crmTicket.deleteMany({ where: { prospectId: ids.card } });
    await prisma.salesNote.deleteMany({ where: { prospectId: ids.card } });
    await prisma.salesProspect.deleteMany({ where: { partnerId: { in: [ids.partner, ids.newPartner] } } });
    await prisma.listing.deleteMany({ where: { partnerId: ids.partner } });
    await prisma.partner.deleteMany({ where: { id: { in: [ids.partner, ids.newPartner] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.owner, ids.newOwner, ids.seller] } } });
    await prisma.$disconnect();
  });

  test("chamado aberto e resolvido, com tempo de resolução", async () => {
    const ticket = await sales.openTicket(ids.seller, ids.card, { subject: "Integração do estoque não atualiza", channel: "whatsapp", description: "Feed parou ontem." });
    let detail = await sales.detail(ids.card);
    assert.equal(detail.tickets.find((t) => t.id === ticket.id)?.status, "aberto");
    await sales.resolveTicket(ids.seller, ticket.id, "URL do feed estava errada; corrigida com a loja.");
    detail = await sales.detail(ids.card);
    const resolved = detail.tickets.find((t) => t.id === ticket.id);
    assert.equal(resolved?.status, "resolvido");
    assert.ok(resolved?.resolvedAt);
    await assert.rejects(sales.resolveTicket(ids.seller, ticket.id, "de novo"), /resolvido/);
  });

  test("NPS: pergunta só para empresa com 30 dias ou mais, uma vez a cada 90 dias", async () => {
    assert.equal((await nps.status(ids.newOwner)).ask, false, "empresa nova ainda não");
    assert.equal((await nps.status(ids.owner)).ask, true);
    await nps.answer(ids.owner, { score: 4, comment: "Poucos contatos este mês." });
    assert.equal((await nps.status(ids.owner)).ask, false);
    await assert.rejects(nps.answer(ids.owner, { score: 9 }), /já respondeu/);
  });

  test("feed traz perfil, origem, interações, uso, chamados e NPS", async () => {
    const empresa = (await crm.clientes()).empresas.find((e) => e.id === ids.partner)!;
    assert.equal(empresa.setor, "Corretagem na compra, venda e avaliação de imóveis");
    assert.equal(empresa.porte, "Microempresa");
    assert.equal(empresa.capitalSocial, 50000);
    assert.equal(empresa.pais, "Brasil");
    assert.equal(empresa.perfil.funcionarios, "6 a 20");
    assert.equal(empresa.responsavel.cargo, "Diretora");
    assert.deepEqual(empresa.origemMarketing, { canal: "google_ads", meio: "cpc", campanha: "lojas-bh-nov26" });
    assert.ok(empresa.ultimasAnotacoes.some((n) => n.tipo === "preferencia"));
    assert.equal(empresa.uso.visualizacoes, 120);
    assert.ok(empresa.uso.diasSemAcesso !== undefined && empresa.uso.diasSemAcesso >= 39);
    assert.equal(empresa.chamados.total, 1);
    assert.equal(empresa.chamados.abertos, 0);
    assert.equal(empresa.chamados.abertoDesde, undefined, "sem chamado aberto");
    assert.equal(empresa.nps?.nota, 4);
    assert.equal(empresa.nps?.classificacao, "detrator");
  });
});

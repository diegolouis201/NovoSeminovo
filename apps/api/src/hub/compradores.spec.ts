import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { HubBuyerLeadsQuerySchema, hubPermissionsOf, type HubAccess } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { BuyerLeadsService } from "./compradores.service";

// Leads de compradores no Hub (Etapa 1 de marketing, 14/11/2026): contatos de
// anúncio, pedidos de financiamento e inscrições de novidades que chegaram
// pelo site, com a origem (canal, campanha, anúncio). Marketing vê números e
// origem; quem tem acesso ao CRM (dono, comercial, leitura) vê também o contato.

const access = (profile: string): HubAccess => ({ userId: "u", name: "x", email: "x@y", profile: profile as HubAccess["profile"], permissions: hubPermissionsOf(profile) });

describe("Filtro dos leads de compradores", () => {
  test("período em AAAA-MM-DD, até 366 dias, origem com tamanho limitado", () => {
    assert.equal(HubBuyerLeadsQuerySchema.safeParse({ de: "2026-11-01", ate: "2026-11-14" }).success, true);
    assert.equal(HubBuyerLeadsQuerySchema.safeParse({ de: "01/11/2026" }).success, false);
    assert.equal(HubBuyerLeadsQuerySchema.safeParse({ de: "2024-01-01", ate: "2026-11-14" }).success, false);
    assert.equal(HubBuyerLeadsQuerySchema.safeParse({ de: "2026-11-14", ate: "2026-11-01" }).success, false);
    assert.equal(HubBuyerLeadsQuerySchema.safeParse({ campanha: "x".repeat(101) }).success, false);
    assert.equal(HubBuyerLeadsQuerySchema.safeParse({ canal: "'; drop table leads; --" }).success, false);
    assert.equal(HubBuyerLeadsQuerySchema.safeParse({ canal: "meta_ads", campanha: "Compradores Nov" }).success, true);
  });

  test("financeiro (sem CRM e sem marketing) não vê", async () => {
    const service = new BuyerLeadsService({} as never);
    await assert.rejects(service.list(access("financeiro"), {}), /permissão/i);
  });
});

const withDb = Boolean(process.env.DATABASE_URL);

describe("Leads de compradores (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const service = new BuyerLeadsService(prisma);
  const tag = `comp${Date.now()}`;
  const campaign = `compradores_${tag}`;
  const ids = { lead: "", fin: "", contact: "", buyer: "" };

  before(async () => {
    const listing = await prisma.listing.findFirstOrThrow({ where: { partnerId: { not: null } }, select: { id: true, partnerId: true } });
    ids.buyer = (await prisma.user.create({ data: { name: "Ana Compradora Silva", email: `ana-${tag}@teste.local`, phone: "31988887777", role: "buyer" } })).id;
    ids.lead = (
      await prisma.lead.create({
        data: { partnerId: listing.partnerId!, listingId: listing.id, buyerId: ids.buyer, source: "form", contactName: "Ana Compradora Silva", contactPhone: "31988887777", contactEmail: `ana-${tag}@teste.local`, acqSource: "meta_ads", acqCampaign: campaign, acqContent: "carrossel_suv" },
      })
    ).id;
    ids.fin = (
      await prisma.financingLead.create({
        data: { channel: "web", name: "Bruno Financia", phone: "11977776666", email: `bruno-${tag}@teste.local`, assetType: "vehicle", listingId: listing.id, acqSource: "meta_ads", acqCampaign: campaign, acqContent: "video_taxa" },
      })
    ).id;
    ids.contact = (
      await prisma.marketingContact.create({
        data: { email: `carla-${tag}@teste.local`, name: "Carla Novidades", source: "google", sourceDetail: "formulario:busca_nov", consent: "opt_in" },
      })
    ).id;
    // lead cadastrado à mão pela loja não é lead do site
    await prisma.lead.create({ data: { partnerId: listing.partnerId!, source: "walk_in", contactName: `Manual ${tag}` } });
  });

  after(async () => {
    await prisma.lead.deleteMany({ where: { OR: [{ id: ids.lead }, { contactName: `Manual ${tag}` }] } });
    await prisma.financingLead.deleteMany({ where: { id: ids.fin } });
    await prisma.marketingContact.deleteMany({ where: { id: ids.contact } });
    await prisma.user.deleteMany({ where: { id: ids.buyer } });
    await prisma.$disconnect();
  });

  test("comercial vê os 3 tipos com contato, anúncio e origem; lead manual da loja fica de fora", async () => {
    const r = await service.list(access("comercial"), {});
    assert.equal(r.contatosVisiveis, true);
    const lead = r.itens.find((i) => i.id === `lead:${ids.lead}`);
    const fin = r.itens.find((i) => i.id === `fin:${ids.fin}`);
    const news = r.itens.find((i) => i.id === `news:${ids.contact}`);
    assert.equal(lead?.tipo, "contato_anuncio");
    assert.equal(lead?.nome, "Ana Compradora Silva");
    assert.equal(lead?.telefone, "31988887777");
    assert.ok(lead?.anuncio?.titulo);
    assert.deepEqual(lead?.origem, { canal: "meta_ads", canalRotulo: "Anúncio Meta (Instagram/Facebook)", campanha: campaign, anuncio: "carrossel_suv" });
    assert.equal(fin?.tipo, "financiamento");
    assert.equal(fin?.telefone, "11977776666");
    assert.equal(news?.tipo, "novidades");
    assert.equal(news?.origem.campanha, "busca_nov");
    assert.ok(!r.itens.some((i) => i.nome === `Manual ${tag}`));
  });

  test("marketing vê origem e números, mas só o primeiro nome e nenhum contato", async () => {
    const r = await service.list(access("marketing"), {});
    assert.equal(r.contatosVisiveis, false);
    const lead = r.itens.find((i) => i.id === `lead:${ids.lead}`);
    assert.equal(lead?.nome, "Ana");
    assert.equal(lead?.telefone, undefined);
    assert.equal(lead?.email, undefined);
    assert.equal(lead?.origem.campanha, campaign);
    assert.ok(!JSON.stringify(r).includes("31988887777"), "telefone não sai na resposta");
    assert.ok(!JSON.stringify(r).includes(`ana-${tag}`), "e-mail não sai na resposta");
  });

  test("filtro por campanha (sem diferenciar maiúsculas/espaços) e totais por canal e campanha", async () => {
    const r = await service.list(access("dono"), { campanha: campaign.toUpperCase() });
    assert.equal(r.itens.length, 2);
    assert.equal(r.totais.total, 2);
    assert.deepEqual(r.totais.porTipo, { contato_anuncio: 1, financiamento: 1, novidades: 0 });
    assert.deepEqual(r.totais.porCanal, [{ canal: "meta_ads", rotulo: "Anúncio Meta (Instagram/Facebook)", total: 2 }]);
    assert.deepEqual(r.totais.porCampanha, [{ campanha: campaign, total: 2 }]);
    const google = await service.list(access("dono"), { canal: "google" });
    assert.ok(google.itens.every((i) => i.origem.canal === "google"));
    assert.ok(google.itens.some((i) => i.id === `news:${ids.contact}`));
  });

  test("período fora não traz nada", async () => {
    const r = await service.list(access("dono"), { de: "2020-01-01", ate: "2020-01-31" });
    assert.ok(!r.itens.some((i) => i.id === `lead:${ids.lead}`));
  });
});

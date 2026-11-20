import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { PartnerDashboardSchema } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { PartnerDashboardService } from "./dashboard.service";

// GET /partners/mine/dashboard com o PostgreSQL local: só a loja de quem
// pede (dono ou equipe), nunca dados de outra loja.
const withDb = Boolean(process.env.DATABASE_URL);

describe("Painel do parceiro: endpoint com banco", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const service = new PartnerDashboardService(prisma);
  const tag = `painel-${Date.now()}`;
  const agora = new Date();
  const horasAtras = (h: number) => new Date(agora.getTime() - h * 3_600_000);
  const ids = { users: [] as string[], partners: [] as string[], listings: [] as string[], brand: "", model: "" };
  let donoA = "";
  let equipeA = "";
  let donoB = "";
  let semLoja = "";
  let comprador = "";
  let anuncioTopA = "";

  before(async () => {
    const user = async (nome: string) => {
      const u = await prisma.user.create({ data: { name: `${nome} ${tag}`, email: `${nome.toLowerCase()}-${tag}@teste.local` } });
      ids.users.push(u.id);
      return u.id;
    };
    donoA = await user("DonoA");
    equipeA = await user("EquipeA");
    donoB = await user("DonoB");
    semLoja = await user("SemLoja");
    comprador = await user("Comprador");

    const lojaA = await prisma.partner.create({
      data: { ownerUserId: donoA, type: "dealership", legalName: `Loja A ${tag}`, document: `${tag}-a`, slug: `${tag}-a`, verifiedAt: agora, logoUrl: "/uploads/logo-a.png" },
    });
    const lojaB = await prisma.partner.create({
      data: { ownerUserId: donoB, type: "dealership", legalName: `Loja B ${tag}`, document: `${tag}-b`, slug: `${tag}-b` },
    });
    ids.partners.push(lojaA.id, lojaB.id);
    await prisma.partnerMember.create({ data: { partnerId: lojaA.id, userId: equipeA, role: "agent" } });

    const brand = await prisma.vehicleBrand.create({ data: { name: `Marca ${tag}` } });
    const model = await prisma.vehicleModel.create({ data: { brandId: brand.id, name: "Modelo" } });
    ids.brand = brand.id;
    ids.model = model.id;

    const anuncio = async (partnerId: string, owner: string, titulo: string, extra: { preco: number; fipe?: number; views: number; fotos: number; diasNoAr: number }) => {
      const l = await prisma.listing.create({
        data: {
          type: "vehicle",
          ownerUserId: owner,
          partnerId,
          title: titulo,
          description: "x".repeat(350),
          price: extra.preco,
          status: "active",
          city: "Belo Horizonte",
          state: "MG",
          viewsCount: extra.views,
          publishedAt: horasAtras(extra.diasNoAr * 24),
          createdAt: horasAtras(extra.diasNoAr * 24),
          vehicleDetails: {
            create: {
              brandId: brand.id,
              modelId: model.id,
              yearManufacture: 2020,
              yearModel: 2021,
              mileage: 10000,
              transmission: "automatic",
              fuelType: "flex",
              color: "Preto",
              ...(extra.fipe ? { fipePrice: extra.fipe } : {}),
            },
          },
          photos: { create: Array.from({ length: extra.fotos }, (_, i) => ({ url: `/uploads/${tag}-${i}.jpg`, position: i, variantWidths: i === 0 ? [320, 640] : [] })) },
        },
      });
      ids.listings.push(l.id);
      return l.id;
    };
    anuncioTopA = await anuncio(lojaA.id, donoA, "Carro mais visto A", { preco: 130_000, fipe: 100_000, views: 900, fotos: 9, diasNoAr: 20 });
    const fracoA = await anuncio(lojaA.id, donoA, "Carro fraco A", { preco: 80_000, fipe: 100_000, views: 3, fotos: 2, diasNoAr: 20 });
    const anuncioB = await anuncio(lojaB.id, donoB, "Carro da loja B", { preco: 50_000, views: 5000, fotos: 1, diasNoAr: 30 });

    const lead = (partnerId: string, listingId: string | null, status: string, criado: Date, extra: Record<string, unknown> = {}) =>
      prisma.lead.create({ data: { partnerId, listingId, source: "form", status: status as never, createdAt: criado, contactName: "Cliente", ...extra } });

    // Loja A: 3 leads nos 15 dias, 1 a mais nos 30 dias, 1 fora dos 30.
    await lead(lojaA.id, anuncioTopA, "new", horasAtras(2), { contactName: "Mariana Teste" });
    await lead(lojaA.id, anuncioTopA, "contacted", horasAtras(30), { source: "chat", buyerId: comprador, contactName: null });
    await lead(lojaA.id, fracoA, "won", horasAtras(48));
    await lead(lojaA.id, null, "visit_scheduled", horasAtras(24 * 20), { source: "walk_in" });
    await lead(lojaA.id, fracoA, "lost", horasAtras(24 * 40));
    // Loja B: muitos leads que nunca podem aparecer para a loja A.
    for (let i = 0; i < 6; i++) await lead(lojaB.id, anuncioB, "new", horasAtras(3 + i), { contactName: "Cliente da B" });

    // Chat da loja A: comprador pergunta, equipe responde 12 minutos depois.
    const conversa = await prisma.conversation.create({ data: { listingId: anuncioTopA, buyerId: comprador, sellerUserId: donoA } });
    await prisma.message.create({ data: { conversationId: conversa.id, senderId: comprador, body: "Ainda está disponível?", createdAt: horasAtras(30) } });
    await prisma.message.create({ data: { conversationId: conversa.id, senderId: equipeA, body: "Sim!", createdAt: new Date(horasAtras(30).getTime() + 12 * 60_000) } });

    await prisma.review.create({ data: { reviewerId: comprador, reviewedPartnerId: lojaA.id, rating: 4, status: "approved" } });
    await prisma.review.create({ data: { reviewerId: comprador, reviewedPartnerId: lojaB.id, rating: 1, status: "approved" } });
  });

  after(async () => {
    await prisma.message.deleteMany({ where: { conversation: { listingId: { in: ids.listings } } } });
    await prisma.conversation.deleteMany({ where: { listingId: { in: ids.listings } } });
    await prisma.review.deleteMany({ where: { reviewedPartnerId: { in: ids.partners } } });
    await prisma.lead.deleteMany({ where: { partnerId: { in: ids.partners } } });
    await prisma.listing.deleteMany({ where: { id: { in: ids.listings } } });
    await prisma.vehicleModel.deleteMany({ where: { id: ids.model } });
    await prisma.vehicleBrand.deleteMany({ where: { id: ids.brand } });
    await prisma.partnerMember.deleteMany({ where: { partnerId: { in: ids.partners } } });
    await prisma.partner.deleteMany({ where: { id: { in: ids.partners } } });
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
    await prisma.$disconnect();
  });

  test("dono vê só a própria loja, no formato do contrato", async () => {
    const painel = PartnerDashboardSchema.parse(await service.forUser(donoA, agora));
    assert.equal(painel.segmento, "vehicle");
    assert.equal(painel.leads.total, 3);
    assert.equal(painel.leads.aguardando, 1);
    assert.equal(painel.leads.emContato, 1);
    assert.equal(painel.leads.porDia.length, 15);
    assert.equal(painel.leads.porDia.reduce((s, d) => s + d.total, 0), 3);
    assert.equal(painel.leads.tempoResposta?.mediaMinutos, 12);
    assert.equal(painel.funil.totalLeads, 4);
    assert.deepEqual(painel.funil.etapas.map((e) => e.total), [1, 1, 0, 1]);
    assert.equal(painel.funil.perdidos, 0);
    assert.equal(painel.funil.visualizacoesAnunciosAtivos, 903);
    assert.equal(painel.novosLeads.length, 5);
    assert.equal(painel.novosLeads[0]!.nome, "Mariana Teste");
    assert.equal(painel.novosLeads[0]!.anuncio, "Carro mais visto A");
    assert.equal(painel.novosLeads[1]!.nome, `Comprador ${tag}`);
    assert.equal(painel.novosLeads[1]!.origem, "Chat do site");
    assert.deepEqual(painel.topAnuncios.map((a) => a.titulo), ["Carro mais visto A", "Carro fraco A"]);
    assert.equal(painel.topAnuncios[0]!.id, anuncioTopA);
    assert.equal(painel.topAnuncios[0]!.leads, 2);
    assert.equal(painel.topAnuncios[0]!.preco.value, 130_000);
    assert.equal(painel.topAnuncios[0]!.fotoUrl, `/uploads/${tag}-0-w320.webp`);
    const item = (chave: string) => painel.analise.itens.find((i) => i.chave === chave)?.total;
    assert.equal(item("acima_fipe"), 1);
    assert.equal(item("abaixo_fipe"), 1);
    assert.equal(item("pouca_procura"), 1);
    assert.equal(item("poucas_fotos"), 1);
    const avaliacao = painel.qualidade.itens.find((i) => i.chave === "avaliacao");
    assert.match(avaliacao?.label ?? "", /4,0/);
    assert.ok(painel.qualidade.itens.find((i) => i.chave === "verificada")?.ok);
    assert.equal(painel.plano.situacao, "trial");
    assert.equal(painel.plano.anunciosEmUso, 2);
    assert.equal(painel.plano.proximaCobranca, undefined);
    assert.doesNotMatch(JSON.stringify(painel), /Cliente da B|Carro da loja B/);
  });

  test("equipe da loja vê o mesmo painel", async () => {
    const painel = await service.forUser(equipeA, agora);
    assert.equal(painel.leads.total, 3);
    assert.deepEqual(painel.topAnuncios.map((a) => a.titulo), ["Carro mais visto A", "Carro fraco A"]);
  });

  test("a outra loja nunca vê os dados da primeira", async () => {
    const painel = await service.forUser(donoB, agora);
    assert.equal(painel.leads.total, 6);
    assert.equal(painel.leads.tempoResposta, undefined);
    assert.deepEqual(painel.topAnuncios.map((a) => a.titulo), ["Carro da loja B"]);
    assert.equal(painel.funil.visualizacoesAnunciosAtivos, 5000);
    assert.doesNotMatch(JSON.stringify(painel), /Mariana|Carro mais visto A|Carro fraco A/);
    assert.equal(painel.qualidade.itens.find((i) => i.chave === "verificada")?.ok, false);
  });

  test("sinais de interesse: só números, dos últimos 30 dias, da própria loja", async () => {
    const [lojaA] = ids.partners as [string];
    const [anuncioA] = ids.listings as [string];
    const anuncioB = ids.listings[2]!;
    const dia = (diasAtras: number) => new Date(`${new Date(agora.getTime() - diasAtras * 86_400_000).toISOString().slice(0, 10)}T00:00:00Z`);
    await prisma.listingDailyCount.createMany({
      data: [
        { listingId: anuncioA, day: dia(1), kind: "assistente_abriu", count: 3 },
        { listingId: anuncioA, day: dia(10), kind: "assistente_abriu", count: 2 },
        { listingId: anuncioA, day: dia(45), kind: "assistente_abriu", count: 50 }, // fora dos 30 dias
        { listingId: anuncioB, day: dia(1), kind: "assistente_abriu", count: 7 }, // outra loja
      ],
    });
    let painel = await service.forUser(donoA, agora);
    assert.equal(painel.funil.sinais.assistente, 5);
    assert.equal(painel.funil.sinais.arquiteto, undefined, "loja de veículos não vê o Arquiteto");
    painel = await service.forUser(donoB, agora);
    assert.equal(painel.funil.sinais.assistente, 7);

    // Imobiliária: Arquiteto conta pessoas distintas nos imóveis dela (30 dias).
    await prisma.partner.update({ where: { id: lojaA }, data: { type: "real_estate_agency" } });
    await prisma.listing.update({ where: { id: anuncioA }, data: { type: "property" } });
    const sessao = (userId: string, listingId: string, criado: Date) => prisma.architectSession.create({ data: { userId, listingId, createdAt: criado } });
    await sessao(comprador, anuncioA, horasAtras(5));
    await sessao(comprador, anuncioA, horasAtras(50)); // mesma pessoa: conta 1
    await sessao(semLoja, anuncioA, horasAtras(24 * 3));
    await sessao(equipeA, anuncioA, horasAtras(24 * 40)); // fora dos 30 dias
    await sessao(donoA, anuncioB, horasAtras(2)); // imóvel de outra loja
    try {
      painel = await service.forUser(donoA, agora);
      assert.equal(painel.funil.sinais.arquiteto, 2);
      assert.equal(painel.funil.sinais.assistente, 5);
      // Nunca quem foi: nem nome nem id de quem usou.
      const json = JSON.stringify(painel.funil.sinais);
      assert.doesNotMatch(json, new RegExp(`${comprador}|${semLoja}|Comprador|SemLoja`));
    } finally {
      await prisma.architectSession.deleteMany({ where: { listingId: { in: ids.listings } } });
      await prisma.listing.update({ where: { id: anuncioA }, data: { type: "vehicle" } });
      await prisma.partner.update({ where: { id: lojaA }, data: { type: "dealership" } });
    }
  });

  test("quem não tem loja recebe 404", async () => {
    await assert.rejects(() => service.forUser(semLoja, agora), (e) => e instanceof NotFoundException || e instanceof ForbiddenException);
  });

  test("próxima cobrança só com assinatura do Stripe ativa", async () => {
    const plano = await prisma.plan.create({ data: { name: `Plano ${tag}`, maxActiveListings: 60, highlightCredits: 10, priceMonth: 249, audience: "vehicle" } });
    const fim = new Date(agora.getTime() + 10 * 24 * 3_600_000);
    const sub = await prisma.subscription.create({
      data: { partnerId: ids.partners[0]!, planId: plano.id, status: "active", currentPeriodStart: agora, currentPeriodEnd: fim },
    });
    try {
      let painel = await service.forUser(donoA, agora);
      assert.equal(painel.plano.situacao, "em_dia");
      assert.equal(painel.plano.limiteAnuncios, 60, "com plano, mostra o limite do plano (igual ao menu lateral)");
      assert.equal(painel.plano.planName, `Plano ${tag}`);
      assert.equal(painel.plano.proximaCobranca, undefined, "sem Stripe não há cobrança");
      await prisma.subscription.update({ where: { id: sub.id }, data: { paymentProviderRef: "sub_teste" } });
      painel = await service.forUser(donoA, agora);
      assert.equal(painel.plano.proximaCobranca?.valor.value, 249);
      assert.equal(painel.plano.proximaCobranca?.data, fim.toISOString());
      await prisma.subscription.update({ where: { id: sub.id }, data: { status: "past_due" } });
      painel = await service.forUser(donoA, agora);
      assert.equal(painel.plano.situacao, "atrasado");
      assert.equal(painel.plano.proximaCobranca, undefined);
    } finally {
      await prisma.subscription.delete({ where: { id: sub.id } });
      await prisma.plan.delete({ where: { id: plano.id } });
    }
  });
});

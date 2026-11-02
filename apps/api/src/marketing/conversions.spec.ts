import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { PrismaService } from "../prisma/prisma.service";
import { ConversionsService, feedKeyCheck } from "./conversions.service";

// "Ligação direta" com o CRM de marketing (repositório do Diego no Claude):
// a sessão de marketing consulta GET /marketing/conversoes com uma chave
// secreta e recebe as empresas que se cadastraram e em que etapa estão,
// para trocar a comunicação de quem já converteu.

describe("Chave do feed de conversões", () => {
  const key = "chave-do-feed-de-marketing-com-mais-de-32-caracteres";

  test("chave certa libera", () => {
    assert.equal(feedKeyCheck(`Bearer ${key}`, key), "ok");
  });

  test("chave errada, ausente ou em outro formato é recusada", () => {
    assert.equal(feedKeyCheck(`Bearer ${key}x`, key), "denied");
    assert.equal(feedKeyCheck(undefined, key), "denied");
    assert.equal(feedKeyCheck(key, key), "denied");
  });

  test("servidor sem chave configurada não libera ninguém", () => {
    assert.equal(feedKeyCheck(`Bearer ${key}`, undefined), "not_configured");
    assert.equal(feedKeyCheck("Bearer ", ""), "not_configured");
  });
});

const withDb = Boolean(process.env.DATABASE_URL);

describe("Feed de conversões para o CRM (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const service = new ConversionsService(prisma);
  const tag = `conv-${Date.now()}`;
  const ids = { owner1: "", owner2: "", p1: "", p2: "", listing: "" };

  before(async () => {
    ids.owner1 = (await prisma.user.create({ data: { name: "Dono Loja", email: `loja-${tag}@teste.local`, phone: "31911112222" } })).id;
    ids.owner2 = (await prisma.user.create({ data: { name: "Dona Imob", email: `imob-${tag}@teste.local` } })).id;
    ids.p1 = (
      await prisma.partner.create({ data: { ownerUserId: ids.owner1, type: "dealership", legalName: `Loja ${tag}`, document: "11222333000181", slug: `loja-${tag}` } })
    ).id;
    ids.p2 = (
      await prisma.partner.create({
        data: { ownerUserId: ids.owner2, type: "real_estate_agency", legalName: `Imob ${tag}`, document: "11444777000161", slug: `imob-${tag}`, createdAt: new Date(Date.now() - 200 * 86_400_000) },
      })
    ).id;
    ids.listing = (
      await prisma.listing.create({
        data: { type: "vehicle", ownerUserId: ids.owner1, partnerId: ids.p1, title: `Carro ${tag}`, description: "teste", price: 50000, city: "Belo Horizonte", state: "MG", status: "active" },
      })
    ).id;
  });

  after(async () => {
    await prisma.listing.deleteMany({ where: { id: ids.listing } });
    await prisma.partner.deleteMany({ where: { id: { in: [ids.p1, ids.p2] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.owner1, ids.owner2] } } });
    await prisma.$disconnect();
  });

  test("traz a empresa nova com etapa, contato para casar com o CRM e sem dado sensível", async () => {
    const feed = await service.feed(new Date(Date.now() - 86_400_000));
    const loja = feed.empresas.find((e) => e.id === ids.p1);
    assert.ok(loja);
    assert.equal(loja.nome, `Loja ${tag}`);
    assert.equal(loja.tipo, "Loja de veículos");
    assert.equal(loja.cnpj, "11222333000181");
    assert.equal(loja.email, `loja-${tag}@teste.local`);
    assert.equal(loja.etapa, "publicou_anuncio");
    assert.equal(loja.anunciosAtivos, 1);
    assert.equal(loja.emTeste, true);
    assert.equal(loja.cidade, "Belo Horizonte - MG");
    const text = JSON.stringify(feed);
    assert.ok(!text.includes("31911112222"), "telefone não sai no feed");
    assert.ok(!/passwordHash|cpf/i.test(text));
  });

  test("respeita a data de corte", async () => {
    const recent = await service.feed(new Date(Date.now() - 86_400_000));
    assert.ok(!recent.empresas.some((e) => e.id === ids.p2));
    const old = await service.feed(new Date(Date.now() - 365 * 86_400_000));
    const imob = old.empresas.find((e) => e.id === ids.p2);
    assert.equal(imob?.etapa, "cadastrou");
    assert.equal(imob?.emTeste, false);
  });

  test("assinatura ativa vira etapa assinante", async () => {
    const plan = await prisma.plan.findFirst();
    if (!plan) return;
    const now = new Date();
    const sub = await prisma.subscription.create({
      data: { partnerId: ids.p2, planId: plan.id, status: "active", currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000) },
    });
    try {
      const feed = await service.feed(new Date(Date.now() - 365 * 86_400_000));
      const imob = feed.empresas.find((e) => e.id === ids.p2);
      assert.equal(imob?.etapa, "assinante");
      assert.equal(imob?.plano, plan.name);
    } finally {
      await prisma.subscription.delete({ where: { id: sub.id } });
    }
  });
});

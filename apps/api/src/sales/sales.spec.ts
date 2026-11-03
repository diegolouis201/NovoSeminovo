import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { ExecutionContext } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SalesGuard } from "./sales.guard";
import { SalesService, cardStage } from "./sales.service";

// Área Comercial (pedido do Diego, 03/11/2026): uma pessoa de vendas com login
// próprio gerencia o funil das empresas (lojas, imobiliárias, corretores) num
// kanban por Veículos, Imóveis e Consolidado. Etapas manuais até o cadastro;
// depois o site move sozinho (cadastrou → publicou → assinante).

describe("Etapa do card", () => {
  const now = new Date("2026-11-03T12:00:00Z");
  test("sem empresa ligada: vale a etapa manual", () => {
    assert.equal(cardStage({ stage: "em_contato" }, undefined, now), "em_contato");
  });
  test("empresa cadastrada sem anúncio: cadastrou; com anúncio: publicou", () => {
    assert.equal(cardStage({ stage: "a_abordar" }, { activeListings: 0, subscription: undefined }, now), "cadastrou");
    assert.equal(cardStage({ stage: "a_abordar" }, { activeListings: 3, subscription: undefined }, now), "publicou");
  });
  test("assinatura ativa ou atrasada: assinante; cancelada: cancelou", () => {
    assert.equal(cardStage({ stage: "a_abordar" }, { activeListings: 3, subscription: "active" }, now), "assinante");
    assert.equal(cardStage({ stage: "a_abordar" }, { activeListings: 3, subscription: "past_due" }, now), "assinante");
    assert.equal(cardStage({ stage: "a_abordar" }, { activeListings: 0, subscription: "canceled" }, now), "cancelou");
  });
});

describe("Quem entra na área Comercial", () => {
  function guardFor(user?: { role: string; status: string }) {
    const prisma = { user: { findUnique: async () => user ?? null } } as unknown as PrismaService;
    const context = { switchToHttp: () => ({ getRequest: () => ({ user: { id: "u1" } }) }) } as unknown as ExecutionContext;
    return new SalesGuard(prisma).canActivate(context);
  }
  test("vendedor e admin ativos entram", async () => {
    assert.equal(await guardFor({ role: "sales", status: "active" }), true);
    assert.equal(await guardFor({ role: "admin", status: "active" }), true);
  });
  test("lojista, comprador e vendedor suspenso não entram", async () => {
    await assert.rejects(guardFor({ role: "partner_owner", status: "active" }), /comercial/i);
    await assert.rejects(guardFor({ role: "buyer", status: "active" }), /comercial/i);
    await assert.rejects(guardFor({ role: "sales", status: "suspended" }), /comercial/i);
  });
});

const withDb = Boolean(process.env.DATABASE_URL);

describe("Funil comercial (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const service = new SalesService(prisma);
  const tag = `com-${Date.now()}`;
  const base = String(Date.now()).slice(-8);
  // CNPJ válido (com dígitos verificadores) a partir de 12 dígitos.
  const cnpj = (n: number) => {
    const digits = `${base}${String(n).padStart(4, "0")}`.split("").map(Number);
    for (const weights of [[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]]) {
      const sum = weights.reduce((acc, w, i) => acc + w * digits[i]!, 0);
      const rest = sum % 11;
      digits.push(rest < 2 ? 0 : 11 - rest);
    }
    return digits.join("");
  };
  const ids = { seller: "", sellerCode: "", other: "", owners: [] as string[], partners: [] as string[], prospects: [] as string[], plan: "" };

  async function partnerSignup(type: "dealership" | "real_estate_agency", document: string) {
    const owner = (await prisma.user.create({ data: { name: `Dono ${tag}`, email: `dono${ids.owners.length}-${tag}@teste.local`, role: "partner_owner", phone: "31977776666" } })).id;
    ids.owners.push(owner);
    const partner = (await prisma.partner.create({ data: { ownerUserId: owner, type, legalName: `Empresa ${ids.owners.length} ${tag}`, document, slug: `${tag}-${ids.owners.length}`, city: "Belo Horizonte", state: "MG" } })).id;
    ids.partners.push(partner);
    return partner;
  }
  const cardOf = async (filter: (c: { partnerId?: string; id: string }) => boolean, segment?: "vehicle" | "property") =>
    (await service.board(ids.seller, { segment })).cards.find(filter);

  before(async () => {
    const member = await service.createMember({ name: "Vendedora", email: `vendedora-${tag}@teste.local` });
    ids.seller = member.id;
    ids.sellerCode = member.salesCode;
    ids.other = (await service.createMember({ name: "Outro", email: `outro-${tag}@teste.local` })).id;
    ids.plan = (await prisma.plan.findFirst({ where: { audience: "vehicle", active: true } }))?.id ?? "";
  });

  after(async () => {
    await prisma.partnerSocio.deleteMany({ where: { partnerId: { in: ids.partners } } });
    await prisma.salesNote.deleteMany({ where: { prospect: { OR: [{ id: { in: ids.prospects } }, { partnerId: { in: ids.partners } }] } } });
    await prisma.salesProspect.deleteMany({ where: { OR: [{ id: { in: ids.prospects } }, { partnerId: { in: ids.partners } }] } });
    await prisma.subscriptionPayment.deleteMany({ where: { partnerId: { in: ids.partners } } });
    await prisma.subscription.deleteMany({ where: { partnerId: { in: ids.partners } } });
    await prisma.listing.deleteMany({ where: { partnerId: { in: ids.partners } } });
    await prisma.partner.deleteMany({ where: { id: { in: ids.partners } } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.seller, ids.other, ...ids.owners] } } });
    await prisma.$disconnect();
  });

  test("admin cria o vendedor: papel comercial e código do link", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ids.seller } });
    assert.equal(user.role, "sales");
    assert.match(ids.sellerCode, /^[A-Z0-9]{6,12}$/);
  });

  test("vendedor cadastra empresa a prospectar; telefone fica criptografado", async () => {
    const created = await service.createProspect(ids.seller, {
      name: `Auto Center ${tag}`,
      segment: "vehicle",
      city: "Contagem",
      state: "MG",
      contactName: "Carlos",
      phone: "31988887777",
      email: "carlos@autocenter.local",
      cnpj: cnpj(1),
    });
    ids.prospects.push(created.id);
    const raw = await prisma.$queryRaw<Array<{ phone: string }>>`SELECT phone FROM sales_prospects WHERE id = ${created.id}`;
    assert.match(raw[0]?.phone ?? "", /^enc:v1:/);
    const card = await cardOf((c) => c.id === created.id, "vehicle");
    assert.equal(card?.stage, "a_abordar");
    assert.equal(card?.ownerId, ids.seller);
    assert.equal(card?.phone, "31988887777");
  });

  test("move entre etapas manuais e registra na linha do tempo; não pula para 'assinante' à mão", async () => {
    const id = ids.prospects[0]!;
    await service.move(ids.seller, id, { stage: "em_contato" });
    assert.equal((await cardOf((c) => c.id === id))?.stage, "em_contato");
    await assert.rejects(service.move(ids.seller, id, { stage: "assinante" as never }), /sozinho|site/i);
    const detail = await service.detail(id);
    assert.ok(detail.notes.some((n) => n.kind === "stage" && /Em contato/.test(n.body)));
  });

  test("perdida exige motivo", async () => {
    const extra = await service.createProspect(ids.seller, { name: `Imob Perdida ${tag}`, segment: "property", city: "BH", state: "MG" });
    ids.prospects.push(extra.id);
    await assert.rejects(service.move(ids.seller, extra.id, { stage: "perdida" }), /motivo/i);
    await service.move(ids.seller, extra.id, { stage: "perdida", lostReason: "Já anuncia em outro lugar e não quer trocar." });
    assert.equal((await cardOf((c) => c.id === extra.id))?.stage, "perdida");
  });

  test("empresa que se cadastra com o mesmo CNPJ cai no card do vendedor e anda sozinha", async () => {
    const partner = await partnerSignup("dealership", cnpj(1));
    await service.linkSignup(partner);
    const card = await cardOf((c) => c.partnerId === partner, "vehicle");
    assert.equal(card?.id, ids.prospects[0], "é o mesmo card que o vendedor cadastrou");
    assert.equal(card?.stage, "cadastrou");
    assert.equal(card?.ownerId, ids.seller);
    assert.ok(card?.trialDaysLeft && card.trialDaysLeft > 80);
    await assert.rejects(service.move(ids.seller, card!.id, { stage: "em_contato" }), /sozinho|site/i);

    await prisma.listing.create({
      data: { type: "vehicle", ownerUserId: ids.owners[0]!, partnerId: partner, title: `Carro ${tag}`, description: "teste", price: 50000, city: "BH", state: "MG", status: "active" },
    });
    assert.equal((await cardOf((c) => c.partnerId === partner))?.stage, "publicou");

    if (ids.plan) {
      const now = new Date();
      await prisma.subscription.create({ data: { partnerId: partner, planId: ids.plan, status: "active", currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000) } });
      await prisma.subscriptionPayment.create({ data: { stripeInvoiceId: `in_${tag}`, partnerId: partner, partnerType: "dealership", amount: 149, paidAt: now } });
      const paid = await cardOf((c) => c.partnerId === partner);
      assert.equal(paid?.stage, "assinante");
      assert.ok(paid?.planName);
      assert.ok((paid?.monthlyValue ?? 0) > 0);
    }
  });

  test("cadastro pelo link do vendedor entra na carteira dele", async () => {
    const partner = await partnerSignup("real_estate_agency", cnpj(2));
    await service.linkSignup(partner, ids.sellerCode);
    const card = await cardOf((c) => c.partnerId === partner, "property");
    assert.equal(card?.ownerId, ids.seller);
    assert.equal(card?.source, "link");
  });

  test("cadastro direto pelo site aparece sem dono, em Imóveis e no Consolidado", async () => {
    const partner = await partnerSignup("real_estate_agency", cnpj(3));
    const inProperty = await cardOf((c) => c.partnerId === partner, "property");
    assert.ok(inProperty, "entra sozinho no quadro");
    assert.equal(inProperty?.ownerId, undefined);
    assert.equal(await cardOf((c) => c.partnerId === partner, "vehicle"), undefined, "não aparece em Veículos");
    assert.ok(await cardOf((c) => c.partnerId === partner), "aparece no Consolidado");
  });

  test("empresa apagada do site: o card que veio do site some do quadro", async () => {
    const partner = await partnerSignup("real_estate_agency", cnpj(4));
    const card = await cardOf((c) => c.partnerId === partner);
    assert.ok(card);
    await prisma.partner.delete({ where: { id: partner } });
    ids.partners.splice(ids.partners.indexOf(partner), 1);
    assert.equal(await cardOf((c) => c.id === card!.id), undefined);
  });

  test("sócios na ficha: aniversário preenchido à mão (DD/MM) e sócio novo", async () => {
    const partner = ids.partners[0]!;
    await prisma.partnerSocio.create({ data: { partnerId: partner, name: "MARIA DA SILVA", role: "Sócio-Administrador" } });
    const card = (await cardOf((c) => c.partnerId === partner))!;
    let detail = await service.detail(card.id);
    const maria = detail.socios.find((s) => s.name === "MARIA DA SILVA");
    assert.ok(maria);
    await assert.rejects(service.setSocioBirthday(ids.seller, maria!.id, "31/02"), /data/i);
    await service.setSocioBirthday(ids.seller, maria!.id, "07/09");
    await service.addSocio(ids.seller, card.id, { name: "Pedro Gerente", birthday: "15/03" });
    detail = await service.detail(card.id);
    assert.equal(detail.socios.find((s) => s.name === "MARIA DA SILVA")?.birthday, "07/09");
    assert.equal(detail.socios.find((s) => s.name === "Pedro Gerente")?.source, "manual");
    await assert.rejects(service.addSocio(ids.seller, ids.prospects[1]!, { name: "Sem empresa" }), /cadastr/i);
  });

  test("anotação, próximo contato e assumir o card", async () => {
    const id = ids.prospects[1]!;
    await service.addNote(ids.other, id, "Liguei, pediu retorno semana que vem.");
    await service.setNextContact(ids.other, id, new Date("2026-11-10T13:00:00Z"));
    await service.assign(ids.other, id);
    const detail = await service.detail(id);
    assert.equal(detail.card.ownerId, ids.other);
    assert.equal(detail.card.nextContactAt, "2026-11-10T13:00:00.000Z");
    assert.ok(detail.notes.some((n) => n.body.includes("pediu retorno")));
  });

  test("metas do mês do vendedor", async () => {
    const goals = await service.goals(ids.seller, new Date());
    // Saiu de "a abordar" (para em contato, interessada ou perdida) = abordagem.
    assert.equal(goals.approaches, 2, "a Auto Center (em contato) e a imobiliária (perdida)");
    assert.equal(goals.signups, 2, "duas empresas da carteira se cadastraram no mês");
    if (ids.plan) assert.equal(goals.newSubscribers, 1);
  });
});

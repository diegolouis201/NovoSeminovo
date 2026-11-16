import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { JORNADA_MARCOS, JORNADA_NIVEIS, JORNADA_PREMISSAS_PADRAO, JornadaPremissasSchema } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { montarJornada } from "./jornada-regras";
import { JornadaService } from "./jornada.service";

// Jornada do Hub: marcos de receita e de clientes, valuation e metas de
// seguidores, contra os números reais do banco.

const zero = { assinaturas: 0, planosAnuncio30d: 0, empresas: 0, particulares: 0 };
const hoje = new Date("2026-11-16T12:00:00Z");

describe("Jornada: contas dos marcos", () => {
  test("lista fixa de 19 marcos, cada um com nome de nível", () => {
    assert.equal(JORNADA_MARCOS.length, 19);
    assert.equal(JORNADA_NIVEIS.length, JORNADA_MARCOS.length);
    // Atuação nacional: nenhum nível chama a empresa de regional.
    assert.ok(JORNADA_NIVEIS.every((n) => !/regional/i.test(n)), "sem 'regional' nos níveis");
    assert.equal(JORNADA_NIVEIS.at(9), "Liderança");
    assert.equal(JORNADA_MARCOS[0], 10);
    assert.equal(JORNADA_MARCOS.at(-1), 100_000);
  });

  test("aba Receita: R$ 10.000 com ticket de R$ 200 = 50 clientes (exemplo do Diego)", () => {
    const j = montarJornada(zero, JORNADA_PREMISSAS_PADRAO, hoje);
    const m = j.receita.find((x) => x.alvo === 10_000)!;
    assert.equal(m.clientes, 50);
    assert.equal(m.receitaMensal, 10_000);
    assert.equal(m.receitaAnual, 120_000);
    assert.equal(m.valuation, 600_000, "receita x 12 x 5");
    assert.equal(m.nome, "Escala");
    assert.equal(j.receita.length, 19);
  });

  test("aba Receita arredonda clientes para cima", () => {
    const j = montarJornada(zero, JORNADA_PREMISSAS_PADRAO, hoje);
    assert.equal(j.receita.find((x) => x.alvo === 10)!.clientes, 1, "R$ 10 / R$ 200 = 0,05 -> 1 cliente");
    assert.equal(j.receita.find((x) => x.alvo === 2_500)!.clientes, 13, "R$ 2.500 / R$ 200 = 12,5 -> 13");
    const j2 = montarJornada(zero, { ...JORNADA_PREMISSAS_PADRAO, ticketMedio: 149.9 }, hoje);
    assert.equal(j2.receita.find((x) => x.alvo === 1_000)!.clientes, 7, "R$ 1.000 / R$ 149,90 = 6,67 -> 7");
  });

  test("aba Clientes: N clientes x ticket = receita mensal", () => {
    const j = montarJornada(zero, JORNADA_PREMISSAS_PADRAO, hoje);
    const m = j.clientes.find((x) => x.alvo === 100)!;
    assert.equal(m.clientes, 100);
    assert.equal(m.receitaMensal, 20_000);
    assert.equal(m.receitaAnual, 240_000);
    assert.equal(m.valuation, 1_200_000);
    const j2 = montarJornada(zero, { ...JORNADA_PREMISSAS_PADRAO, ticketMedio: 149.9 }, hoje);
    assert.equal(j2.clientes.find((x) => x.alvo === 10)!.receitaMensal, 1_499, "sem erro de centavos");
  });

  test("valuation usa o múltiplo editável", () => {
    const j = montarJornada(zero, { ...JORNADA_PREMISSAS_PADRAO, multiploValuation: 2.5 }, hoje);
    assert.equal(j.receita.find((x) => x.alvo === 10_000)!.valuation, 300_000);
  });

  test("metas de seguidores = clientes do marco x seguidores por cliente (para cima)", () => {
    const j = montarJornada(zero, JORNADA_PREMISSAS_PADRAO, hoje);
    assert.deepEqual(j.receita.find((x) => x.alvo === 10_000)!.seguidores, { instagram: 1_000, facebook: 500, tiktok: 500, youtube: 100, linkedin: 100 });
    assert.deepEqual(j.clientes.find((x) => x.alvo === 10)!.seguidores, { instagram: 200, facebook: 100, tiktok: 100, youtube: 20, linkedin: 20 });
    const j2 = montarJornada(zero, { ...JORNADA_PREMISSAS_PADRAO, seguidoresPorCliente: { instagram: 0.5, facebook: 0, tiktok: 1, youtube: 1, linkedin: 1 } }, hoje);
    assert.equal(j2.clientes.find((x) => x.alvo === 10)!.seguidores.instagram, 5);
    assert.equal(j2.receita.find((x) => x.alvo === 2_500)!.seguidores.instagram, 7, "13 clientes x 0,5 = 6,5 -> 7");
  });

  test("status contra os números reais: conquistado, próximo (com quanto falta) e futuro", () => {
    // R$ 1.200 de receita (2 lojas a R$ 450 + R$ 300 de planos) e 5 clientes.
    const j = montarJornada({ assinaturas: 900, planosAnuncio30d: 300, empresas: 2, particulares: 3 }, JORNADA_PREMISSAS_PADRAO, hoje);
    const st = (lista: typeof j.receita) => lista.slice(0, 5).map((m) => m.status);
    assert.deepEqual(st(j.receita), ["conquistado", "conquistado", "conquistado", "proximo", "futuro"]);
    const prox = j.receita.find((m) => m.status === "proximo")!;
    assert.equal(prox.alvo, 2_500);
    assert.equal(prox.falta, 1_300);
    assert.equal(prox.progressoPct, 48);
    assert.equal(j.receita.filter((m) => m.status === "proximo").length, 1);
    assert.equal(j.receita[0]!.falta, undefined, "só o próximo marco tem barra");

    assert.deepEqual(st(j.clientes), ["proximo", "futuro", "futuro", "futuro", "futuro"]);
    assert.equal(j.clientes[0]!.falta, 5, "faltam 5 clientes para 10");
    assert.equal(j.clientes[0]!.progressoPct, 50);
  });

  test("números atuais: receita, clientes, ticket real e valuation", () => {
    const j = montarJornada({ assinaturas: 900, planosAnuncio30d: 300, empresas: 2, particulares: 3 }, JORNADA_PREMISSAS_PADRAO, hoje);
    assert.equal(j.atual.receitaMensal, 1_200);
    assert.equal(j.atual.clientes, 5);
    assert.equal(j.atual.ticketMedio, 240);
    assert.equal(j.atual.valuation, 72_000, "1.200 x 12 x 5");
    assert.equal(j.geradoEm, hoje.toISOString());
  });

  test("sem clientes: ticket real vazio, nada conquistado, primeiro marco é o próximo", () => {
    const j = montarJornada(zero, JORNADA_PREMISSAS_PADRAO, hoje);
    assert.equal(j.atual.ticketMedio, null);
    assert.equal(j.atual.valuation, 0);
    assert.equal(j.receita[0]!.status, "proximo");
    assert.equal(j.receita[0]!.progressoPct, 0);
    assert.equal(j.receita[0]!.falta, 10);
    assert.ok(j.receita.slice(1).every((m) => m.status === "futuro"));
  });

  test("tudo conquistado: nenhum marco próximo", () => {
    const j = montarJornada({ assinaturas: 200_000, planosAnuncio30d: 0, empresas: 100_000, particulares: 0 }, JORNADA_PREMISSAS_PADRAO, hoje);
    assert.ok(j.receita.every((m) => m.status === "conquistado"));
    assert.ok(j.clientes.every((m) => m.status === "conquistado"));
  });

  test("seguidores atuais: só o que a rede informa; sem rede ligada fica vazio (nunca inventado)", () => {
    const j = montarJornada(zero, JORNADA_PREMISSAS_PADRAO, hoje);
    assert.deepEqual(j.atual.seguidores, { instagram: null, facebook: null, tiktok: null, youtube: null, linkedin: null });
    const j2 = montarJornada({ ...zero, seguidores: { instagram: 1234 } }, JORNADA_PREMISSAS_PADRAO, hoje);
    assert.equal(j2.atual.seguidores.instagram, 1234);
    assert.equal(j2.atual.seguidores.facebook, null);
  });
});

describe("Jornada: premissas validadas", () => {
  const ok = JORNADA_PREMISSAS_PADRAO;
  test("faixas: ticket 1 a 100.000, múltiplo 0,5 a 50, seguidores 0 a 10.000", () => {
    assert.equal(JornadaPremissasSchema.safeParse(ok).success, true);
    assert.equal(JornadaPremissasSchema.safeParse({ ...ok, ticketMedio: 0.5 }).success, false);
    assert.equal(JornadaPremissasSchema.safeParse({ ...ok, ticketMedio: 100_001 }).success, false);
    assert.equal(JornadaPremissasSchema.safeParse({ ...ok, multiploValuation: 0.4 }).success, false);
    assert.equal(JornadaPremissasSchema.safeParse({ ...ok, multiploValuation: 51 }).success, false);
    assert.equal(JornadaPremissasSchema.safeParse({ ...ok, seguidoresPorCliente: { ...ok.seguidoresPorCliente, tiktok: -1 } }).success, false);
    assert.equal(JornadaPremissasSchema.safeParse({ ...ok, seguidoresPorCliente: { ...ok.seguidoresPorCliente, youtube: 10_001 } }).success, false);
    assert.equal(JornadaPremissasSchema.safeParse({ ...ok, ticketMedio: Number.NaN }).success, false);
    assert.equal(JornadaPremissasSchema.safeParse({ ...ok, ticketMedio: Number.POSITIVE_INFINITY }).success, false);
  });

  test("texto no lugar de número (SQL ou script) e campos a mais são recusados", () => {
    assert.equal(JornadaPremissasSchema.safeParse({ ...ok, ticketMedio: "200; DROP TABLE users" }).success, false);
    assert.equal(JornadaPremissasSchema.safeParse({ ...ok, multiploValuation: "<script>alert(1)</script>" }).success, false);
    assert.equal(JornadaPremissasSchema.safeParse({ ...ok, extra: "x" }).success, false);
    assert.equal(JornadaPremissasSchema.safeParse({ ...ok, seguidoresPorCliente: { ...ok.seguidoresPorCliente, orkut: 5 } }).success, false);
  });
});

describe("Jornada: rotas e permissões", () => {
  const { JornadaController } = require("./jornada.controller") as typeof import("./jornada.controller");
  const salvos: unknown[] = [];
  const ctrl = new JornadaController({ ler: async () => ({ ok: true }), salvarPremissas: async (p: unknown) => void salvos.push(p) } as never);
  const permissao = (metodo: "ver" | "salvar") => Reflect.getMetadata("hub:permission", JornadaController.prototype[metodo]);

  test("todo mundo da equipe vê; só o dono (equipe) edita as premissas", () => {
    assert.equal(permissao("ver"), "entrar");
    assert.equal(permissao("salvar"), "equipe");
    const guards = Reflect.getMetadata("__guards__", JornadaController) as { name: string }[];
    assert.deepEqual(guards.map((g) => g.name), ["JwtAuthGuard", "HubGuard"]);
  });

  test("salvar valida o corpo antes de chegar no serviço", async () => {
    await assert.rejects(ctrl.salvar({ ...JORNADA_PREMISSAS_PADRAO, ticketMedio: 0 }), /Ticket médio/);
    await assert.rejects(ctrl.salvar({ ...JORNADA_PREMISSAS_PADRAO, ticketMedio: "<img src=x onerror=alert(1)>" }), /Use só números/);
    await assert.rejects(ctrl.salvar({ ticketMedio: 200 }), /Preencha todos os campos/);
    assert.equal(salvos.length, 0);
    assert.deepEqual(await ctrl.salvar(JORNADA_PREMISSAS_PADRAO), { ok: true });
    assert.deepEqual(salvos, [JORNADA_PREMISSAS_PADRAO]);
  });
});

const withDb = Boolean(process.env.DATABASE_URL);

describe("Jornada no banco: números reais e premissas salvas", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const jornada = new JornadaService(prisma);
  const tag = `jornada-${Date.now()}`;
  const ids = { owner: "", pf: "", partner: "", partnerFree: "", plan: "", listing: "" };
  let salvoAntes: unknown = null;

  before(async () => {
    salvoAntes = (await prisma.mktSetting.findUnique({ where: { chave: "jornada" } }))?.valor ?? null;
    await prisma.mktSetting.deleteMany({ where: { chave: "jornada" } });
  });

  after(async () => {
    await prisma.listingBoostPurchase.deleteMany({ where: { userId: { in: [ids.pf, ids.owner].filter(Boolean) } } });
    await prisma.listing.deleteMany({ where: { id: ids.listing } });
    await prisma.subscription.deleteMany({ where: { planId: ids.plan } });
    await prisma.partner.deleteMany({ where: { id: { in: [ids.partner, ids.partnerFree].filter(Boolean) } } });
    await prisma.plan.deleteMany({ where: { id: ids.plan } });
    await prisma.user.deleteMany({ where: { email: { contains: tag } } });
    await prisma.mktSetting.deleteMany({ where: { chave: "jornada" } });
    if (salvoAntes) await prisma.mktSetting.create({ data: { chave: "jornada", valor: salvoAntes as object } });
    await prisma.$disconnect();
  });

  test("sem nada salvo: premissas padrão", async () => {
    const j = await jornada.ler();
    assert.deepEqual(j.premissas, JORNADA_PREMISSAS_PADRAO);
    assert.equal(j.premissasPadrao, true);
    assert.equal(j.receita.find((m) => m.alvo === 10_000)!.clientes, 50);
  });

  test("salva, lê de volta e valor estragado no banco volta ao padrão", async () => {
    const novo = { ticketMedio: 250, multiploValuation: 4, seguidoresPorCliente: { instagram: 30, facebook: 5, tiktok: 0, youtube: 1, linkedin: 3 } };
    await jornada.salvarPremissas(novo);
    const j = await jornada.ler();
    assert.deepEqual(j.premissas, novo);
    assert.equal(j.premissasPadrao, false);
    assert.equal(j.receita.find((m) => m.alvo === 10_000)!.clientes, 40);
    await prisma.mktSetting.update({ where: { chave: "jornada" }, data: { valor: { ticketMedio: "lixo" } } });
    assert.deepEqual((await jornada.ler()).premissas, JORNADA_PREMISSAS_PADRAO);
    await prisma.mktSetting.deleteMany({ where: { chave: "jornada" } });
  });

  test("receita = assinaturas pagas ativas + planos de anúncio pagos em 30 dias; clientes = lojas pagantes + particulares", async () => {
    const antes = (await jornada.ler()).atual;
    const now = new Date();
    const fim = new Date(now.getTime() + 30 * 86_400_000);
    ids.owner = (await prisma.user.create({ data: { name: "Dona", email: `dona-${tag}@teste.local`, role: "partner_owner" } })).id;
    const owner2 = (await prisma.user.create({ data: { name: "Dono 2", email: `dono2-${tag}@teste.local`, role: "partner_owner" } })).id;
    ids.pf = (await prisma.user.create({ data: { name: "Particular", email: `pf-${tag}@teste.local` } })).id;
    ids.plan = (await prisma.plan.create({ data: { name: `Plano ${tag}`, maxActiveListings: 10, priceMonth: 450, active: false } })).id;
    const loja = (owner: string, slug: string) => ({ ownerUserId: owner, type: "dealership" as const, legalName: `Loja ${slug}`, document: `${Date.now()}`.slice(-14).padStart(14, "1"), slug, city: "BH", state: "MG" });
    ids.partner = (await prisma.partner.create({ data: loja(ids.owner, `${tag}-a`) })).id;
    ids.partnerFree = (await prisma.partner.create({ data: { ...loja(owner2, `${tag}-b`), document: "99888777000166" } })).id;
    // Paga pelo Stripe: conta. Ativada sem cobrança (sem paymentProviderRef): não conta.
    await prisma.subscription.create({ data: { partnerId: ids.partner, planId: ids.plan, status: "active", currentPeriodStart: now, currentPeriodEnd: fim, paymentProviderRef: `sub_${tag}` } });
    await prisma.subscription.create({ data: { partnerId: ids.partnerFree, planId: ids.plan, status: "active", currentPeriodStart: now, currentPeriodEnd: fim } });
    ids.listing = (await prisma.listing.create({ data: { type: "vehicle", ownerUserId: ids.pf, title: `Gol ${tag}`, description: "teste", price: 30000, city: "BH", state: "MG", status: "active" } })).id;
    // Dois planos do mesmo particular nos últimos 30 dias (1 cliente) e um antigo (fora).
    await prisma.listingBoostPurchase.create({ data: { listingId: ids.listing, userId: ids.pf, tier: "turbo", amount: 69.9, status: "paid", paidAt: now } });
    await prisma.listingBoostPurchase.create({ data: { listingId: ids.listing, userId: ids.pf, tier: "flex", amount: 39.9, status: "paid", paidAt: new Date(now.getTime() - 10 * 86_400_000) } });
    await prisma.listingBoostPurchase.create({ data: { listingId: ids.listing, userId: ids.pf, tier: "nitro", amount: 129.9, status: "paid", paidAt: new Date(now.getTime() - 40 * 86_400_000) } });
    await prisma.listingBoostPurchase.create({ data: { listingId: ids.listing, userId: ids.pf, tier: "nitro", amount: 129.9, status: "pending" } });

    const depois = (await jornada.ler()).atual;
    const cents = (v: number) => Math.round(v * 100) / 100;
    assert.equal(cents(depois.assinaturas - antes.assinaturas), 450);
    assert.equal(cents(depois.planosAnuncio30d - antes.planosAnuncio30d), 109.8);
    assert.equal(cents(depois.receitaMensal - antes.receitaMensal), 559.8);
    assert.equal(depois.empresas - antes.empresas, 1);
    assert.equal(depois.particulares - antes.particulares, 1);
    assert.equal(depois.clientes - antes.clientes, 2);
    assert.equal(depois.ticketMedio, cents(depois.receitaMensal / depois.clientes));
  });
});

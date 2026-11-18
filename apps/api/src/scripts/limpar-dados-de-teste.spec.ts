import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { photoVariantUrl } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { getPhotoStorage, UPLOADS_DIR, type PhotoStorage } from "../common/storage";
import { limparDadosDeTeste, mascararEmail } from "./limpar-dados-de-teste";

// Limpeza das contas de teste antes dos cadastros reais. Precisa do
// PostgreSQL local (DATABASE_URL). Cada teste limita a limpeza às contas que
// ele mesmo criou (somenteUsuarios), para não apagar os dados de outros
// testes que rodam ao mesmo tempo no mesmo banco.
const withDb = Boolean(process.env.DATABASE_URL);

describe("mascararEmail", () => {
  test("mostra só a primeira letra e o domínio", () => {
    assert.equal(mascararEmail("diego@gmail.com"), "d***@gmail.com");
    assert.equal(mascararEmail("x"), "***");
  });
});

describe("Limpar dados de teste (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const inicio = new Date();
  const tag = `limpeza-${Date.now()}`;
  const ids = {
    admin: "",
    hub: "",
    sales: "",
    lojista: "",
    comprador: "",
    pagante: "",
    assinante: "",
    plan: "",
    partner: "",
    partnerAssinante: "",
    listing: "",
    listingPago: "",
    listingAdmin: "",
    prospect: "",
    crmOrder: "",
    deal: "",
    financingLead: "",
    subscriptionPayment: "",
    marketingContact: "",
    agentConversation: "",
    lead: "",
    leadAdmin: "",
    affiliate: "",
  };
  const files: string[] = [];
  const allUsers = () => [ids.admin, ids.hub, ids.sales, ids.lojista, ids.comprador, ids.pagante, ids.assinante];

  const makeUser = (name: string, role: "admin" | "buyer" | "sales" | "partner_owner" | "individual_seller") =>
    prisma.user.create({ data: { name, email: `${name}-${tag}@teste.local`, role } });
  const makeListing = (ownerUserId: string, title: string, partnerId?: string) =>
    prisma.listing.create({
      data: { type: "vehicle", ownerUserId, partnerId, title, description: "Anúncio de teste para limpeza", price: 50000, city: "BH", state: "MG", status: "active" },
    });
  const writeUpload = async (ext: string) => {
    const name = `${randomUUID()}.${ext}`;
    await mkdir(UPLOADS_DIR, { recursive: true });
    await writeFile(join(UPLOADS_DIR, name), Buffer.from("teste"));
    const url = `/uploads/${name}`;
    files.push(url);
    return url;
  };
  const fileExists = (url: string) => existsSync(join(UPLOADS_DIR, url.slice("/uploads/".length)));
  const silent = () => undefined;

  before(async () => {
    ids.admin = (await makeUser("admin", "admin")).id;
    ids.hub = (await makeUser("equipe-hub", "buyer")).id;
    await prisma.hubMember.create({ data: { userId: ids.hub, profile: "marketing" } });
    ids.sales = (await makeUser("vendedor", "sales")).id;
    ids.lojista = (await makeUser("lojista", "partner_owner")).id;
    ids.comprador = (await makeUser("comprador", "buyer")).id;
    ids.pagante = (await makeUser("pagante", "individual_seller")).id;
    ids.assinante = (await makeUser("assinante", "partner_owner")).id;
    await prisma.user.update({ where: { id: ids.lojista }, data: { avatarUrl: await writeUpload("jpg") } });

    ids.plan = (await prisma.plan.create({ data: { name: `Plano ${tag}`, maxActiveListings: 10, priceMonth: 199 } })).id;
    ids.partner = (
      await prisma.partner.create({
        data: { ownerUserId: ids.lojista, type: "dealership", legalName: `Loja ${tag}`, document: "00000000000100", slug: `loja-${tag}`, logoUrl: await writeUpload("png") },
      })
    ).id;
    await prisma.partnerMember.create({ data: { partnerId: ids.partner, userId: ids.lojista, role: "owner" } });
    await prisma.subscription.create({
      data: { partnerId: ids.partner, planId: ids.plan, status: "canceled", currentPeriodStart: new Date(), currentPeriodEnd: new Date(), paymentProviderRef: "sub_teste_cancelada" },
    });
    await prisma.integrationFeed.create({ data: { partnerId: ids.partner, url: "https://exemplo.invalid/feed.xml", format: "vrsync" } });
    await prisma.partnerSocio.create({ data: { partnerId: ids.partner, name: "Sócio de teste" } });
    await prisma.npsResponse.create({ data: { partnerId: ids.partner, userId: ids.lojista, score: 9 } });
    ids.subscriptionPayment = (
      await prisma.subscriptionPayment.create({ data: { stripeInvoiceId: `in_${tag}`, partnerId: ids.partner, partnerType: "dealership", amount: 199, paidAt: new Date() } })
    ).id;

    // Anúncio de teste da loja, com fotos (original + cópias WebP) e vídeo no disco.
    ids.listing = (await makeListing(ids.lojista, "Carro de teste", ids.partner)).id;
    const photoUrl = await writeUpload("jpg");
    for (const w of [320, 640]) {
      const variant = photoVariantUrl(photoUrl, w);
      await writeFile(join(UPLOADS_DIR, variant.slice("/uploads/".length)), Buffer.from("webp"));
      files.push(variant);
    }
    await prisma.photo.create({ data: { listingId: ids.listing, url: photoUrl, variantWidths: [320, 640] } });
    await prisma.listing.update({ where: { id: ids.listing }, data: { videoUrl: await writeUpload("mp4") } });
    await prisma.listingBoostPurchase.create({ data: { listingId: ids.listing, userId: ids.lojista, tier: "turbo", amount: 19.9, status: "pending" } });

    // Comprador de teste: conversa, favorito, busca salva, avisos, avaliação, afiliado.
    const conversation = await prisma.conversation.create({ data: { listingId: ids.listing, buyerId: ids.comprador, sellerUserId: ids.lojista } });
    await prisma.message.create({ data: { conversationId: conversation.id, senderId: ids.comprador, body: "Ainda está disponível?" } });
    await prisma.favorite.create({ data: { userId: ids.comprador, listingId: ids.listing } });
    await prisma.savedSearch.create({ data: { userId: ids.comprador, type: "vehicle", filters: {} } });
    await prisma.notification.create({ data: { userId: ids.comprador, type: "teste", payload: {} } });
    await prisma.review.create({ data: { reviewerId: ids.comprador, reviewedPartnerId: ids.partner, rating: 5 } });
    ids.lead = (await prisma.lead.create({ data: { listingId: ids.listing, partnerId: ids.partner, buyerId: ids.comprador, source: "chat" } })).id;
    ids.affiliate = (await prisma.affiliate.create({ data: { userId: ids.comprador, code: `af-${tag}`, channels: "instagram", pixKey: "chave-teste" } })).id;
    await prisma.affiliateCommission.create({
      data: { affiliateId: ids.affiliate, source: "teste", sourceRef: `ref-${tag}`, referredUserId: ids.lojista, description: "teste", baseAmount: 100, rate: 10, amount: 10, availableAt: new Date() },
    });
    await prisma.user.update({ where: { id: ids.sales }, data: { referredByAffiliateId: ids.affiliate } });
    ids.marketingContact = (await prisma.marketingContact.create({ data: { email: `contato-${tag}@teste.local`, userId: ids.comprador, source: "cadastro" } })).id;
    ids.agentConversation = (await prisma.agentConversation.create({ data: { userId: ids.comprador, kind: "buyer", channel: "web" } })).id;

    // Anúncio do admin (fica) com lead de um comprador de teste (lead fica, sem o comprador).
    const partnerAdmin = await prisma.partner.create({ data: { ownerUserId: ids.admin, type: "dealership", legalName: `Loja admin ${tag}`, document: "00000000000200", slug: `loja-admin-${tag}` } });
    ids.listingAdmin = (await makeListing(ids.admin, "Anúncio do admin", partnerAdmin.id)).id;
    ids.leadAdmin = (await prisma.lead.create({ data: { listingId: ids.listingAdmin, partnerId: partnerAdmin.id, buyerId: ids.comprador, source: "form", contactName: "Fulano" } })).id;

    // CRM do Hub: empresa ligada à loja de teste, ordem, dono do card = vendedor.
    // upsert: outro teste rodando ao mesmo tempo pode sincronizar as lojas
    // (SalesService.syncPartners) e criar o card desta loja antes.
    ids.prospect = (
      await prisma.salesProspect.upsert({
        where: { partnerId: ids.partner },
        create: { name: `Empresa ${tag}`, segment: "veiculos", partnerId: ids.partner, ownerId: ids.sales },
        update: { name: `Empresa ${tag}`, ownerId: ids.sales },
      })
    ).id;
    ids.crmOrder = (await prisma.crmOrder.create({ data: { area: "comercial", title: "Ligar", partnerId: ids.partner, prospectId: ids.prospect } })).id;
    await prisma.hubTask.create({ data: { title: "Retornar", dueAt: new Date(), prospectId: ids.prospect, assigneeId: ids.sales, createdById: ids.hub } });

    // Financiamento enviado ao banco (IBS): fica, sem o vínculo com a conta e o anúncio de teste.
    ids.deal = (
      await prisma.financingDeal.create({
        data: {
          listingId: ids.listing,
          buyerUserId: ids.comprador,
          buyerName: "Comprador",
          financingProvider: "credihome",
          assetValue: 50000,
          financedAmount: 40000,
          commissionAmount: 400,
          rebatePercent: 0,
          rebateAmount: 0,
          registeredByUserId: ids.admin,
        },
      })
    ).id;
    ids.financingLead = (
      await prisma.financingLead.create({
        data: { listingId: ids.listing, buyerUserId: ids.comprador, channel: "web", name: "Comprador", phone: "31999990000", assetType: "vehicle", financingDealId: ids.deal },
      })
    ).id;

    // Conta de teste com plano de anúncio PAGO: fica guardada (registro financeiro).
    ids.listingPago = (await makeListing(ids.pagante, "Anúncio com plano pago")).id;
    await prisma.listingBoostPurchase.create({ data: { listingId: ids.listingPago, userId: ids.pagante, tier: "turbo", amount: 69.9, status: "paid", paidAt: new Date() } });

    // Loja de teste com assinatura do Stripe ativa: fica até cancelar no Stripe.
    ids.partnerAssinante = (
      await prisma.partner.create({ data: { ownerUserId: ids.assinante, type: "dealership", legalName: `Loja assinante ${tag}`, document: "00000000000300", slug: `loja-assinante-${tag}` } })
    ).id;
    await prisma.subscription.create({
      data: { partnerId: ids.partnerAssinante, planId: ids.plan, status: "active", currentPeriodStart: new Date(), currentPeriodEnd: new Date(), paymentProviderRef: "sub_teste_ativa" },
    });
  });

  after(async () => {
    const users = allUsers();
    await prisma.opsReport.deleteMany({ where: { kind: "limpeza_dados_teste", createdAt: { gte: inicio } } });
    await prisma.hubTask.deleteMany({ where: { prospectId: ids.prospect } });
    await prisma.crmOrder.deleteMany({ where: { id: ids.crmOrder } });
    await prisma.salesProspect.deleteMany({ where: { id: ids.prospect } });
    await prisma.financingLead.deleteMany({ where: { id: ids.financingLead } });
    await prisma.financingDeal.deleteMany({ where: { id: ids.deal } });
    await prisma.subscriptionPayment.deleteMany({ where: { id: ids.subscriptionPayment } });
    await prisma.marketingContact.deleteMany({ where: { id: ids.marketingContact } });
    await prisma.agentConversation.deleteMany({ where: { id: ids.agentConversation } });
    await prisma.lead.deleteMany({ where: { id: { in: [ids.lead, ids.leadAdmin] } } });
    await prisma.listingBoostPurchase.deleteMany({ where: { userId: { in: users } } });
    await prisma.subscription.deleteMany({ where: { planId: ids.plan } });
    await prisma.listing.deleteMany({ where: { ownerUserId: { in: users } } });
    await prisma.partner.deleteMany({ where: { ownerUserId: { in: users } } });
    await prisma.user.updateMany({ where: { id: { in: users } }, data: { referredByAffiliateId: null } });
    await prisma.affiliateCommission.deleteMany({ where: { affiliateId: ids.affiliate } });
    await prisma.affiliate.deleteMany({ where: { userId: { in: users } } });
    await prisma.hubMember.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.plan.deleteMany({ where: { id: ids.plan } });
    const storage = getPhotoStorage();
    for (const url of files) await storage.remove(url);
    await prisma.$disconnect();
  });

  test("recusa quando não sobra nenhum admin", async () => {
    await assert.rejects(
      limparDadosDeTeste(prisma, { confirmar: false, log: silent, somenteUsuarios: [ids.comprador, ids.lojista] }),
      /nenhuma conta de administrador/i,
    );
  });

  test("simulação (padrão) mostra o plano e não muda nada", async () => {
    const lines: string[] = [];
    const usersBefore = await prisma.user.count({ where: { id: { in: allUsers() } } });
    const result = await limparDadosDeTeste(prisma, { confirmar: false, log: (l) => lines.push(l), somenteUsuarios: allUsers() });
    assert.equal(result.modo, "simulacao");
    assert.deepEqual(new Set(result.mantidas.map((m) => m.id)), new Set([ids.admin, ids.hub, ids.sales]));
    assert.deepEqual(new Set(result.bloqueadas.map((b) => b.id)), new Set([ids.pagante, ids.assinante]));
    assert.equal(result.apagar["Contas (users)"], 2);
    assert.equal(result.apagar["Lojas/imobiliárias (partners)"], 1);
    assert.equal(result.apagar["Anúncios (listings)"], 1);
    assert.equal(result.desvincular["Financiamentos registrados (financing_deals)"], 2);
    assert.equal(result.stripeAtivas, 1);
    assert.ok(result.arquivos.total >= 6);
    const text = lines.join("\n");
    assert.match(text, /SIMULAÇÃO/);
    assert.match(text, /cancele no Stripe antes/);
    assert.match(text, /a\*\*\*@teste\.local/);
    // Nunca o e-mail inteiro de ninguém.
    assert.doesNotMatch(text, new RegExp(tag));
    assert.equal(await prisma.user.count({ where: { id: { in: allUsers() } } }), usersBefore);
    assert.ok(await prisma.listing.findUnique({ where: { id: ids.listing } }));
    assert.ok(files.every(fileExists));
  });

  test("com --confirmar apaga só o que é de teste, desvincula CRM/financiamento e apaga os arquivos", async () => {
    const result = await limparDadosDeTeste(prisma, { confirmar: true, log: silent, somenteUsuarios: allUsers() });
    assert.equal(result.modo, "execucao");

    // Ficam: admin, equipe do Hub, vendedor e as contas bloqueadas por pagamento.
    const remaining = await prisma.user.findMany({ where: { id: { in: allUsers() } }, select: { id: true } });
    assert.deepEqual(new Set(remaining.map((u) => u.id)), new Set([ids.admin, ids.hub, ids.sales, ids.pagante, ids.assinante]));
    assert.ok(await prisma.hubMember.findUnique({ where: { userId: ids.hub } }));
    assert.ok(await prisma.listing.findUnique({ where: { id: ids.listingPago } }));
    assert.ok(await prisma.partner.findUnique({ where: { id: ids.partnerAssinante } }));
    assert.ok(await prisma.listing.findUnique({ where: { id: ids.listingAdmin } }));

    // Saem: loja de teste, anúncio, conversas, favoritos, avisos, afiliado…
    assert.equal(await prisma.partner.count({ where: { id: ids.partner } }), 0);
    assert.equal(await prisma.listing.count({ where: { id: ids.listing } }), 0);
    assert.equal(await prisma.conversation.count({ where: { buyerId: ids.comprador } }), 0);
    assert.equal(await prisma.favorite.count({ where: { userId: ids.comprador } }), 0);
    assert.equal(await prisma.savedSearch.count({ where: { userId: ids.comprador } }), 0);
    assert.equal(await prisma.notification.count({ where: { userId: ids.comprador } }), 0);
    assert.equal(await prisma.review.count({ where: { reviewerId: ids.comprador } }), 0);
    assert.equal(await prisma.lead.count({ where: { id: ids.lead } }), 0);
    assert.equal(await prisma.affiliate.count({ where: { id: ids.affiliate } }), 0);
    assert.equal(await prisma.subscription.count({ where: { partnerId: ids.partner } }), 0);

    // Ficam, sem o vínculo: CRM, financiamento, pagamentos, contatos de marketing.
    const prospect = await prisma.salesProspect.findUniqueOrThrow({ where: { id: ids.prospect } });
    assert.equal(prospect.partnerId, null);
    assert.equal(prospect.ownerId, ids.sales);
    assert.equal((await prisma.crmOrder.findUniqueOrThrow({ where: { id: ids.crmOrder } })).partnerId, null);
    const deal = await prisma.financingDeal.findUniqueOrThrow({ where: { id: ids.deal } });
    assert.equal(deal.listingId, null);
    assert.equal(deal.buyerUserId, null);
    const fl = await prisma.financingLead.findUniqueOrThrow({ where: { id: ids.financingLead } });
    assert.equal(fl.listingId, null);
    assert.equal(fl.buyerUserId, null);
    assert.equal(fl.financingDealId, ids.deal);
    assert.ok(await prisma.subscriptionPayment.findUnique({ where: { id: ids.subscriptionPayment } }));
    assert.equal((await prisma.marketingContact.findUniqueOrThrow({ where: { id: ids.marketingContact } })).userId, null);
    assert.equal((await prisma.agentConversation.findUniqueOrThrow({ where: { id: ids.agentConversation } })).userId, null);
    const leadAdmin = await prisma.lead.findUniqueOrThrow({ where: { id: ids.leadAdmin } });
    assert.equal(leadAdmin.buyerId, null);
    assert.equal(leadAdmin.contactName, "Fulano");
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: ids.sales } })).referredByAffiliateId, null);

    // Arquivos: foto original, cópias WebP, vídeo, logo e avatar apagados do disco.
    assert.ok(files.every((url) => !fileExists(url)), "todos os arquivos de teste saíram do disco");
    assert.equal(result.arquivos.falhas, 0);
  });

  test("rodar de novo não tem nada a fazer", async () => {
    const result = await limparDadosDeTeste(prisma, { confirmar: true, log: silent, somenteUsuarios: allUsers() });
    assert.equal(Object.values(result.apagar).reduce((a, b) => a + b, 0), 0);
    assert.equal(Object.values(result.desvincular).reduce((a, b) => a + b, 0), 0);
    assert.equal(result.arquivos.total, 0);
  });

  test("falha ao apagar arquivo é registrada e não interrompe", async () => {
    const user = await makeUser("avatar-quebrado", "buyer");
    const avatar = await writeUpload("jpg");
    await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: avatar } });
    const real = getPhotoStorage();
    const broken: PhotoStorage = {
      save: (b, n, t) => real.save(b, n, t),
      read: (u) => real.read(u),
      saveVariant: (u, w, b) => real.saveVariant(u, w, b),
      owns: () => true,
      remove: async () => Promise.reject(new Error("disco indisponível")),
    };
    const lines: string[] = [];
    const result = await limparDadosDeTeste(prisma, { confirmar: true, log: (l) => lines.push(l), storage: broken, somenteUsuarios: [ids.admin, user.id] });
    assert.equal(result.arquivos.falhas, 1);
    assert.equal(await prisma.user.count({ where: { id: user.id } }), 0);
    assert.match(lines.join("\n"), /não foi possível apagar/i);
  });
});

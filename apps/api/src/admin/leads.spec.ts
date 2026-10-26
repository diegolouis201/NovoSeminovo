import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { PrismaService } from "../prisma/prisma.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { ConversationsGateway } from "../conversations/conversations.gateway";
import { ConversationsService } from "../conversations/conversations.service";
import { ListingsService } from "../listings/listings.service";
import { AdminLeadsService } from "./leads.service";

// Leads identificados: WhatsApp só com login, equipe da loja conversa com o
// comprador pelo chat a partir do card, e o admin vê todos os leads com o
// funil. Precisa do PostgreSQL local (DATABASE_URL).
const withDb = Boolean(process.env.DATABASE_URL);

describe("Leads: identificação, chat da equipe e painel do admin (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const notifications = { notify: async () => undefined } as unknown as NotificationsService;
  const gateway = { emitNewMessage: () => undefined } as unknown as ConversationsGateway;
  const conversations = new ConversationsService(prisma, notifications, gateway);
  const adminLeads = new AdminLeadsService(prisma);
  const tag = `teste-leads-${Date.now()}`;
  const ids = { owner: "", member: "", outsider: "", buyer: "", partner: "", listing: "" };

  before(async () => {
    const makeUser = async (name: string) =>
      (await prisma.user.create({ data: { name, email: `${name}-${tag}@teste.local`, role: "buyer", phone: "31999990000" } })).id;
    ids.owner = await makeUser("dono");
    ids.member = await makeUser("vendedor");
    ids.outsider = await makeUser("outro");
    ids.buyer = await makeUser("comprador");
    ids.partner = (
      await prisma.partner.create({
        data: { ownerUserId: ids.owner, type: "dealership", legalName: `Loja ${tag}`, document: tag, slug: tag },
      })
    ).id;
    await prisma.partnerMember.create({ data: { partnerId: ids.partner, userId: ids.member, role: "agent" } });
    ids.listing = (
      await prisma.listing.create({
        data: {
          type: "vehicle",
          ownerUserId: ids.owner,
          partnerId: ids.partner,
          title: `Carro ${tag}`,
          description: "Anúncio de teste de leads",
          price: 50000,
          city: "BH",
          state: "MG",
          status: "active",
          showPhone: true,
        },
      })
    ).id;
  });

  after(async () => {
    const users = [ids.owner, ids.member, ids.outsider, ids.buyer];
    await prisma.message.deleteMany({ where: { conversation: { listingId: ids.listing } } });
    await prisma.conversation.deleteMany({ where: { listingId: ids.listing } });
    await prisma.lead.deleteMany({ where: { partnerId: ids.partner } });
    await prisma.listing.deleteMany({ where: { id: ids.listing } });
    await prisma.partnerMember.deleteMany({ where: { partnerId: ids.partner } });
    await prisma.partner.deleteMany({ where: { id: ids.partner } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  test("número do vendedor só aparece para quem entrou na conta", async () => {
    // getDetail e registerWhatsappClick só usam o banco.
    const unused = {} as never;
    const listings = new ListingsService(prisma, unused, unused, unused, unused, unused, unused, unused);
    const anonymous = await listings.getDetail(ids.listing);
    assert.equal(anonymous.sellerPhone, undefined);
    assert.equal(anonymous.sellerHasWhatsapp, true);
    const logged = await listings.getDetail(ids.listing, { id: ids.buyer, role: "buyer" });
    assert.equal(logged.sellerPhone, "31999990000");

    await listings.registerWhatsappClick(ids.listing, ids.buyer);
    await listings.registerWhatsappClick(ids.listing, ids.buyer);
    const leads = await prisma.lead.findMany({ where: { partnerId: ids.partner, source: "whatsapp" } });
    assert.equal(leads.length, 1);
    assert.equal(leads[0].buyerId, ids.buyer);
  });

  test("equipe da loja abre o chat do lead e conversa; quem é de fora não", async () => {
    const lead = await prisma.lead.findFirstOrThrow({ where: { partnerId: ids.partner, source: "whatsapp" } });
    const opened = await conversations.openForLead(ids.member, lead.id);
    assert.deepEqual(await conversations.openForLead(ids.owner, lead.id), opened);
    await conversations.sendMessage(opened.id, ids.member, "Olá! Ainda tem interesse no carro?");
    const seenByBuyer = await conversations.getDetail(opened.id, ids.buyer);
    assert.equal(seenByBuyer.messages.length, 1);
    await assert.rejects(conversations.openForLead(ids.outsider, lead.id), /não pertence/);
    await assert.rejects(conversations.getDetail(opened.id, ids.outsider), /não participa/);
  });

  test("admin vê o lead, para quem foi, a etapa e o funil", async () => {
    const lead = await prisma.lead.findFirstOrThrow({ where: { partnerId: ids.partner } });
    await prisma.lead.update({ where: { id: lead.id }, data: { status: "contacted" } });
    const page = await adminLeads.list({ search: `Loja ${tag}`, page: 1 });
    assert.equal(page.total, 1);
    const row = page.items[0];
    assert.equal(row.partnerName, `Loja ${tag}`);
    assert.equal(row.buyerName, "comprador");
    assert.equal(row.source, "whatsapp");
    assert.equal(row.status, "contacted");
    assert.equal(row.hasConversation, true);
    assert.equal(page.funnel.contacted, 1);
    assert.equal(page.funnel.new, 0);
    const onlyNew = await adminLeads.list({ search: `Loja ${tag}`, status: "new", page: 1 });
    assert.equal(onlyNew.total, 0);
    assert.equal(onlyNew.funnel.contacted, 1);
  });
});

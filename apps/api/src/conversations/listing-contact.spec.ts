import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { ListingContactInputSchema } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { ContactsService } from "../marketing/contacts.service";
import type { ConversationsGateway } from "./conversations.gateway";
import { ListingContactService } from "./listing-contact.service";

// Formulário "Enviar mensagem" do anúncio, com e sem conta. Precisa do
// PostgreSQL local (DATABASE_URL).
const withDb = Boolean(process.env.DATABASE_URL);

describe("Formulário de contato do anúncio", () => {
  test("telefone vira só dígitos com DDD; e-mail e nome são obrigatórios", () => {
    const ok = ListingContactInputSchema.parse({ name: "Ana", email: "ANA@Teste.com ", phone: "+55 (31) 99999-0000", message: "Tenho interesse" });
    assert.equal(ok.phone, "31999990000");
    assert.equal(ok.email, "ana@teste.com");
    assert.equal(ok.wantsSimilar, false);
    assert.equal(ListingContactInputSchema.safeParse({ name: "Ana", email: "x", phone: "9999", message: "Oi tudo" }).success, false);
  });
});

describe("Formulário de contato do anúncio (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const notified: Array<{ userId: string; type: string; payload: Record<string, unknown> }> = [];
  const captured: unknown[] = [];
  const notifications = { notify: async (userId: string, type: string, payload: Record<string, unknown>) => void notified.push({ userId, type, payload }) } as unknown as NotificationsService;
  const contacts = { capture: async (input: unknown) => void captured.push(input) } as unknown as ContactsService;
  const gateway = { emitNewMessage: () => undefined } as unknown as ConversationsGateway;
  const service = new ListingContactService(prisma, notifications, contacts, gateway);
  const tag = `contato-${Date.now()}`;
  const ids = { seller: "", store: "", buyer: "", partner: "", privateListing: "", storeListing: "" };
  const input = (email: string) => ({ name: "Ana Souza", email, phone: "31999990000", message: "Olá, tenho interesse no anúncio.", wantsSimilar: false });

  before(async () => {
    ids.seller = (await prisma.user.create({ data: { name: "Paulo Vendedor", email: `${tag}-v@teste.local`, role: "buyer" } })).id;
    ids.store = (await prisma.user.create({ data: { name: "Dona da Loja", email: `${tag}-l@teste.local`, role: "buyer" } })).id;
    ids.buyer = (await prisma.user.create({ data: { name: "Carla Compradora", email: `${tag}-c@teste.local`, role: "buyer" } })).id;
    ids.partner = (await prisma.partner.create({ data: { ownerUserId: ids.store, type: "dealership", legalName: "Loja Teste", document: "00000000000191", slug: tag } })).id;
    const base = { type: "vehicle" as const, title: "Carro de teste", description: "Anúncio de teste do contato.", price: 50000, city: "BH", state: "MG", status: "active" as const };
    ids.privateListing = (await prisma.listing.create({ data: { ...base, ownerUserId: ids.seller } })).id;
    ids.storeListing = (await prisma.listing.create({ data: { ...base, ownerUserId: ids.store, partnerId: ids.partner } })).id;
  });

  after(async () => {
    await prisma.message.deleteMany({ where: { conversation: { listingId: { in: [ids.privateListing, ids.storeListing] } } } });
    await prisma.conversation.deleteMany({ where: { listingId: { in: [ids.privateListing, ids.storeListing] } } });
    await prisma.lead.deleteMany({ where: { partnerId: ids.partner } });
    await prisma.listingContact.deleteMany({ where: { listingId: { in: [ids.privateListing, ids.storeListing] } } });
    await prisma.listing.deleteMany({ where: { id: { in: [ids.privateListing, ids.storeListing] } } });
    await prisma.partner.deleteMany({ where: { id: ids.partner } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.seller, ids.store, ids.buyer] } } });
    await prisma.$disconnect();
  });

  test("sem conta, anúncio de particular: guarda e avisa o dono com telefone e e-mail", async () => {
    await service.send(ids.privateListing, { ...input(`${tag}-a@teste.local`), wantsSimilar: true });
    const saved = await prisma.listingContact.findMany({ where: { listingId: ids.privateListing } });
    assert.equal(saved.length, 1);
    const note = notified.at(-1)!;
    assert.equal(note.userId, ids.seller);
    assert.equal(note.type, "listing_contact");
    assert.equal(note.payload.contactPhone, "31999990000");
    assert.equal(captured.length, 1);
  });

  test("mesmo e-mail reenviando em seguida não duplica nem avisa de novo", async () => {
    const before = notified.length;
    await service.send(ids.privateListing, input(`${tag}-a@teste.local`));
    assert.equal(await prisma.listingContact.count({ where: { listingId: ids.privateListing } }), 1);
    assert.equal(notified.length, before);
  });

  test("anúncio de loja vira card no funil com nome, telefone e e-mail", async () => {
    await service.send(ids.storeListing, input(`${tag}-b@teste.local`));
    const lead = await prisma.lead.findFirstOrThrow({ where: { partnerId: ids.partner } });
    assert.equal(lead.source, "form");
    assert.equal(lead.contactName, "Ana Souza");
    assert.equal(lead.contactEmail, `${tag}-b@teste.local`);
    assert.equal(lead.contactPhone, "31999990000");
  });

  test("com conta: a mensagem também entra no chat", async () => {
    const result = await service.send(ids.privateListing, input(`${tag}-c@teste.local`), ids.buyer);
    assert.ok(result.conversationId);
    const messages = await prisma.message.findMany({ where: { conversationId: result.conversationId } });
    assert.equal(messages[0]?.body, "Olá, tenho interesse no anúncio.");
  });

  test("robô (campo escondido preenchido) não grava nada", async () => {
    await service.send(ids.privateListing, { ...input(`${tag}-robo@teste.local`), site: "http://spam" });
    assert.equal(await prisma.listingContact.count({ where: { email: `${tag}-robo@teste.local` } }), 0);
  });
});

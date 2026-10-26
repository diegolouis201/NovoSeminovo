import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { hash } from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import type { NotificationsService } from "../notifications/notifications.service";
import { AdminAccountsService, DELETED_EMAIL_DOMAIN } from "./accounts.service";

// Exclusões pelo admin: senha obrigatória, registros financeiros guardados,
// conta anonimizada. Precisa do PostgreSQL local (DATABASE_URL).
const withDb = Boolean(process.env.DATABASE_URL);

describe("Admin: excluir anúncio e conta (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const notified: string[] = [];
  const notifications = { notify: async (_userId: string, type: string) => void notified.push(type) } as unknown as NotificationsService;
  const accounts = new AdminAccountsService(prisma, notifications);
  const tag = `teste-exclusao-${Date.now()}`;
  const ids = { admin: "", owner: "", buyer: "" };

  const makeUser = (name: string, role: "admin" | "buyer", passwordHash?: string) =>
    prisma.user.create({ data: { name, email: `${name}-${tag}@teste.local`, role, passwordHash } });
  const makeListing = (title: string) =>
    prisma.listing.create({
      data: { type: "vehicle", ownerUserId: ids.owner, title, description: "Anúncio de teste para exclusão", price: 50000, city: "BH", state: "MG", status: "active" },
    });

  before(async () => {
    ids.admin = (await makeUser("admin", "admin", await hash("senha-certa", 4))).id;
    ids.owner = (await makeUser("dono", "buyer", await hash("x", 4))).id;
    ids.buyer = (await makeUser("comprador", "buyer")).id;
  });

  after(async () => {
    const users = Object.values(ids);
    await prisma.opsReport.deleteMany({ where: { agent: `admin:${ids.admin}` } });
    await prisma.listingBoostPurchase.deleteMany({ where: { userId: { in: users } } });
    await prisma.message.deleteMany({ where: { senderId: { in: users } } });
    await prisma.conversation.deleteMany({ where: { buyerId: { in: users } } });
    await prisma.listing.deleteMany({ where: { ownerUserId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  test("senha errada não exclui nada", async () => {
    const listing = await makeListing("Anúncio protegido pela senha");
    await assert.rejects(accounts.deleteListing(ids.admin, listing.id, { password: "errada", reason: "teste de senha" }), /Senha incorreta/);
    assert.ok(await prisma.listing.findUnique({ where: { id: listing.id } }));
  });

  test("exclui o anúncio com conversas e avisa o dono", async () => {
    const listing = await makeListing("Anúncio para excluir");
    const conversation = await prisma.conversation.create({ data: { listingId: listing.id, buyerId: ids.buyer, sellerUserId: ids.owner } });
    await prisma.message.create({ data: { conversationId: conversation.id, senderId: ids.buyer, body: "Ainda está disponível?" } });
    await accounts.deleteListing(ids.admin, listing.id, { password: "senha-certa", reason: "Anúncio duplicado" });
    assert.equal(await prisma.listing.findUnique({ where: { id: listing.id } }), null);
    assert.equal(await prisma.conversation.count({ where: { id: conversation.id } }), 0);
    assert.ok(notified.includes("listing_removed"));
  });

  test("anúncio com destaque pago não é apagado (registro financeiro)", async () => {
    const listing = await makeListing("Anúncio com destaque pago");
    await prisma.listingBoostPurchase.create({ data: { listingId: listing.id, userId: ids.owner, tier: "turbo", amount: 19.9, status: "paid", paidAt: new Date() } });
    await assert.rejects(accounts.deleteListing(ids.admin, listing.id, { password: "senha-certa", reason: "teste financeiro" }), /Suspender/);
    assert.ok(await prisma.listing.findUnique({ where: { id: listing.id } }));
  });

  test("excluir conta: dados pessoais apagados, anúncio pago guardado fora do ar, admin protegido", async () => {
    await assert.rejects(accounts.deleteAccount(ids.admin, ids.admin, { password: "senha-certa", reason: "teste próprio" }), /própria conta/);
    const result = await accounts.deleteAccount(ids.admin, ids.owner, { password: "senha-certa", reason: "Pedido do titular (LGPD)" });
    assert.ok(result.listingsDeleted >= 1);
    assert.equal(result.listingsKept, 1);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ids.owner } });
    assert.equal(user.name, "Conta excluída");
    assert.ok(user.email.endsWith(`@${DELETED_EMAIL_DOMAIN}`));
    assert.equal(user.passwordHash, null);
    assert.equal(user.status, "suspended");
    const kept = await prisma.listing.findMany({ where: { ownerUserId: ids.owner } });
    assert.deepEqual(kept.map((listing) => listing.status), ["paused"]);
    const profile = await accounts.profile(ids.owner);
    assert.equal(profile.deleted, true);
  });
});

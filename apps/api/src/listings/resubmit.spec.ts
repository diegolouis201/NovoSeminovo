import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { PrismaService } from "../prisma/prisma.service";
import { listingEvents } from "../common/listing-events";
import { ListingsService } from "./listings.service";

// Anúncio recusado: o anunciante vê o motivo, corrige título, descrição,
// preço e fotos e reenvia para a moderação (no máximo 3 vezes). Um plano
// pago continua valendo. Precisa do PostgreSQL local (DATABASE_URL).
const withDb = Boolean(process.env.DATABASE_URL);

describe("Corrigir e reenviar anúncio recusado (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const unused = {} as never;
  const listings = new ListingsService(prisma, unused, unused, unused, unused, unused, unused, unused);
  const tag = `reenvio-${Date.now()}`;
  const ids = { owner: "", other: "", listing: "" };
  const fixed = { title: "Gol 1.6 2019 completo", description: "Carro revisado, único dono, pneus novos e manual.", price: 52000 };

  before(async () => {
    ids.owner = (await prisma.user.create({ data: { name: "Dono", email: `dono-${tag}@teste.local` } })).id;
    ids.other = (await prisma.user.create({ data: { name: "Outro", email: `outro-${tag}@teste.local` } })).id;
    ids.listing = (
      await prisma.listing.create({
        data: {
          type: "vehicle",
          ownerUserId: ids.owner,
          title: "Gol chama no zap",
          description: "Descrição com problema que a moderação recusou.",
          price: 50000,
          city: "BH",
          state: "MG",
          status: "rejected",
          planTier: "turbo",
          autoReviewedAt: new Date(),
        },
      })
    ).id;
    await prisma.photo.create({ data: { listingId: ids.listing, url: "/uploads/teste-reenvio.jpg", position: 0 } });
    await prisma.moderationLog.create({
      data: { listingId: ids.listing, automated: true, action: "rejected", reason: "Tire o telefone do título; o contato é pelo site." },
    });
  });

  after(async () => {
    await prisma.moderationLog.deleteMany({ where: { listingId: ids.listing } });
    await prisma.photo.deleteMany({ where: { listingId: ids.listing } });
    await prisma.listing.deleteMany({ where: { id: ids.listing } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.owner, ids.other] } } });
    await prisma.$disconnect();
  });

  test("dono vê o motivo da recusa e quantos reenvios restam", async () => {
    const info = await listings.moderationInfo(ids.listing, ids.owner);
    assert.equal(info.reason, "Tire o telefone do título; o contato é pelo site.");
    assert.equal(info.resubmitsLeft, 3);
    assert.equal(info.canResubmit, true);
  });

  test("outra pessoa não vê nem reenvia", async () => {
    await assert.rejects(listings.moderationInfo(ids.listing, ids.other), /seus próprios anúncios/);
    await assert.rejects(listings.resubmit(ids.listing, ids.other, fixed), /seus próprios anúncios/);
  });

  test("texto ainda com contato é recusado antes de reenviar", async () => {
    await assert.rejects(
      listings.resubmit(ids.listing, ids.owner, { ...fixed, description: "Ligue (31) 99999-0000 para mais informações do carro." }),
      /contato|telefone/i,
    );
    assert.equal((await prisma.listing.findUniqueOrThrow({ where: { id: ids.listing } })).status, "rejected");
  });

  test("reenvio corrige o anúncio, volta para análise e avisa a moderação", async () => {
    const seen: string[] = [];
    const onResubmit = (id: string) => seen.push(id);
    listingEvents.on("anuncio-reenviado", onResubmit);
    try {
      await listings.resubmit(ids.listing, ids.owner, fixed);
    } finally {
      listingEvents.off("anuncio-reenviado", onResubmit);
    }
    const row = await prisma.listing.findUniqueOrThrow({ where: { id: ids.listing } });
    assert.equal(row.status, "pending_review");
    assert.equal(row.title, fixed.title);
    assert.equal(row.description, fixed.description);
    assert.equal(Number(row.price), fixed.price);
    assert.equal(row.resubmitCount, 1);
    assert.equal(row.autoReviewedAt, null);
    assert.equal(row.planTier, "turbo", "plano pago continua valendo");
    assert.deepEqual(seen, [ids.listing]);
  });

  test("anúncio que não está recusado não pode ser reenviado", async () => {
    await assert.rejects(listings.resubmit(ids.listing, ids.owner, fixed), /recusad/);
  });

  test("depois de 3 reenvios não dá mais", async () => {
    await prisma.listing.update({ where: { id: ids.listing }, data: { status: "rejected", resubmitCount: 3 } });
    const info = await listings.moderationInfo(ids.listing, ids.owner);
    assert.equal(info.resubmitsLeft, 0);
    assert.equal(info.canResubmit, false);
    await assert.rejects(listings.resubmit(ids.listing, ids.owner, fixed), /3 reenvios/);
  });
});

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { PrismaService } from "../prisma/prisma.service";
import type { NotificationsService } from "../notifications/notifications.service";
import { ListingsService } from "../listings/listings.service";
import { ReviewModerationService, initialReviewStatus, visibleReviewWhere } from "./review-moderation.service";

// Avaliações de lojas e anunciantes passam pela moderação antes de aparecer:
// nota sem texto entra direto; texto com contato é recusado; o resto a IA
// decide (ou fica para o admin). A loja pode denunciar uma avaliação e o
// admin decide. Precisa do PostgreSQL local (DATABASE_URL).

describe("Status inicial da avaliação", () => {
  test("só a nota, sem texto: aprovada", () => {
    assert.deepEqual(initialReviewStatus(undefined), { status: "approved" });
    assert.deepEqual(initialReviewStatus("   "), { status: "approved" });
  });
  test("texto com telefone ou e-mail: recusada", () => {
    assert.equal(initialReviewStatus("Péssimo, me liga 31 99999-0000").status, "rejected");
    assert.equal(initialReviewStatus("escreve pra fulano@email.com").status, "rejected");
  });
  test("texto normal: espera a moderação", () => {
    assert.deepEqual(initialReviewStatus("Atendimento rápido e carro como nas fotos."), { status: "pending" });
  });
});

const withDb = Boolean(process.env.DATABASE_URL);

describe("Moderação de avaliações (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const sent: Array<{ to: string; type: string }> = [];
  const notifications = { notify: async (to: string, type: string) => void sent.push({ to, type }) } as unknown as NotificationsService;
  const unused = {} as never;
  const listings = new ListingsService(prisma, notifications, unused, unused, unused, unused, unused, unused);
  const moderation = new ReviewModerationService(prisma, notifications);
  const tag = `aval-${Date.now()}`;
  const ids = { seller: "", outsider: "", buyers: [] as string[], listing: "" };
  const stats = () =>
    (listings as unknown as { sellerStats(p: string | null, o: string): Promise<{ reviewCount: number }> }).sellerStats(null, ids.seller);

  async function newBuyer(n: number) {
    const id = (await prisma.user.create({ data: { name: `Comprador ${n}`, email: `c${n}-${tag}@teste.local` } })).id;
    ids.buyers.push(id);
    await prisma.conversation.create({ data: { listingId: ids.listing, buyerId: id, sellerUserId: ids.seller } });
    return id;
  }
  const reviewOf = (buyer: string) => prisma.review.findFirstOrThrow({ where: { reviewerId: buyer, listingId: ids.listing } });

  before(async () => {
    ids.seller = (await prisma.user.create({ data: { name: "Vendedor", email: `v-${tag}@teste.local` } })).id;
    ids.outsider = (await prisma.user.create({ data: { name: "Outro", email: `o-${tag}@teste.local` } })).id;
    ids.listing = (
      await prisma.listing.create({
        data: { type: "vehicle", ownerUserId: ids.seller, title: `Gol ${tag}`, description: "teste de avaliação", price: 40000, city: "BH", state: "MG", status: "active" },
      })
    ).id;
  });

  after(async () => {
    await prisma.review.deleteMany({ where: { listingId: ids.listing } });
    await prisma.conversation.deleteMany({ where: { listingId: ids.listing } });
    await prisma.listing.deleteMany({ where: { id: ids.listing } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.seller, ids.outsider, ...ids.buyers] } } });
    await prisma.$disconnect();
  });

  test("nota sem texto aparece na hora; texto normal espera; texto com contato é recusado", async () => {
    const a = await newBuyer(1);
    await listings.createReview(ids.listing, a, { rating: 5 });
    assert.equal((await reviewOf(a)).status, "approved");

    const b = await newBuyer(2);
    await listings.createReview(ids.listing, b, { rating: 4, comment: "Atendimento bom, carro conforme as fotos." });
    assert.equal((await reviewOf(b)).status, "pending");

    const c = await newBuyer(3);
    await listings.createReview(ids.listing, c, { rating: 1, comment: "Liga no 31 98888-7777 que eu conto" });
    assert.equal((await reviewOf(c)).status, "rejected");

    assert.equal((await stats()).reviewCount, 1, "só a aprovada conta na nota do vendedor");
    assert.equal(await prisma.review.count({ where: { listingId: ids.listing, ...visibleReviewWhere } }), 1);
  });

  test("IA aprova, recusa ou deixa para o admin", async () => {
    const buyers = [await newBuyer(4), await newBuyer(5), await newBuyer(6)];
    for (const [i, buyer] of buyers.entries()) {
      await listings.createReview(ids.listing, buyer, { rating: 3, comment: `Comentário normal número ${i} sobre a negociação.` });
    }
    // Decide pelo texto: "n\u00famero 1" recusa, "n\u00famero 2" fica para o admin, o resto aprova.
    (moderation as unknown as { decide: (r: { comment: string | null }) => Promise<unknown> }).decide = async (review) => {
      if (review.comment?.includes("n\u00famero 1")) return { decision: "reject", note: "Ofensa ao vendedor." };
      if (review.comment?.includes("n\u00famero 2")) return { decision: "human", note: "Conferir se \u00e9 cliente real." };
      return { decision: "approve" };
    };
    (moderation as unknown as { enabled: () => boolean }).enabled = () => true;
    sent.length = 0;
    await moderation.moderatePending();
    // Aprovadas agora: a "número 0" e a que ficou pendente no teste anterior; recusada e revisão humana não avisam.
    assert.deepEqual(sent, [{ to: ids.seller, type: "new_review" }, { to: ids.seller, type: "new_review" }], "o avaliado só é avisado das aprovadas");
    const rows = await Promise.all(buyers.map(reviewOf));
    const byStatus = rows.map((r) => r.status).sort();
    assert.deepEqual(byStatus, ["approved", "pending", "rejected"].concat().sort());
    const human = rows.find((r) => r.status === "pending");
    assert.ok(human?.autoReviewedAt, "a que ficou para o admin não volta para a IA");
    assert.equal(human?.moderationNote, "Conferir se é cliente real.");
  });

  test("o avaliado pode denunciar; outra pessoa não", async () => {
    const visible = await prisma.review.findFirstOrThrow({ where: { listingId: ids.listing, status: "approved" } });
    await assert.rejects(moderation.report(visible.id, ids.outsider, "Não é meu cliente"), /quem foi avaliado/);
    await moderation.report(visible.id, ids.seller, "Essa pessoa nunca falou comigo.");
    const reported = await prisma.review.findUniqueOrThrow({ where: { id: visible.id } });
    assert.equal(reported.status, "reported");
    assert.equal(reported.reportReason, "Essa pessoa nunca falou comigo.");
    assert.equal(await prisma.review.count({ where: { id: visible.id, ...visibleReviewWhere } }), 1, "denunciada continua visível até a decisão");
  });

  test("admin vê a fila e decide", async () => {
    const queue = await moderation.adminQueue();
    const mine = queue.filter((item) => item.listingTitle === `Gol ${tag}`);
    assert.ok(mine.some((item) => item.status === "reported"));
    assert.ok(mine.some((item) => item.status === "pending"));
    const reported = mine.find((item) => item.status === "reported")!;
    sent.length = 0;
    await moderation.adminDecide(reported.id, "reject", "Avaliação sem negociação real.");
    assert.equal((await prisma.review.findUniqueOrThrow({ where: { id: reported.id } })).status, "rejected");
    assert.equal(sent.length, 0, "recusar a denunciada não avisa ninguém");
    const pending = mine.find((item) => item.status === "pending")!;
    await moderation.adminDecide(pending.id, "approve");
    assert.deepEqual(sent, [{ to: ids.seller, type: "new_review" }], "aprovada pelo admin avisa o avaliado");
    assert.equal((await prisma.review.findUniqueOrThrow({ where: { id: pending.id } })).status, "approved");
  });
});

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { PrismaService } from "../prisma/prisma.service";
import type { PrismaService as PrismaType } from "../prisma/prisma.service";
import { AdminService } from "./admin.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { SavedSearchesService } from "../saved-searches/saved-searches.service";
import { AutoModerationService } from "./auto-moderation.service";
import { blockAccount, checkRecidivism, clearModerationHold, heldAccounts, unblockAccount } from "./account-safety";

// Segurança das contas (MOD-05): bloquear sem excluir (golpe confirmado) e
// reincidência (3 recusas em 30 dias ou 2 denúncias procedentes) colocando
// todos os anúncios novos da conta em revisão humana.

describe("Conta em revisão: a IA não decide sozinha", () => {
  test("anúncio de conta reincidente vai para a fila humana", async () => {
    process.env.ANTHROPIC_API_KEY = "chave-de-teste";
    delete process.env.AUTO_MODERATION_DISABLED;
    const listing = {
      id: "h1",
      status: "pending_review",
      autoReviewedAt: null,
      photos: [{ url: "/uploads/a.jpg" }],
      owner: { moderationHoldAt: new Date(), moderationHoldReason: "3 recusas em 30 dias" },
    };
    const updates: Array<{ autoReviewNote?: string }> = [];
    const applied: string[] = [];
    const prisma = {
      listing: {
        updateMany: async () => ({ count: 0 }),
        findFirst: async () => listing,
        findMany: async () => [],
        update: async ({ data }: { data: { autoReviewNote?: string } }) => void updates.push(data),
      },
    } as unknown as PrismaType;
    const admin = { applyModeration: async (id: string) => void applied.push(id) } as unknown as AdminService;
    const service = new AutoModerationService(prisma, admin);
    let decided = 0;
    (service as unknown as { decide: () => Promise<unknown> }).decide = async () => {
      decided++;
      return { decision: "approve" };
    };
    await service.reviewNow("h1");
    assert.equal(decided, 0, "nem chama a IA");
    assert.deepEqual(applied, []);
    assert.match(updates[0]?.autoReviewNote ?? "", /reincid/i);
  });
});

const withDb = Boolean(process.env.DATABASE_URL);

describe("Bloqueio e reincidência (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const tag = `seg-${Date.now()}`;
  const ids = { admin: "", owner: "", other: "", listings: [] as string[], reporter: "" };
  const admin = new AdminService(
    prisma,
    { notify: async () => undefined } as unknown as NotificationsService,
    { notifyMatches: async () => undefined } as unknown as SavedSearchesService,
  );

  async function listing(owner: string, status: "active" | "pending_review" | "rejected" = "active") {
    const id = (
      await prisma.listing.create({
        data: { type: "vehicle", ownerUserId: owner, title: `Carro ${tag}`, description: "teste de seguranca", price: 30000, city: "BH", state: "MG", status },
      })
    ).id;
    ids.listings.push(id);
    return id;
  }

  before(async () => {
    ids.admin = (await prisma.user.create({ data: { name: "Admin", email: `adm-${tag}@teste.local`, role: "admin" } })).id;
    ids.owner = (await prisma.user.create({ data: { name: "Golpista", email: `g-${tag}@teste.local` } })).id;
    ids.other = (await prisma.user.create({ data: { name: "Reincidente", email: `r-${tag}@teste.local` } })).id;
    ids.reporter = (await prisma.user.create({ data: { name: "Denunciante", email: `d-${tag}@teste.local` } })).id;
  });

  after(async () => {
    await prisma.report.deleteMany({ where: { listingId: { in: ids.listings } } });
    await prisma.moderationLog.deleteMany({ where: { listingId: { in: ids.listings } } });
    await prisma.listing.deleteMany({ where: { id: { in: ids.listings } } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.admin, ids.owner, ids.other, ids.reporter] } } });
    await prisma.$disconnect();
  });

  test("bloquear conta: suspende o usuário e tira os anúncios do ar, com motivo", async () => {
    const active = await listing(ids.owner, "active");
    const pending = await listing(ids.owner, "pending_review");
    await blockAccount(prisma, ids.owner, "Pediu sinal por Pix de carro que não existe.", ids.admin);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ids.owner } });
    assert.equal(user.status, "suspended");
    assert.equal(user.blockedReason, "Pediu sinal por Pix de carro que não existe.");
    for (const id of [active, pending]) assert.equal((await prisma.listing.findUniqueOrThrow({ where: { id } })).status, "paused");
    assert.equal(await prisma.moderationLog.count({ where: { listingId: active, action: "suspended" } }), 1);
  });

  test("admin não pode ser bloqueado", async () => {
    await assert.rejects(blockAccount(prisma, ids.admin, "teste", ids.admin), /administrador/);
  });

  test("desbloquear só vale para conta bloqueada (não reativa conta excluída/suspensa por outro motivo)", async () => {
    await prisma.user.update({ where: { id: ids.reporter }, data: { status: "suspended" } });
    await assert.rejects(unblockAccount(prisma, ids.reporter), /não está bloqueada/);
    await assert.rejects(blockAccount(prisma, ids.reporter, "teste de conta excluída", ids.admin), /suspensa ou excluída/);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: ids.reporter } })).status, "suspended");
    await prisma.user.update({ where: { id: ids.reporter }, data: { status: "active" } });
  });

  test("desbloquear volta a conta a ativa (anúncios continuam pausados)", async () => {
    await unblockAccount(prisma, ids.owner);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ids.owner } });
    assert.equal(user.status, "active");
    assert.equal(user.blockedReason, null);
  });

  test("3 recusas em 30 dias colocam a conta em revisão; 2 não", async () => {
    for (let i = 0; i < 2; i++) {
      const id = await listing(ids.other, "rejected");
      await prisma.moderationLog.create({ data: { listingId: id, automated: true, action: "rejected", reason: "teste" } });
    }
    assert.equal(await checkRecidivism(prisma, ids.other), false);
    const third = await listing(ids.other, "rejected");
    await prisma.moderationLog.create({ data: { listingId: third, automated: true, action: "rejected", reason: "teste" } });
    assert.equal(await checkRecidivism(prisma, ids.other), true);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ids.other } });
    assert.ok(user.moderationHoldAt);
    assert.match(user.moderationHoldReason ?? "", /3 recusas/);
    assert.ok((await heldAccounts(prisma)).some((a) => a.id === ids.other));
  });

  test("recusa antiga (mais de 30 dias) não conta", async () => {
    await clearModerationHold(prisma, ids.other);
    await prisma.moderationLog.updateMany({
      where: { listingId: { in: ids.listings }, action: "rejected" },
      data: { createdAt: new Date(Date.now() - 40 * 86_400_000) },
    });
    assert.equal(await checkRecidivism(prisma, ids.other), false);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: ids.other } })).moderationHoldAt, null);
  });

  test("a recusa feita pela moderação já confere a reincidência", async () => {
    await clearModerationHold(prisma, ids.other);
    await prisma.moderationLog.updateMany({ where: { listingId: { in: ids.listings } }, data: { createdAt: new Date() } });
    await prisma.report.deleteMany({ where: { listingId: { in: ids.listings } } });
    await prisma.moderationLog.deleteMany({ where: { listingId: { in: ids.listings }, action: "rejected" } });
    for (let i = 0; i < 3; i++) await admin.applyModeration(await listing(ids.other, "pending_review"), "reject", "Fotos de outro carro.", ids.admin);
    assert.match((await prisma.user.findUniqueOrThrow({ where: { id: ids.other } })).moderationHoldReason ?? "", /3 recusas/);
    await clearModerationHold(prisma, ids.other);
    await prisma.moderationLog.deleteMany({ where: { listingId: { in: ids.listings }, action: "rejected" } });
  });

  test("2 denúncias procedentes colocam a conta em revisão", async () => {
    const id = await listing(ids.other, "active");
    await prisma.report.create({ data: { listingId: id, reporterId: ids.reporter, reason: "golpe", status: "reviewed" } });
    assert.equal(await checkRecidivism(prisma, ids.other), false);
    await prisma.report.create({ data: { listingId: id, reporterId: ids.reporter, reason: "golpe de novo", status: "reviewed" } });
    assert.equal(await checkRecidivism(prisma, ids.other), true);
    assert.match((await prisma.user.findUniqueOrThrow({ where: { id: ids.other } })).moderationHoldReason ?? "", /denúncias/);
  });

  test("denúncia marcada como procedente pelo admin já confere a reincidência", async () => {
    await clearModerationHold(prisma, ids.other);
    const id = await listing(ids.other, "active");
    const report = await prisma.report.create({ data: { listingId: id, reporterId: ids.reporter, reason: "golpe outra vez" } });
    await admin.updateReportStatus(report.id, "reviewed");
    assert.ok((await prisma.user.findUniqueOrThrow({ where: { id: ids.other } })).moderationHoldAt);
  });
});

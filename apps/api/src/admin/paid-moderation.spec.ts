import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { listingEvents } from "../common/listing-events";
import type { PrismaService } from "../prisma/prisma.service";
import type { AdminService } from "./admin.service";
import { AutoModerationService } from "./auto-moderation.service";

// Pagamento confirmado → a moderação automática analisa o anúncio na hora
// (sem esperar a varredura e a carência de 3 minutos).
describe("Moderação na hora do pagamento", () => {
  test("aviso de pagamento confirmado aprova o anúncio normal na hora", async () => {
    process.env.ANTHROPIC_API_KEY = "chave-de-teste";
    delete process.env.AUTO_MODERATION_DISABLED;
    const listing = { id: "l1", status: "pending_review", autoReviewedAt: null, photos: [{ url: "/uploads/a.jpg" }] };
    const applied: Array<[string, string]> = [];
    const prisma = {
      listing: {
        updateMany: async () => ({ count: 0 }),
        findFirst: async ({ where }: { where: { id: string } }) => (where.id === listing.id ? listing : null),
        findMany: async () => [],
        update: async () => listing,
      },
    } as unknown as PrismaService;
    const admin = {
      applyModeration: async (id: string, decision: string) => {
        applied.push([id, decision]);
      },
    } as unknown as AdminService;
    const service = new AutoModerationService(prisma, admin);
    let decided = 0;
    (service as unknown as { decide: () => Promise<unknown> }).decide = async () => {
      decided++;
      return { decision: "approve" };
    };
    service.onModuleInit();
    try {
      listingEvents.emit("pagamento-confirmado", "l1");
      listingEvents.emit("pagamento-confirmado", "l1"); // aviso duplicado (webhook + volta do checkout)
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.deepEqual(applied, [["l1", "approve"]]);
      assert.equal(decided, 1, "analisado uma vez só");
      listingEvents.emit("pagamento-confirmado", "outro");
      await new Promise((resolve) => setTimeout(resolve, 20));
      assert.equal(applied.length, 1, "anúncio que não está em análise é ignorado");
    } finally {
      service.onModuleDestroy();
    }
  });
});

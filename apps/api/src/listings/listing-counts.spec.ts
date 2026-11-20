import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { PrismaService } from "../prisma/prisma.service";
import { ListingCountsService, ListingIdParamSchema, linkDoAssistente, diaDaContagem } from "./listing-counts";

// Contagem agregada de "abriu o anúncio pelo link do assistente virtual":
// uma linha por anúncio, dia e tipo, sem guardar quem foi.

describe("Link do assistente para o anúncio", () => {
  test("no chat do site é relativo e marcado", () => {
    assert.equal(linkDoAssistente("abc123", "web", "https://novoseminovo.com.br"), "/anuncio/abc123?de=assistente");
  });
  test("no WhatsApp é absoluto e marcado", () => {
    assert.equal(linkDoAssistente("abc123", "whatsapp", "https://novoseminovo.com.br"), "https://novoseminovo.com.br/anuncio/abc123?de=assistente");
  });
});

describe("Validação do id do anúncio", () => {
  test("aceita id do banco e recusa texto malicioso", () => {
    assert.equal(ListingIdParamSchema.safeParse("cmwpg7dsm001iofqwczuoql24").success, true);
    for (const ruim of ["", "1' OR '1'='1", "<script>alert(1)</script>", "x".repeat(65), "../etc/passwd"]) {
      assert.equal(ListingIdParamSchema.safeParse(ruim).success, false, ruim);
    }
  });
});

describe("Dia da contagem no fuso de São Paulo", () => {
  test("01h UTC ainda é o dia anterior", () => {
    assert.equal(diaDaContagem(new Date("2026-11-20T01:00:00Z")).toISOString(), "2026-11-19T00:00:00.000Z");
    assert.equal(diaDaContagem(new Date("2026-11-20T03:00:00Z")).toISOString(), "2026-11-20T00:00:00.000Z");
  });
});

const withDb = Boolean(process.env.DATABASE_URL);

describe("Contagem no banco", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const service = new ListingCountsService(prisma);
  const tag = `contagem-${Date.now()}`;
  const criados: { user?: string; listings: string[] } = { listings: [] };

  after(async () => {
    await prisma.listing.deleteMany({ where: { id: { in: criados.listings } } });
    if (criados.user) await prisma.user.deleteMany({ where: { id: criados.user } });
    await prisma.$disconnect();
  });

  test("soma por anúncio e dia; anúncio fora do ar ou inexistente não conta; nada de quem foi", async () => {
    const dono = await prisma.user.create({ data: { name: "Dono", email: `${tag}@teste.local` } });
    criados.user = dono.id;
    const base = { type: "property" as const, ownerUserId: dono.id, title: "Casa", description: "d", price: 1, city: "BH", state: "MG" };
    const ativo = await prisma.listing.create({ data: { ...base, status: "active" } });
    const pausado = await prisma.listing.create({ data: { ...base, status: "paused" } });
    criados.listings.push(ativo.id, pausado.id);

    const agora = new Date("2026-11-20T15:00:00Z");
    assert.equal(await service.registrarVisitaDoAssistente(ativo.id, agora), true);
    assert.equal(await service.registrarVisitaDoAssistente(ativo.id, agora), true);
    assert.equal(await service.registrarVisitaDoAssistente(ativo.id, new Date("2026-11-21T01:00:00Z")), true); // ainda dia 20 em SP
    assert.equal(await service.registrarVisitaDoAssistente(ativo.id, new Date("2026-11-21T12:00:00Z")), true);
    assert.equal(await service.registrarVisitaDoAssistente(pausado.id, agora), false);
    assert.equal(await service.registrarVisitaDoAssistente("naoexiste123", agora), false);

    const linhas = await prisma.listingDailyCount.findMany({ where: { listingId: { in: criados.listings } }, orderBy: { day: "asc" } });
    assert.deepEqual(
      linhas.map((l) => [l.listingId, l.day.toISOString().slice(0, 10), l.kind, l.count]),
      [
        [ativo.id, "2026-11-20", "assistente_abriu", 3],
        [ativo.id, "2026-11-21", "assistente_abriu", 1],
      ],
    );
    // A linha só tem anúncio, dia, tipo e contador.
    assert.deepEqual(Object.keys(linhas[0]!).sort(), ["count", "day", "kind", "listingId"]);
  });
});

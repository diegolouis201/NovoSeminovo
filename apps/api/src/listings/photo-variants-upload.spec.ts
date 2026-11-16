import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { photoVariantUrl } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { getPhotoStorage, UPLOADS_DIR } from "../common/storage";
import { backfillPhotoVariants } from "../common/photo-variants";
import { ListingsService } from "./listings.service";
import { listingInclude, toListingDetail, toListingSummary } from "./listings.mapper";

// Fotos do anúncio em vários tamanhos (auditoria web, item 1), no envio de
// verdade: a cópia sai da foto já com a placa borrada; o anúncio devolve as
// larguras para o site montar o srcset; apagar a foto apaga as cópias; e o
// comando de conversão das fotos antigas é seguro de rodar mais de uma vez.
const withDb = Boolean(process.env.DATABASE_URL);

const file = (path: string) => join(UPLOADS_DIR, path.replace(/^\/uploads\//, ""));

// Xadrez de quadrados de 80 px: reduzido continua com contraste alto;
// borrado (placa) vira quase uma cor só.
async function checkerboard(width = 1600, height = 1200): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = (Math.floor(x / 80) + Math.floor(y / 80)) % 2 ? 255 : 0;
      raw.fill(v, (y * width + x) * 3, (y * width + x) * 3 + 3);
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
}

async function contrast(buffer: Buffer): Promise<number> {
  const stats = await sharp(buffer).stats();
  return stats.channels[0]!.stdev;
}

describe("Fotos em vários tamanhos no anúncio (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const unused = {} as never;
  // IA falsa: acha "placa" na foto inteira, para o borrão ser fácil de medir.
  const ai = { isEnabled: () => true, findLicensePlates: async () => [{ x: 0, y: 0, width: 1, height: 1 }] };
  const listings = new ListingsService(prisma, unused, unused, unused, ai as never, unused, unused, unused);
  const tag = `variantes-${Date.now()}`;
  const ids = { owner: "", other: "", car: "", house: "" };
  const files: string[] = [];

  before(async () => {
    delete process.env.PLATE_BLUR_DISABLED;
    ids.owner = (await prisma.user.create({ data: { name: "Dono", email: `dono-${tag}@teste.local` } })).id;
    ids.other = (await prisma.user.create({ data: { name: "Outro", email: `outro-${tag}@teste.local` } })).id;
    const base = { ownerUserId: ids.owner, description: "Descrição de teste das fotos em vários tamanhos.", price: 50000, city: "BH", state: "MG", status: "active" as const };
    ids.car = (await prisma.listing.create({ data: { ...base, type: "vehicle", title: "Carro das fotos" } })).id;
    ids.house = (await prisma.listing.create({ data: { ...base, type: "property", title: "Casa das fotos" } })).id;
  });

  after(async () => {
    for (const path of files) await unlink(file(path)).catch(() => {});
    await prisma.photo.deleteMany({ where: { listingId: { in: [ids.car, ids.house] } } });
    await prisma.listing.deleteMany({ where: { id: { in: [ids.car, ids.house] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.owner, ids.other] } } });
    await prisma.$disconnect();
  });

  test("carro: cópias feitas da foto com a placa já borrada", async () => {
    const photos = await listings.addPhotos(ids.car, ids.owner, [
      { buffer: await checkerboard(), originalname: "carro.jpg", mimetype: "image/jpeg" } as Express.Multer.File,
    ]);
    assert.equal(photos.length, 1);
    const [photo] = photos;
    files.push(photo!.url, ...[320, 640, 800, 1024, 1600].map((w) => photoVariantUrl(photo!.url, w)));
    assert.deepEqual(photo!.widths, [320, 640, 800, 1024, 1600]);

    const row = await prisma.photo.findFirstOrThrow({ where: { listingId: ids.car } });
    assert.deepEqual(row.variantWidths, [320, 640, 800, 1024, 1600]);

    const unblurred = await sharp(await checkerboard()).resize({ width: 320 }).webp().toBuffer();
    const variant = await readFile(file(photoVariantUrl(row.url, 320)));
    assert.ok((await contrast(unblurred)) > 80, "sem borrão o xadrez tem contraste alto");
    assert.ok((await contrast(variant)) < 40, "a cópia veio da foto com a placa borrada");
  });

  test("anúncio devolve as larguras (cartão e galeria); foto sem cópias fica sem", async () => {
    await prisma.photo.create({ data: { listingId: ids.house, url: "https://crm.exemplo.com/foto.jpg", position: 0, isCover: true } });
    const car = await prisma.listing.findUniqueOrThrow({ where: { id: ids.car }, include: listingInclude });
    assert.deepEqual(toListingSummary(car).imageWidths, [320, 640, 800, 1024, 1600]);
    assert.deepEqual(toListingDetail(car, "not_eligible").photos[0]?.widths, [320, 640, 800, 1024, 1600]);
    const house = await prisma.listing.findUniqueOrThrow({ where: { id: ids.house }, include: listingInclude });
    assert.equal(toListingSummary(house).imageWidths, undefined);
    assert.equal(toListingDetail(house, "not_eligible").photos[0]?.widths, undefined);
  });

  test("outra pessoa não envia foto no anúncio de quem não é dela", async () => {
    await assert.rejects(
      listings.addPhotos(ids.car, ids.other, [{ buffer: await checkerboard(64, 48), originalname: "x.jpg", mimetype: "image/jpeg" } as Express.Multer.File]),
      /seus próprios anúncios/,
    );
  });

  test("apagar a foto apaga também as cópias", async () => {
    const row = await prisma.photo.findFirstOrThrow({ where: { listingId: ids.car } });
    await listings.removePhoto(ids.car, ids.owner, row.id);
    assert.equal(existsSync(file(row.url)), false);
    for (const w of row.variantWidths) assert.equal(existsSync(file(photoVariantUrl(row.url, w))), false);
  });

  test("conversão das fotos antigas: gera o que falta, pula link externo e arquivo sumido, e pode rodar de novo", async () => {
    const storage = getPhotoStorage();
    const oldUrl = await storage.save(await checkerboard(1000, 750), "antiga.jpg", "image/jpeg");
    files.push(oldUrl, ...[320, 640, 800, 1000].map((w) => photoVariantUrl(oldUrl, w)));
    const old = await prisma.photo.create({ data: { listingId: ids.house, url: oldUrl, position: 1 } });
    const gone = await prisma.photo.create({ data: { listingId: ids.house, url: "/uploads/00000000-0000-0000-0000-000000000000.jpg", position: 2 } });

    const first = await backfillPhotoVariants(prisma, storage, { listingIds: [ids.house] });
    assert.deepEqual((await prisma.photo.findUniqueOrThrow({ where: { id: old.id } })).variantWidths, [320, 640, 800, 1000]);
    assert.equal(first.converted, 1);
    assert.equal(first.failed, 1);
    assert.equal(first.external, 1);
    assert.ok(existsSync(file(photoVariantUrl(oldUrl, 640))));
    assert.deepEqual((await prisma.photo.findUniqueOrThrow({ where: { id: gone.id } })).variantWidths, []);

    const second = await backfillPhotoVariants(prisma, storage, { listingIds: [ids.house] });
    assert.equal(second.converted, 0, "foto já convertida não é refeita");
  });
});

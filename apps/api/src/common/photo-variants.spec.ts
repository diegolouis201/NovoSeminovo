import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { photoSrcSet, photoVariantUrl, photoVariantWidths } from "@novoseminovo/shared-types";
import { sniffFileType } from "./image-safety";
import { getPhotoStorage, UPLOADS_DIR, type PhotoStorage } from "./storage";
import { makePhotoVariants, removePhotoWithVariants, savePhotoWithVariants } from "./photo-variants";

// Auditoria web (16/11/2026), item 1: cada foto de anúncio ganha cópias
// menores em WebP (320/640/800/1024/1600) no envio, feitas da foto JÁ tratada
// (limpa e com a placa borrada), para o celular não baixar 2560 px num
// cartão de 280 px. A original continua guardada.

async function jpeg(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 0, g: 106, b: 164 } } }).jpeg().toBuffer();
}

const created: string[] = [];
after(async () => {
  for (const url of created) await unlink(join(UPLOADS_DIR, url.replace(/^\/uploads\//, ""))).catch(() => {});
});

describe("Larguras e endereços das cópias", () => {
  test("só larguras menores que a original, com a própria largura no topo (máx. 1600)", () => {
    assert.deepEqual(photoVariantWidths(2560), [320, 640, 800, 1024, 1600]);
    assert.deepEqual(photoVariantWidths(1600), [320, 640, 800, 1024, 1600]);
    assert.deepEqual(photoVariantWidths(1200), [320, 640, 800, 1024, 1200]);
    assert.deepEqual(photoVariantWidths(500), [320, 500]);
    assert.deepEqual(photoVariantWidths(200), [200]);
    assert.deepEqual(photoVariantWidths(0), []);
  });

  test("nome da cópia sai do nome da original (disco e bucket)", () => {
    assert.equal(photoVariantUrl("/uploads/abc.jpg", 640), "/uploads/abc-w640.webp");
    assert.equal(photoVariantUrl("/uploads/abc.webp", 320), "/uploads/abc-w320.webp");
    assert.equal(photoVariantUrl("https://cdn.exemplo.com/fotos/abc.png", 1024), "https://cdn.exemplo.com/fotos/abc-w1024.webp");
  });

  test("srcset com largura de cada cópia; sem cópias, nada (fica a original)", () => {
    assert.equal(
      photoSrcSet("/uploads/abc.jpg", [640, 320], (u) => `http://api${u}`),
      "http://api/uploads/abc-w320.webp 320w, http://api/uploads/abc-w640.webp 640w",
    );
    assert.equal(photoSrcSet("/uploads/abc.jpg", []), undefined);
    assert.equal(photoSrcSet("/uploads/abc.jpg", undefined), undefined);
    assert.equal(photoSrcSet(undefined, [320]), undefined);
  });
});

describe("Geração das cópias", () => {
  test("WebP nas larguras certas, proporção mantida, menores que a original", async () => {
    const original = await jpeg(2000, 1500);
    const variants = await makePhotoVariants(original);
    assert.deepEqual(
      variants.map((v) => v.width),
      [320, 640, 800, 1024, 1600],
    );
    for (const variant of variants) {
      assert.equal(sniffFileType(variant.buffer), "image/webp");
      const meta = await sharp(variant.buffer).metadata();
      assert.equal(meta.width, variant.width);
      assert.equal(meta.height, Math.round((variant.width * 1500) / 2000));
    }
  });

  test("arquivo que não é imagem não vira cópia (erro, sem gravar nada)", async () => {
    await assert.rejects(makePhotoVariants(Buffer.from("<svg onload=alert(1)>")));
  });
});

describe("Gravação junto da original", () => {
  test("grava a original e as cópias no disco, com o nome derivado", async () => {
    const storage = getPhotoStorage();
    const saved = await savePhotoWithVariants(storage, { buffer: await jpeg(900, 600), originalname: "f.jpg", mimetype: "image/jpeg" });
    created.push(saved.url, ...saved.widths.map((w) => photoVariantUrl(saved.url, w)));
    assert.match(saved.url, /^\/uploads\/[0-9a-f-]{36}\.jpg$/);
    assert.deepEqual(saved.widths, [320, 640, 800, 900]);
    for (const w of saved.widths) {
      const bytes = await readFile(join(UPLOADS_DIR, photoVariantUrl(saved.url, w).replace(/^\/uploads\//, "")));
      assert.equal(sniffFileType(bytes), "image/webp");
    }

    await removePhotoWithVariants(storage, saved.url, saved.widths);
    assert.equal(existsSync(join(UPLOADS_DIR, saved.url.replace(/^\/uploads\//, ""))), false);
    for (const w of saved.widths) assert.equal(existsSync(join(UPLOADS_DIR, photoVariantUrl(saved.url, w).replace(/^\/uploads\//, ""))), false);
  });

  test("se as cópias falharem, a foto sobe assim mesmo (só sem cópias)", async () => {
    const real = getPhotoStorage();
    const broken: PhotoStorage = { ...real, save: real.save.bind(real), remove: real.remove.bind(real), read: real.read.bind(real), owns: real.owns.bind(real), saveVariant: async () => { throw new Error("disco cheio"); } };
    const saved = await savePhotoWithVariants(broken, { buffer: await jpeg(700, 500), originalname: "f.jpg", mimetype: "image/jpeg" });
    created.push(saved.url);
    assert.deepEqual(saved.widths, []);
    assert.ok(existsSync(join(UPLOADS_DIR, saved.url.replace(/^\/uploads\//, ""))));
  });

  test("cópia só no nosso armazenamento, só WebP e nunca fora da pasta de fotos", async () => {
    const storage = getPhotoStorage();
    const webp = await sharp(await jpeg(64, 48)).webp().toBuffer();
    await assert.rejects(storage.saveVariant("https://golpe.com/a.jpg", 320, webp), /fora/);
    await assert.rejects(storage.saveVariant("/uploads/../../etc/passwd.jpg", 320, webp), /fora/);
    await assert.rejects(storage.saveVariant(`/uploads/${randomUUID()}.jpg`, 320, await jpeg(64, 48)), /não confere/);
    assert.equal(storage.owns("/uploads/abc.jpg"), true);
    assert.equal(storage.owns("https://crm.exemplo.com/foto.jpg"), false);
  });
});

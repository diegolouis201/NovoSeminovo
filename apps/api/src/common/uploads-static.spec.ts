import "reflect-metadata";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { UPLOADS_STATIC_OPTIONS } from "./cors";

// Auditoria web (16/11/2026), item 8: foto em /uploads tem nome único
// (uuid, nunca regravado com outro conteúdo; a cópia menor tem nome
// derivado e é feita uma vez só), então o celular pode guardar por 1 ano
// sem perguntar de novo. Continua só para o próprio site embutir.

@Module({})
class EmptyModule {}

describe("Cabeçalhos das fotos em /uploads", () => {
  let app: NestExpressApplication;
  let base = "";
  let dir = "";

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), "uploads-"));
    await writeFile(join(dir, "0b6f4c1e-1111-4222-8333-944455556666.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    app = await NestFactory.create<NestExpressApplication>(EmptyModule, { logger: false });
    app.useStaticAssets(dir, { prefix: "/uploads", ...UPLOADS_STATIC_OPTIONS });
    await app.listen(0, "127.0.0.1");
    base = (await app.getUrl()).replace("[::1]", "127.0.0.1");
  });

  after(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });

  test("cache de 1 ano, imutável, e só o próprio site embute", async () => {
    const res = await fetch(`${base}/uploads/0b6f4c1e-1111-4222-8333-944455556666.jpg`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.equal(res.headers.get("cross-origin-resource-policy"), "same-site");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  });

  test("arquivo que não existe não ganha cache longo", async () => {
    const res = await fetch(`${base}/uploads/nao-existe.jpg`);
    assert.equal(res.status, 404);
    assert.notEqual(res.headers.get("cache-control"), "public, max-age=31536000, immutable");
  });
});

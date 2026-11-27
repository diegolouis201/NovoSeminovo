import { describe, test, after } from "node:test";
import assert from "node:assert/strict";
import { Controller, Module, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { APP_FILTER, NestFactory } from "@nestjs/core";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { UploadErrorFilter } from "./upload-errors";

// Erro do envio de arquivo (multer) é erro de quem enviou: 400/413, nunca
// 500. O multer novo (2.5, com as correções de DoS) mudou as mensagens que o
// Nest 10 usava para reconhecer o erro ("Unexpected field" virou
// "Unexpected file field"); sem o filtro, campo errado virava 500.

@Controller("envio")
class UploadController {
  @Post()
  @UseInterceptors(FileInterceptor("crlv", { storage: memoryStorage(), limits: { fileSize: 1000 } }))
  upload(@UploadedFile() file?: Express.Multer.File) {
    return { size: file?.size ?? 0 };
  }
}

@Module({ controllers: [UploadController], providers: [{ provide: APP_FILTER, useClass: UploadErrorFilter }] })
class UploadModule {}

describe("Erros de envio de arquivo", async () => {
  const app = await NestFactory.create(UploadModule, { logger: false });
  await app.listen(0);
  const base = await app.getUrl();
  after(() => app.close());

  const send = (field: string, bytes: number) => {
    const form = new FormData();
    form.append(field, new Blob([Buffer.alloc(bytes, 1)], { type: "image/png" }), "a.png");
    return fetch(`${base}/envio`, { method: "POST", body: form });
  };

  test("arquivo no campo errado: 400", async () => {
    const res = await send("outro", 10);
    assert.equal(res.status, 400);
    const body = (await res.json()) as { statusCode: number; message: string };
    assert.equal(body.statusCode, 400);
  });

  test("arquivo grande demais: 413", async () => {
    assert.equal((await send("crlv", 5000)).status, 413);
  });

  test("envio normal continua funcionando", async () => {
    const res = await send("crlv", 10);
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { size: 10 });
  });
});

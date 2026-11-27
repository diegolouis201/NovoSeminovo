import { describe, test, after } from "node:test";
import assert from "node:assert/strict";
import { Body, Controller, Module, Post, Req } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { JSON_LIMIT_LARGE, JSON_LIMIT_SMALL, jsonBodyLimit, usesLargeJsonLimit } from "./body-limits";

// Tamanho máximo do corpo JSON. O corpo é lido ANTES do limite de pedidos
// (ThrottlerGuard), então 12 MB em toda rota pública (login, contato,
// cadastro…) deixava qualquer um fazer a API ler e decodificar 12 MB por
// pedido. Agora: 1 MB nas rotas públicas; 12 MB só onde chega imagem em
// base64 ou lote grande (Hub, marketing por chave, API de integração).

@Controller()
class EchoController {
  @Post(["auth/login", "hub/marketing/midias", "integrations/v1/listings/batch", "marketing/midias", "marketing/subscribe", "webhooks/stripe"])
  echo(@Body() body: unknown, @Req() req: { rawBody?: Buffer }) {
    return { size: JSON.stringify(body).length, raw: req.rawBody?.length ?? 0 };
  }
}

@Module({ controllers: [EchoController] })
class EchoModule {}

describe("Limite do corpo JSON por rota", async () => {
  const app = await NestFactory.create<NestExpressApplication>(EchoModule, { logger: false, rawBody: true });
  app.use(jsonBodyLimit);
  await app.listen(0);
  const base = await app.getUrl();
  after(() => app.close());

  const post = (path: string, bytes: number) =>
    fetch(`${base}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: "a".repeat(bytes) }) });

  test("rota pública recusa mais de 1 MB (413)", async () => {
    assert.equal((await post("auth/login", 2_000_000)).status, 413);
    assert.equal((await post("marketing/subscribe", 2_000_000)).status, 413);
  });

  test("rota pública aceita corpo normal", async () => {
    const res = await post("auth/login", 500_000);
    assert.equal(res.status, 201);
  });

  test("Hub, marketing por chave e API de integração aceitam até 12 MB", async () => {
    for (const path of ["hub/marketing/midias", "marketing/midias", "integrations/v1/listings/batch"]) {
      assert.equal((await post(path, 8_000_000)).status, 201, path);
    }
    assert.equal((await post("hub/marketing/midias", 13_000_000)).status, 413);
  });

  test("webhooks continuam recebendo o corpo cru (assinatura)", async () => {
    const res = await post("webhooks/stripe", 100);
    const body = (await res.json()) as { raw: number };
    assert.ok(body.raw > 100);
  });

  test("valores e rotas", () => {
    assert.equal(JSON_LIMIT_SMALL, "1mb");
    assert.equal(JSON_LIMIT_LARGE, "12mb");
    assert.equal(usesLargeJsonLimit("/hub/financeiro/importar"), true);
    assert.equal(usesLargeJsonLimit("/marketing/prospeccao"), true);
    assert.equal(usesLargeJsonLimit("/marketing/subscribe"), false);
    assert.equal(usesLargeJsonLimit("/listings"), false);
    assert.equal(usesLargeJsonLimit("/hubx/qualquer"), false);
  });
});

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { CatalogFeedsController } from "./catalog-feeds.controller";
import type { CatalogFeedsService } from "./catalog-feeds.service";

// Rotas públicas que a Meta busca: só GET, XML com charset, cache de 1 hora,
// sem indexação, contagem de quem ficou de fora no cabeçalho e rate limit
// próprio (mais apertado que o global).

function fakeResponse() {
  const headers: Record<string, string> = {};
  return { headers, setHeader: (name: string, value: string) => void (headers[name.toLowerCase()] = String(value)) };
}

describe("CatalogFeedsController", () => {
  const feeds = {
    vehicleFeed: async () => ({ xml: "<listings></listings>", included: 4, skippedNoPhoto: 2 }),
    homeListingFeed: async () => ({ xml: "<listings><x/></listings>", included: 7, skippedNoPhoto: 0 }),
  } as unknown as CatalogFeedsService;
  const controller = new CatalogFeedsController(feeds);

  test("caminhos /feeds/meta/veiculos.xml e /feeds/meta/imoveis.xml, só GET", () => {
    assert.equal(Reflect.getMetadata(PATH_METADATA, CatalogFeedsController), "feeds/meta");
    for (const [method, path] of [["vehicles", "veiculos.xml"], ["homes", "imoveis.xml"]] as const) {
      const handler = CatalogFeedsController.prototype[method];
      assert.equal(Reflect.getMetadata(PATH_METADATA, handler), path);
      assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), RequestMethod.GET);
    }
    const handlers = Object.getOwnPropertyNames(CatalogFeedsController.prototype).filter((name) => name !== "constructor");
    assert.deepEqual(handlers.sort(), ["homes", "vehicles"]);
  });

  test("veículos: XML, cache de 1 h, noindex e contagens", async () => {
    const res = fakeResponse();
    const body = await controller.vehicles(res as never);
    assert.equal(body, "<listings></listings>");
    assert.equal(res.headers["content-type"], "application/xml; charset=utf-8");
    assert.equal(res.headers["cache-control"], "public, max-age=3600");
    assert.equal(res.headers["x-robots-tag"], "noindex");
    assert.equal(res.headers["x-feed-itens"], "4");
    assert.equal(res.headers["x-feed-sem-foto"], "2");
  });

  test("imóveis: mesmo tratamento", async () => {
    const res = fakeResponse();
    assert.equal(await controller.homes(res as never), "<listings><x/></listings>");
    assert.equal(res.headers["content-type"], "application/xml; charset=utf-8");
    assert.equal(res.headers["x-feed-itens"], "7");
  });

  test("rate limit próprio de 30 por minuto", () => {
    const limit = Reflect.getMetadata("THROTTLER:LIMITdefault", CatalogFeedsController);
    const ttl = Reflect.getMetadata("THROTTLER:TTLdefault", CatalogFeedsController);
    assert.equal(limit, 30);
    assert.equal(ttl, 60_000);
  });
});

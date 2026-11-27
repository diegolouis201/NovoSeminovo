import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { ListingsController } from "./listings.controller";

// Rotas que chamam a IA (custam dinheiro a cada pedido) têm limite próprio
// por visitante, mais apertado que o global de 120/min — mesmo padrão do
// Arquiteto (10/min) e da importação de anúncio (6/min).
const AI_ROUTES = ["generateDraft", "extractCrlv", "recommendVehicle", "recommendProperty", "classifyPhotos"] as const;

describe("Limite das rotas de IA do anúncio", () => {
  for (const route of AI_ROUTES) {
    test(`${route}: no máximo 10 por minuto`, () => {
      const handler = ListingsController.prototype[route];
      assert.equal(Reflect.getMetadata("THROTTLER:LIMITdefault", handler), 10);
      assert.equal(Reflect.getMetadata("THROTTLER:TTLdefault", handler), 60_000);
    });
  }
});

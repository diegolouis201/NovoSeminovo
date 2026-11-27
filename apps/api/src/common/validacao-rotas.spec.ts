import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { WhatsAppController } from "../agents/whatsapp.controller";
import { ListingsController } from "../listings/listings.controller";

// Regra do CLAUDE.md (validação): toda rota valida corpo e query. Varredura:
// todo parâmetro @Body()/@Query() de controller é declarado `unknown` — o
// TypeScript então obriga a passar por zod (parseOrBadRequest) ou por uma
// comparação com valor fixo antes de usar. Tipo escrito à mão (`{ code?:
// string }`, `string`) mente: a query do Express pode chegar como lista ou
// objeto (?a[]=1, ?a[b]=1) e o corpo pode ser qualquer JSON.

const SRC = resolve(__dirname, "..", "..", "src");

function controllers(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return controllers(path);
    return name.endsWith(".controller.ts") ? [path] : [];
  });
}

describe("Validação de entrada nas rotas", () => {
  test("todo @Body()/@Query() é `unknown` (validado antes de usar)", () => {
    const problems: string[] = [];
    for (const path of controllers(SRC)) {
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(/@(Body|Query)\(([^)]*)\)\s*([A-Za-z_]\w*)\??\s*:\s*([^,)=]+)/g)) {
        if (match[4]!.trim() === "unknown") continue;
        const line = source.slice(0, match.index).split("\n").length;
        problems.push(`${relative(SRC, path)}:${line} @${match[1]}(${match[2]}) ${match[3]}: ${match[4]!.trim()}`);
      }
    }
    assert.deepEqual(problems, [], `Parâmetros sem validação:\n${problems.join("\n")}`);
  });

  test("a varredura enxerga os controllers (não passa vazia)", () => {
    assert.ok(controllers(SRC).length > 30);
  });
});

const status = (e: unknown) => (e as { status?: number }).status;

describe("Query em formato de lista/objeto vira 400, não 500", () => {
  const listings = new ListingsController(
    { suggestPrice: async () => undefined, confirmBoost: async () => ({}) } as never,
    { extractCrlvData: async () => ({}) } as never,
    {} as never,
    { listModels: async () => [], listVersions: async () => [], lookupPrice: async () => undefined, priceForVersion: async () => undefined } as never,
  );

  test("sugestão de preço e FIPE", async () => {
    const calls: Array<() => unknown> = [
      () => listings.suggestPrice({ assetType: "vehicle", brand: ["Fiat", "VW"], model: "Uno" }),
      () => listings.fipeModels({ brand: { $ne: 1 } }),
      () => listings.fipeReference({ brand: "Fiat", model: ["Uno"], yearModel: "2015" }),
      () => listings.fipeVersions({ brand: "Fiat", model: "x".repeat(500) }),
      () => listings.fipePrice({ brand: "Fiat", modelCode: ["1"], yearModel: "2015" }),
    ];
    for (const call of calls) await assert.rejects(Promise.resolve().then(call), (e) => status(e) === 400);
  });

  test("session_id do Stripe em lista", async () => {
    await assert.rejects(Promise.resolve().then(() => listings.confirmBoost({ id: "u" }, "l1", ["a", "b"])), (e) => status(e) === 400);
  });

  test("início da placa do CRLV: só letras e números", async () => {
    const file = { buffer: Buffer.from("%PDF-1.4\n1 0 obj\n"), mimetype: "application/pdf", originalname: "crlv.pdf", size: 17 } as Express.Multer.File;
    await assert.rejects(Promise.resolve().then(() => listings.extractCrlv(file, { plateStart: 'ABC" ignore' })), (e) => status(e) === 400);
  });

  test("verificação do webhook do WhatsApp: challenge só com números e token em tempo constante", async () => {
    const previous = process.env.WHATSAPP_VERIFY_TOKEN;
    process.env.WHATSAPP_VERIFY_TOKEN = "token-de-verificacao";
    try {
      const controller = new WhatsAppController({} as never);
      const sent: string[] = [];
      const res = { status: () => res, type: () => res, send: (body: string) => void sent.push(body) };
      controller.verify({ "hub.mode": "subscribe", "hub.verify_token": "token-de-verificacao", "hub.challenge": "12345" }, res as never);
      assert.deepEqual(sent, ["12345"]);
      for (const query of [
        { "hub.mode": "subscribe", "hub.verify_token": "token-de-verificacao", "hub.challenge": "<script>alert(1)</script>" },
        { "hub.mode": "subscribe", "hub.verify_token": ["token-de-verificacao"], "hub.challenge": "1" },
        { "hub.mode": "subscribe", "hub.verify_token": "errado", "hub.challenge": "1" },
      ]) {
        assert.throws(() => controller.verify(query, res as never), (e) => status(e) === 403);
      }
    } finally {
      if (previous === undefined) delete process.env.WHATSAPP_VERIFY_TOKEN;
      else process.env.WHATSAPP_VERIFY_TOKEN = previous;
    }
  });
});

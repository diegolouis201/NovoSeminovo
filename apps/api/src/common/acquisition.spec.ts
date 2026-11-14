import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { campaignKey, classifyAcquisition, parseAcquisition, serializeAcquisition } from "@novoseminovo/shared-types";
import { acquisitionFields, acquisitionFrom } from "./acquisition";

// Origem do visitante com o detalhe das campanhas pagas (Etapa 1 de
// marketing, 14/11/2026): além de canal, meio e campanha, o cookie guarda o
// anúncio (utm_content), o público (utm_term) e o id do clique da Meta
// (fbclid). Cookies antigos (3 partes) continuam valendo.

describe("Origem do visitante: anúncio, público e clique", () => {
  test("utm_content, utm_term e fbclid entram na origem", () => {
    const origin = classifyAcquisition({
      utmSource: "meta",
      utmMedium: "paid",
      utmCampaign: "Lojas Novembro",
      utmContent: "Video Vitrine 01",
      utmTerm: "Donos de loja SP",
      fbclid: "IwAR3xYz_AbC-123",
    });
    assert.deepEqual(origin, {
      source: "meta_ads",
      medium: "paid",
      campaign: "lojas_novembro",
      content: "video_vitrine_01",
      term: "donos_de_loja_sp",
      clickId: "IwAR3xYz_AbC-123",
    });
  });

  test("ida e volta pelo cookie preserva tudo, inclusive maiúsculas do fbclid", () => {
    const origin = classifyAcquisition({ utmSource: "instagram", utmMedium: "paid", utmCampaign: "c1", utmContent: "a1", utmTerm: "p1", fbclid: "AbC123" });
    const raw = serializeAcquisition(origin);
    assert.equal(raw, "meta_ads|paid|c1|a1|p1|AbC123");
    assert.deepEqual(parseAcquisition(encodeURIComponent(raw)), origin);
  });

  test("cookie antigo (origem|meio|campanha) continua sendo lido", () => {
    assert.deepEqual(parseAcquisition("instagram|social|verao"), { source: "instagram", medium: "social", campaign: "verao" });
    assert.deepEqual(parseAcquisition("direto||"), { source: "direto" });
    const old = serializeAcquisition({ source: "google", medium: "organic" });
    assert.equal(old, "google|organic|");
  });

  test("sem o detalhe novo, o formato gravado é o mesmo de antes", () => {
    assert.equal(serializeAcquisition({ source: "facebook", medium: "social", campaign: "x" }), "facebook|social|x");
  });

  test("tamanhos limitados e caracteres perigosos fora", () => {
    const origin = classifyAcquisition({ utmSource: "meta", utmContent: "x".repeat(500), utmTerm: "<script>alert(1)</script>", fbclid: `${"a".repeat(400)}"><img>` });
    assert.ok((origin.content ?? "").length <= 100);
    assert.ok(!/[<>"]/.test(origin.term ?? ""), "público sem < > \"");
    assert.ok((origin.clickId ?? "").length <= 255);
    assert.match(origin.clickId ?? "", /^[A-Za-z0-9_-]+$/);
    const parsed = parseAcquisition(`meta_ads|paid|c|${"y".repeat(300)}|t|${"<b>".repeat(10)}`);
    assert.ok((parsed?.content ?? "").length <= 100);
    assert.equal(parsed?.clickId, "bbbbbbbbbb");
  });

  test("fbclid sem utm e sem site de origem conta como Facebook", () => {
    const origin = classifyAcquisition({ fbclid: "Zz9", referrer: "" });
    assert.equal(origin.source, "facebook");
    assert.equal(origin.clickId, "Zz9");
    const fromIg = classifyAcquisition({ fbclid: "Zz9", referrer: "https://l.instagram.com/" });
    assert.equal(fromIg.source, "instagram");
    assert.equal(fromIg.clickId, "Zz9");
  });

  test("valor inválido não vira origem", () => {
    assert.equal(parseAcquisition("hacker|x|y"), undefined);
    assert.equal(parseAcquisition(""), undefined);
  });

  test("chave de campanha: mesma regra do cookie, para casar com o nome no Meta", () => {
    assert.equal(campaignKey("  Lojas Novembro  "), "lojas_novembro");
    assert.equal(campaignKey("LOJAS_NOVEMBRO"), "lojas_novembro");
    assert.equal(campaignKey(""), undefined);
    assert.equal(campaignKey(classifyAcquisition({ utmSource: "meta", utmCampaign: "Lojas Novembro" }).campaign), "lojas_novembro");
  });
});

describe("Origem na API", () => {
  test("lê o cabeçalho do site e devolve os campos para gravar", () => {
    const request = { headers: { "x-ns-origem": encodeURIComponent("meta_ads|paid|lojas|anuncio_1|publico_a|Ab1") } } as never;
    const origin = acquisitionFrom(request);
    assert.deepEqual(acquisitionFields(origin), {
      acqSource: "meta_ads",
      acqMedium: "paid",
      acqCampaign: "lojas",
      acqContent: "anuncio_1",
      acqTerm: "publico_a",
      acqClickId: "Ab1",
    });
    assert.deepEqual(acquisitionFields(undefined), {});
  });
});

const withDb = Boolean(process.env.DATABASE_URL);

describe("Origem gravada (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaService } = require("../prisma/prisma.service") as typeof import("../prisma/prisma.service");
  const { AuthService } = require("../auth/auth.service") as typeof import("../auth/auth.service");
  const { leadOrigin } = require("./acquisition") as typeof import("./acquisition");
  const prisma = new PrismaService();
  const tag = `acq-${Date.now()}`;
  // CPF válido gerado a partir de 9 dígitos.
  const cpf = (seed: string) => {
    const d = seed.padStart(9, "1").slice(-9).split("").map(Number);
    for (const len of [9, 10]) {
      const sum = d.slice(0, len).reduce((acc, n, i) => acc + n * (len + 1 - i), 0);
      const rest = (sum * 10) % 11;
      d.push(rest === 10 ? 0 : rest);
    }
    return d.join("");
  };

  test("cadastro guarda anúncio, público e clique; lead do comprador herda o anúncio", async (t) => {
    t.after(async () => {
      await prisma.marketingContact.deleteMany({ where: { email: { contains: tag } } });
      await prisma.user.deleteMany({ where: { email: { contains: tag } } });
      await prisma.$disconnect();
    });
    const auth = new AuthService(prisma, {} as never, { capture: async () => undefined } as never);
    const user = await auth.register(
      { name: "Comprador Teste", email: `comprador-${tag}@teste.local`, password: "senha-bem-longa-123", cpf: cpf(String(Date.now()).slice(-9)) },
      { source: "meta_ads", medium: "paid", campaign: "compradores_nov", content: "carrossel_suv", term: "interesse_carros", clickId: "AbC9" },
    );
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.deepEqual(
      [row.acqSource, row.acqMedium, row.acqCampaign, row.acqContent, row.acqTerm, row.acqClickId],
      ["meta_ads", "paid", "compradores_nov", "carrossel_suv", "interesse_carros", "AbC9"],
    );
    assert.deepEqual(await leadOrigin(prisma, user.id, { source: "direto" }), { acqSource: "meta_ads", acqCampaign: "compradores_nov", acqContent: "carrossel_suv" });
    assert.deepEqual(await leadOrigin(prisma, user.id, { source: "google", campaign: "x", content: "y" }), { acqSource: "google", acqCampaign: "x", acqContent: "y" });
  });
});

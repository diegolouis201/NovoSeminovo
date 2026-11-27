import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { measureRoute, readBuild, routeEntries, routeScripts, scriptsContaining, SHARED_TYPES_BARREL_MARKER, ZOD_MARKER } from "./orcamento-js";

// Orçamento de JS das páginas públicas (27/11/2026). As contas puras rodam
// sempre; a conferência do build real roda quando existe `.next` de produção
// (depois de `pnpm --filter @novoseminovo/web build`). Com EXIGIR_BUILD=1
// (script `orcamento-js` e CI depois do build), faltar o build é erro.

describe("routeEntries / routeScripts", () => {
  test("soma os layouts do caminho e a página", () => {
    assert.deepEqual(routeEntries("/anuncio/[id]/page"), ["/layout", "/anuncio/layout", "/anuncio/[id]/layout", "/anuncio/[id]/page"]);
    assert.deepEqual(routeEntries("/page"), ["/layout", "/page"]);
  });

  test("não repete arquivo e ignora CSS", () => {
    const manifest = { pages: { "/layout": ["a.js", "b.js", "x.css"], "/busca/page": ["b.js", "c.js"] } };
    assert.deepEqual(routeScripts(manifest, "/busca/page"), ["a.js", "b.js", "c.js"]);
  });

  test("rota sem /page é erro de quem escreveu o teste", () => {
    assert.throws(() => routeEntries("/busca"));
  });
});

const NEXT_DIR = resolve(__dirname, "../../../.next");
const build = readBuild(NEXT_DIR);
const requireBuild = process.env.EXIGIR_BUILD === "1";

// Teto em KB (gzip) do JS que o navegador baixa para abrir cada página
// pública, já com o JS do layout raiz. Antes (27/11/2026, medição local):
// home 165,7 · busca 167,3 · anúncio 179,2 · para-lojas 156,9 ·
// para-lojas/comecar 160,0 · lojas 158,8 · guia 156,9.
const BUDGETS_KB: Record<string, number> = {
  "/page": 125,
  "/carros/page": 125,
  "/imoveis/page": 125,
  "/busca/page": 125,
  "/assistente-compra/page": 130,
  "/anuncio/[id]/page": 140,
  "/para-lojas/page": 120,
  "/para-lojas/comecar/page": 125,
  "/lojas/[slug]/page": 120,
  "/guia/page": 120,
};

describe("build de produção: orçamento de JS", { skip: !build && !requireBuild ? "sem build de produção em .next" : false }, () => {
  test("existe build de produção", () => {
    assert.ok(build, `rode pnpm --filter @novoseminovo/web build antes (procurado em ${NEXT_DIR})`);
  });

  test("layout raiz (toda página) não leva o zod nem o contrato inteiro do shared-types", () => {
    assert.ok(build);
    const layout = routeScripts(build.manifest, "/page").filter((file) => (build.manifest.pages["/layout"] ?? []).includes(file));
    assert.deepEqual(scriptsContaining(build, layout, ZOD_MARKER), [], "zod no JS do layout raiz");
    assert.deepEqual(scriptsContaining(build, layout, SHARED_TYPES_BARREL_MARKER), [], "shared-types inteiro no JS do layout raiz");
  });

  // A janela do assistente só é baixada no clique (ou ao passar o dedo/mouse
  // no botão): o JS do layout leva só o botão.
  test("janela do assistente fica fora do JS do layout e existe num arquivo à parte", () => {
    assert.ok(build);
    const marker = "Respostas geradas por IA podem conter erros";
    const layout = build.manifest.pages["/layout"] ?? [];
    assert.deepEqual(scriptsContaining(build, layout.filter((file) => file.endsWith(".js")), marker), [], "janela do assistente no JS do layout");
    const chunks = readdirSync(resolve(NEXT_DIR, "static/chunks")).filter((file) => file.endsWith(".js")).map((file) => `static/chunks/${file}`);
    assert.equal(scriptsContaining(build, chunks, marker).length, 1, "arquivo separado com a janela do assistente");
  });

  for (const [route, budget] of Object.entries(BUDGETS_KB)) {
    test(`${route} ≤ ${budget} KB gzip`, () => {
      assert.ok(build);
      const report = measureRoute(build, route);
      assert.ok(report.scripts.length > 0, `rota ${route} não está no build`);
      assert.ok(report.gzipKb <= budget, `${route}: ${report.gzipKb} KB gzip (teto ${budget} KB)`);
    });
  }
});

// Hub (apps/hub): painel interno, sem SEO, mas usado no celular. Nenhuma
// página deve levar o contrato inteiro do shared-types para o navegador.
// HUB_NEXT_DIR aponta outro build (ex.: cópia montada fora da pasta do dev).
const HUB_NEXT_DIR = process.env.HUB_NEXT_DIR ?? resolve(__dirname, "../../../../hub/.next");
const hubBuild = readBuild(HUB_NEXT_DIR);

describe("build de produção do Hub: contrato inteiro fora do navegador", { skip: hubBuild ? false : "sem build de produção do Hub" }, () => {
  test("nenhuma página do Hub leva o shared-types inteiro", () => {
    assert.ok(hubBuild);
    const pages = Object.keys(hubBuild.manifest.pages).filter((entry) => entry.endsWith("/page"));
    const heavy = pages.filter((route) => scriptsContaining(hubBuild, routeScripts(hubBuild.manifest, route), SHARED_TYPES_BARREL_MARKER).length > 0);
    assert.deepEqual(heavy, []);
  });
});

// O arquivo leve do shared-types (dist/navegador) só serve se continuar sem
// zod e sem puxar a raiz do pacote; e a raiz continua exportando tudo dele
// (a API e as telas que importam da raiz não mudam).
describe("shared-types/navegador: leve e reexportado pela raiz", () => {
  const source = readFileSync(resolve(__dirname, "../../../../../packages/shared-types/src/navegador.ts"), "utf8");

  test("não importa nada (nem zod, nem a raiz do pacote)", () => {
    assert.doesNotMatch(source, /^\s*import\s/m);
    assert.doesNotMatch(source, /require\(/);
  });

  test("a raiz do pacote reexporta o que está em navegador", () => {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const leve = require("@novoseminovo/shared-types/dist/navegador") as Record<string, unknown>;
    const raiz = require("@novoseminovo/shared-types") as Record<string, unknown>;
    for (const name of ["CONSENT_COOKIE", "ACQUISITION_COOKIE", "classifyAcquisition", "parseMetaEventQueue", "safeInternalPath", "isTrustedExternalLink", "formatBRL", "AFFILIATE_RULES", "CAMPAIGN_BUSINESS_TYPES", "MKT_REDES"]) {
      assert.ok(name in leve, `${name} em dist/navegador`);
      assert.equal(raiz[name], leve[name], `${name} igual na raiz`);
    }
  });
});

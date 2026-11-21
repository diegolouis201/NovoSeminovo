import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { GUIDES, GUIDES_UPDATED_AT, guideUrl } from "../guias";
import { STATIC_PAGES, buildSitemap } from "./sitemap";

// Auditoria de SEO (21/11/2026), item 11: toda URL do sitemap com <lastmod>
// real; anúncios ativos e vitrines das lojas incluídos.

const SITE = "https://novoseminovo.com.br";
const at = (url: string, entries: ReturnType<typeof buildSitemap>) => entries.find((entry) => entry.url === url);

describe("buildSitemap", () => {
  const listings = [
    { id: "l2", updatedAt: "2026-11-25T10:00:00.000Z" },
    { id: "l1", updatedAt: "2026-11-01T10:00:00.000Z" },
  ];
  const storefronts = [{ slug: "auto-bh", updatedAt: "2026-11-19T08:00:00.000Z" }, { slug: "sem-data" }];
  const entries = buildSitemap({ siteUrl: SITE, listings, storefronts });

  test("toda URL tem lastModified em data válida", () => {
    for (const entry of entries) {
      assert.ok(entry.lastModified, `${entry.url} sem lastModified`);
      assert.ok(!Number.isNaN(new Date(entry.lastModified!).getTime()), `${entry.url}: ${entry.lastModified}`);
    }
  });

  test("páginas fixas usam a data da tabela (atualizada a cada mudança de texto)", () => {
    const comoFunciona = STATIC_PAGES.find((page) => page.path === "/como-funciona")!;
    assert.equal(at(`${SITE}/como-funciona`, entries)?.lastModified, comoFunciona.updatedAt);
    for (const page of STATIC_PAGES) assert.match(page.updatedAt, /^\d{4}-\d{2}-\d{2}$/, page.path);
  });

  test("início, /carros, /imoveis e /busca: a data mais nova entre a página e os anúncios", () => {
    assert.equal(at(SITE, entries)?.lastModified, "2026-11-25T10:00:00.000Z");
    assert.equal(at(`${SITE}/carros`, entries)?.lastModified, "2026-11-25T10:00:00.000Z");
    // Sem anúncio, fica a data da página.
    const vazio = buildSitemap({ siteUrl: SITE, listings: [], storefronts: [] });
    assert.equal(at(SITE, vazio)?.lastModified, STATIC_PAGES.find((page) => page.path === "/")!.updatedAt);
  });

  test("/anunciar continua no sitemap (agora é página pública)", () => {
    assert.ok(at(`${SITE}/anunciar`, entries));
  });

  test("guias: data do guia; índices: a mais nova dos guias", () => {
    const guia = GUIDES[0]!;
    const esperado = guia.publishedAt > GUIDES_UPDATED_AT ? guia.publishedAt : GUIDES_UPDATED_AT;
    assert.equal(at(`${SITE}${guideUrl(guia)}`, entries)?.lastModified, esperado);
    assert.ok(at(`${SITE}/guia`, entries)?.lastModified);
    assert.ok(at(`${SITE}/guia/comprar-imovel`, entries)?.lastModified);
  });

  test("anúncios ativos e lojas com a data da última alteração", () => {
    assert.equal(at(`${SITE}/anuncio/l1`, entries)?.lastModified, "2026-11-01T10:00:00.000Z");
    assert.equal(at(`${SITE}/lojas/auto-bh`, entries)?.lastModified, "2026-11-19T08:00:00.000Z");
    // Loja sem data (API antiga): cai na data mais nova dos anúncios.
    assert.equal(at(`${SITE}/lojas/sem-data`, entries)?.lastModified, "2026-11-25T10:00:00.000Z");
  });

  test("só páginas públicas, sem área logada nem itens descontinuados", () => {
    for (const entry of entries) {
      assert.doesNotMatch(entry.url, /\/(admin|parceiro|conta|entrar|cadastro|api|consultar-veiculo|recompensas|veiculo)(\/|$)/, entry.url);
    }
    assert.equal(new Set(entries.map((entry) => entry.url)).size, entries.length, "URL repetida");
  });
});

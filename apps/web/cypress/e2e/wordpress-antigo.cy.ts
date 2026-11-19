// O domínio já teve um WordPress (com o plugin WP Directory Kit). O Google
// Search Console ainda lista endereços dele, como /wdk-listing/meadow-view/,
// que hoje dão 404. Respondendo 410 (Gone), o Google tira esses endereços do
// índice mais rápido. Só endereços do WordPress antigo: nenhuma página atual
// pode ser afetada, e o robots.txt não pode bloqueá-los (senão o Google nem
// chega a ver o 410).

const LEGACY_URLS = [
  "/wdk-listing/meadow-view/",
  "/wdk-listing/meadow-view",
  "/wdk-listing/",
  "/wdk-search/",
  "/wdk-agent/joao/",
  "/wp-content/uploads/2023/05/foto.jpg",
  "/wp-admin/",
  "/wp-admin/admin-ajax.php",
  "/wp-includes/js/jquery/jquery.min.js",
  "/wp-json/wp/v2/posts",
  "/wp-login.php",
  "/xmlrpc.php",
  "/listing/casa-no-centro/",
  "/listings/",
  "/author/admin/",
  "/category/sem-categoria/",
  "/tag/apartamento/",
  "/feed/",
  "/feed",
  "/comments/feed/",
  "/category/carros/feed/",
  "/?p=123",
  "/?page_id=45",
  "/index.php",
  "/index.php/2023/01/ola-mundo/",
];

// Padrões do WordPress antigo: nada no sitemap pode cair neles.
const LEGACY_PATTERNS = [
  /^\/wdk-/,
  /^\/wp-(content|admin|includes|json)(\/|$)/,
  /^\/wp-login\.php/,
  /^\/xmlrpc\.php/,
  /^\/listings?(\/|$)/,
  /^\/(author|category|tag)(\/|$)/,
  /(^|\/)feed\/?$/,
  /^\/index\.php/,
  /[?&](p|page_id)=\d+/,
];

describe("Endereços do WordPress antigo respondem 410", () => {
  for (const url of LEGACY_URLS) {
    it(`${url} → 410 com noindex`, () => {
      cy.request({ url, failOnStatusCode: false, followRedirect: false }).then((res) => {
        expect(res.status, url).to.eq(410);
        expect(res.headers["x-robots-tag"], url).to.include("noindex");
        expect(String(res.headers["content-type"])).to.include("text/html");
        expect(res.body).to.include("Esta página não existe mais");
        expect(res.body).to.include('href="/"');
      });
    });
  }

  it("a página do 410 leva de volta para o início", () => {
    cy.visit("/wdk-listing/meadow-view/", { failOnStatusCode: false });
    cy.contains("Esta página não existe mais");
    cy.contains("a", "Ir para o NovoSeminovo").click();
    cy.location("pathname").should("eq", "/");
  });

  it("páginas atuais continuam iguais", () => {
    const real = ["/", "/carros", "/imoveis", "/guia", "/para-lojas/comecar", "/busca?p=2", "/?page=2"];
    for (const url of real) {
      cy.request({ url, failOnStatusCode: false }).then((res) => {
        expect(res.status, url).to.eq(200);
        expect(res.headers["x-robots-tag"], url).to.eq(undefined);
      });
    }
    cy.request(`${Cypress.env("apiUrl")}/listings/sitemap`).then(({ body }) => {
      const { listings, storefronts } = body as { listings: { id: string }[]; storefronts: { slug: string }[] };
      expect(listings.length).to.be.greaterThan(0);
      expect(storefronts.length).to.be.greaterThan(0);
      for (const url of [`/anuncio/${listings[0].id}`, `/lojas/${storefronts[0].slug}`]) {
        cy.request({ url, failOnStatusCode: false }).then((res) => {
          expect(res.status, url).to.eq(200);
          expect(res.headers["x-robots-tag"], url).to.eq(undefined);
        });
      }
    });
    // Rota da API do site que termina em /feed não é do WordPress.
    cy.request({ url: "/api/social/nao-existe/feed", failOnStatusCode: false, followRedirect: false })
      .its("status")
      .should("not.eq", 410);
  });

  it("endereço atual com barra no fim continua indo para o sem barra (308)", () => {
    const cases: [string, string][] = [
      ["/carros/", "/carros"],
      ["/carros/?marca=fiat", "/carros?marca=fiat"],
      ["/guia/comprar-carro-usado/", "/guia/comprar-carro-usado"],
    ];
    for (const [from, to] of cases) {
      cy.request({ url: from, failOnStatusCode: false, followRedirect: false }).then((res) => {
        expect(res.status, from).to.eq(308);
        const location = new URL(String(res.headers.location), "http://x");
        expect(location.pathname + location.search, from).to.eq(to);
      });
    }
  });

  it("o redirecionamento da barra não leva para outro site", () => {
    for (const url of ["/%2Fexemplo.com/", "/%5Cexemplo.com/"]) {
      cy.request({ url, failOnStatusCode: false, followRedirect: false }).then((res) => {
        const location = String(res.headers.location ?? "");
        expect(location, url).not.to.match(/^\/\/|^\/\\|^https?:\/\/(?!localhost)/);
        expect(new URL(location, Cypress.config("baseUrl") as string).origin, url).to.eq(new URL(Cypress.config("baseUrl") as string).origin);
      });
    }
  });

  it("robots.txt não bloqueia os endereços antigos (o Google precisa ver o 410)", () => {
    cy.request("/robots.txt").then(({ body }) => {
      const disallowed = String(body)
        .split("\n")
        .filter((line) => /^disallow:/i.test(line.trim()))
        .map((line) => line.split(":").slice(1).join(":").trim());
      for (const url of LEGACY_URLS) {
        const blocked = disallowed.filter((rule) => rule && url.startsWith(rule.replace(/\*.*$/, "")));
        expect(blocked, url).to.deep.eq([]);
      }
    });
  });

  it("o sitemap só tem endereços atuais", () => {
    cy.request("/sitemap.xml").then(({ body }) => {
      const locs = [...String(body).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
      expect(locs.length).to.be.greaterThan(10);
      for (const loc of locs) {
        const { pathname, search } = new URL(loc);
        for (const pattern of LEGACY_PATTERNS) {
          expect(pattern.test(pathname + search), `${loc} ~ ${pattern}`).to.eq(false);
        }
      }
    });
  });
});

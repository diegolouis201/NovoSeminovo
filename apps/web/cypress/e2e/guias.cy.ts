// Guias de SEO (fase 1, texto do marketing revisado pelo Diego, 16/11/2026):
// cinco guias em /guia/..., páginas de índice, marcação para o Google
// (Article, FAQPage, BreadcrumbList) e entrada no sitemap.

const GUIAS = [
  {
    url: "/guia/comprar-carro-usado/como-evitar-golpe",
    h1: "Como evitar golpe na compra de carro usado",
    title: "Como evitar golpe na compra de carro usado | NovoSeminovo",
  },
  {
    url: "/guia/vender-carro/documentos",
    h1: "Documentos para vender carro",
    title: "Documentos para vender carro: lista completa | NovoSeminovo",
  },
  {
    url: "/guia/comprar-carro-usado/como-avaliar",
    h1: "Como avaliar um carro usado antes de comprar",
    title: "Como avaliar um carro usado: checklist antes de comprar | NovoSeminovo",
  },
  {
    url: "/guia/comprar-imovel/matricula-atualizada",
    h1: "Matrícula atualizada do imóvel: o que é e onde pedir",
    title: "Matrícula atualizada do imóvel: o que é e onde pedir | NovoSeminovo",
  },
  {
    url: "/guia/comprar-imovel/golpes",
    h1: "Golpes na compra e no aluguel de imóvel: como se proteger",
    title: "Golpes na compra e no aluguel de imóvel: como se proteger | NovoSeminovo",
  },
];

const AVISO = "Conteúdo informativo. Regras de Detran e cartório mudam de estado para estado: confira no órgão do seu estado.";

function jsonLdTypes(): Cypress.Chainable<string[]> {
  return cy.get('script[type="application/ld+json"]').then(($scripts) => {
    const types: string[] = [];
    $scripts.each((_, el) => {
      const data = JSON.parse(el.textContent ?? "{}");
      const items = Array.isArray(data) ? data : data["@graph"] ?? [data];
      for (const item of items) types.push(item["@type"]);
    });
    return types;
  });
}

describe("Guias", () => {
  for (const guia of GUIAS) {
    it(`${guia.url}: título, H1, aviso e marcação para o Google`, () => {
      cy.visit(guia.url);
      cy.title().should("eq", guia.title);
      cy.get("h1").should("have.text", guia.h1);
      cy.contains(AVISO).should("be.visible");
      cy.contains("h2", "Perguntas frequentes").should("be.visible");
      cy.get('link[rel="canonical"]').should("have.attr", "href").and("match", new RegExp(`${guia.url}$`));
      cy.get('meta[property="og:title"]').should("have.attr", "content", guia.title);
      cy.get('meta[name="description"]').should("have.attr", "content").and("have.length.greaterThan", 50);
      jsonLdTypes().should("include.members", ["Article", "FAQPage", "BreadcrumbList"]);
      cy.get('script[type="application/ld+json"]').then(($scripts) => {
        const faq = $scripts
          .toArray()
          .flatMap((el) => {
            const data = JSON.parse(el.textContent ?? "{}");
            return Array.isArray(data) ? data : data["@graph"] ?? [data];
          })
          .find((item) => item["@type"] === "FAQPage");
        expect(faq.mainEntity.length).to.be.greaterThan(1);
        expect(faq.mainEntity[0].acceptedAnswer.text).to.have.length.greaterThan(20);
      });
    });
  }

  it("ajustes aprovados: selo sem CRECI/CNPJ confirmados e sem simulação", () => {
    for (const url of [GUIAS[0].url, GUIAS[4].url]) {
      cy.visit(url);
      cy.contains("main", "selo verificado (empresa conferida pela nossa equipe)").should("exist");
      cy.get("main").should("not.contain.text", "CRECI confirmados");
    }
    cy.visit(GUIAS[2].url);
    cy.contains("main", "veja as opções de financiamento no próprio anúncio").should("exist");
    cy.contains("main", "O NovoSeminovo não é instituição financeira e não concede crédito.").should("exist");
    cy.get("main").should("not.contain.text", "simule o financiamento");
    cy.get('main a[href="/busca?assetType=vehicle&bodyType=suv"]').should("exist");
  });

  it("links internos levam a páginas que existem", () => {
    cy.visit(GUIAS[0].url);
    cy.get('main a[href="/carros"]').should("exist");
    cy.get(`main a[href="${GUIAS[2].url}"]`).should("exist");
    cy.get(`main a[href="${GUIAS[1].url}"]`).should("exist");
    cy.get('main a[href^="/"]').each(($a) => {
      cy.request($a.attr("href")!).its("status").should("eq", 200);
    });
  });

  it("índices listam os guias", () => {
    cy.visit("/guia");
    cy.get("h1").should("contain.text", "Guias");
    for (const guia of GUIAS) cy.get(`main a[href="${guia.url}"]`).should("exist");

    cy.visit("/guia/comprar-carro-usado");
    cy.get(`main a[href="${GUIAS[0].url}"]`).should("exist");
    cy.get(`main a[href="${GUIAS[2].url}"]`).should("exist");
    cy.get(`main a[href="${GUIAS[3].url}"]`).should("not.exist");

    cy.visit("/guia/vender-carro");
    cy.get(`main a[href="${GUIAS[1].url}"]`).should("exist");

    cy.visit("/guia/comprar-imovel");
    cy.get(`main a[href="${GUIAS[3].url}"]`).should("exist");
    cy.get(`main a[href="${GUIAS[4].url}"]`).should("exist");
  });

  it("guia ou tema que não existe dá 404", () => {
    for (const url of ["/guia/comprar-carro-usado/nao-existe", "/guia/tema-inexistente", "/guia/vender-carro/como-evitar-golpe"]) {
      cy.request({ url, failOnStatusCode: false }).its("status").should("eq", 404);
    }
  });

  it("rodapé tem o link Guias e o sitemap traz todos os guias", () => {
    cy.visit("/");
    cy.get('footer a[href="/guia"]').should("contain.text", "Guias");
    cy.request("/sitemap.xml").then((res) => {
      for (const url of ["/guia", "/guia/comprar-carro-usado", "/guia/vender-carro", "/guia/comprar-imovel", ...GUIAS.map((g) => g.url)]) {
        expect(res.body).to.include(`${url}</loc>`);
      }
    });
  });
});

// Otimização de carregamento (27/11/2026): a janela do assistente só é
// baixada no clique, os simuladores de financiamento só na página que os
// mostra, e logos de lojas em destaque (abaixo da primeira tela) carregam ao
// rolar. O tamanho do JS por página é conferido no build
// (apps/web/lib/desempenho/orcamento-js.test.ts).

describe("Carregamento sob demanda", () => {
  it("home: a janela do assistente não vem no HTML nem no JS inicial", () => {
    cy.request("/").its("body").should("not.include", "Respostas geradas por IA podem conter erros");
    cy.visit("/");
    cy.contains("Respostas geradas por IA podem conter erros").should("not.exist");
  });

  it("home: logos das lojas em destaque carregam só ao rolar", () => {
    cy.visit("/");
    cy.get("body").then(($body) => {
      const logos = $body.find('section:has(h2:contains("Lojas parceiras em destaque")) img');
      logos.each((_, img) => {
        expect(img.getAttribute("loading")).to.eq("lazy");
        expect(img.getAttribute("width")).to.eq("80");
      });
    });
  });

  it("anúncio de imóvel: o simulador da Credihome (arquivo de JS à parte) continua vindo no HTML do servidor", () => {
    cy.request(`${Cypress.env("apiUrl")}/listings?assetType=property`).then((res) => {
      const body = res.body as { items?: { id: string }[] } | { id: string }[];
      const ids = (Array.isArray(body) ? body : body.items ?? []).map((item) => item.id);
      expect(ids.length, "imóvel no seed").to.be.greaterThan(0);
      let found = 0;
      ids.forEach((id) =>
        cy.request(`/anuncio/${id}`).then((page) => {
          if (String(page.body).includes("Simule seu financiamento")) found++;
        }),
      );
      cy.wrap(null).then(() => expect(found, "imóvel com o simulador no HTML").to.be.greaterThan(0));
    });
  });
});

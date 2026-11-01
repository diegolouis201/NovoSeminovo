// Fluxos principais de quem compra: página inicial, busca com estado e
// cidade, página do anúncio com o formulário de contato.

describe("Navegação de quem compra", () => {
  it("página inicial abre com o logo e a busca", () => {
    cy.visit("/");
    cy.get('header img[alt="NovoSeminovo"]').should("be.visible");
    cy.contains("Carros").should("be.visible");
    cy.contains("Imóveis").should("be.visible");
  });

  it("busca de carros: escolher o estado carrega as cidades dele", () => {
    cy.visit("/busca?assetType=vehicle");
    cy.get('aside select[name="city"]').should("be.disabled");
    cy.get('aside select[name="state"]').select("MG");
    cy.get('aside select[name="city"] option').should("have.length.greaterThan", 800);
    cy.get('aside select[name="city"]').select("Belo Horizonte");
    cy.get("aside").contains("button", "Filtrar").click();
    cy.location("search").should("include", "state=MG").and("include", "city=Belo+Horizonte");
    cy.contains("h1", "Belo Horizonte - MG");
  });

  it("busca de imóveis por outro estado não mostra anúncio de MG", () => {
    cy.visit("/busca?assetType=property&state=SP");
    cy.contains("Nenhum imóvel encontrado").should("be.visible");
  });

  it("anúncio abre com preço e o formulário de contato", () => {
    cy.visit("/busca?assetType=vehicle&q=Corolla");
    cy.contains("a", "Corolla XEi 2020").first().click();
    cy.location("pathname").should("match", /^\/anuncio\//);
    cy.get("#contato").within(() => {
      cy.contains("Enviar mensagem ao anunciante");
      cy.get('input[name="name"]').should("exist");
      cy.get('input[name="email"]').should("exist");
      cy.get('input[name="phone"]').should("exist");
    });
  });
});

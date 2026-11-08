// Vitrine do carro / do imóvel: botão no anúncio, página com os 3 formatos
// (Instagram, story e cartaz A4) e as imagens geradas.
describe("Vitrine do anúncio", () => {
  it("anúncio de carro leva à Vitrine do carro com os 3 formatos", () => {
    cy.request("http://localhost:4000/listings?assetType=vehicle").then((res) => {
      const lista = res.body as { id: string }[];
      const id = lista[0]!.id;
      cy.visit(`/anuncio/${id}`);
      cy.contains("a", "Vitrine do carro").should("have.attr", "href", `/anuncio/${id}/vitrine`).click();
      cy.contains("h1", "Vitrine do carro");
      cy.contains("a", "Mandar no WhatsApp").should("have.attr", "href").and("include", "wa.me");
      cy.contains("Cartaz para imprimir (A4)");
      cy.contains("a", "Imprimir").should("have.attr", "href", `/anuncio/${id}/vitrine/imprimir`);
      for (const f of ["card", "story", "cartaz"]) {
        cy.request(`/anuncio/${id}/vitrine/${f}`).its("headers").its("content-type").should("include", "image/png");
      }
      cy.request({ url: `/anuncio/${id}/vitrine/qualquer`, failOnStatusCode: false }).its("status").should("eq", 404);
    });
  });
});

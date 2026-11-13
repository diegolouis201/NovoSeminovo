// Formulário de financiamento da Creditas no anúncio de veículo: fica
// só para administrador até o termo BACEN ser confirmado (advogado + Creditas). Sem
// NEXT_PUBLIC_CREDITAS_FORM=1 no build, visitante comum continua vendo a calculadora
// de sempre e não pede CPF nem mostra o termo.
describe("Creditas desligada por padrão", () => {
  it("anúncio de carro não mostra o formulário da Creditas", () => {
    cy.request("http://localhost:4000/listings?assetType=vehicle").then((res) => {
      const lista = res.body as { id: string }[];
      cy.visit(`/anuncio/${lista[0]!.id}`);
      cy.contains("a", "Vitrine do carro");
      cy.get('[data-testid="creditas-simulator"]').should("not.exist");
      cy.get("body").invoke("text").should("not.contain", "Sistema de Informações de Crédito (SCR)");
    });
  });
});

// Crédito: os dados vão para a IBS Capital, que atende pela Loft/Credihome
// (imóveis) e pela Creditas (veículos). A Política de Privacidade diz isso e
// que o cliente pode retirar a autorização (contratos da IBS: Creditas 3.1(v)
// e 7.8; Loft 1.6).

describe("Consentimento do crédito", () => {
  it("Política de Privacidade: dados do crédito vão para a IBS, que compartilha com Creditas e Loft/Credihome", () => {
    cy.visit("/privacidade");
    cy.contains("li", "Crédito imobiliário e de veículos").within(() => {
      cy.root().should("contain.text", "IBS CAPITAL CORRETORA DE SEGUROS LTDA");
      cy.root().should("contain.text", "Loft/Credihome");
      cy.root().should("contain.text", "Creditas");
      cy.root().should("contain.text", "retirar a autorização");
    });
  });

  it("a IBS aparece como parceira de crédito, nunca como correspondente bancário", () => {
    for (const path of ["/", "/privacidade", "/termos", "/como-funciona", "/quem-somos", "/perguntas-frequentes"]) {
      cy.visit(path);
      cy.get("body").invoke("text").should("not.match", /correspondente/i);
      cy.get("footer").should("contain.text", "parceira de crédito Ibs Capital");
    }
  });
});

// Cadastro e login: regra de senha forte e acesso do admin.

describe("Conta", () => {
  it("cadastro recusa senha sem caractere especial", () => {
    cy.visit("/cadastro");
    cy.get("main form").first().within(() => {
      cy.get('input[name="name"]').type("Teste Cypress");
      cy.get('input[name="email"]').type(`cypress.${Date.now()}@teste.local`);
      cy.get('input[name="cpf"]').type("529.982.247-25");
      cy.get('input[name="password"]').type("senha1234");
      cy.contains("button", "Criar conta").click();
    });
    cy.contains("caractere especial").should("be.visible");
    cy.location("pathname").should("eq", "/cadastro");
  });

  it("login com senha errada não entra", () => {
    cy.login("admin@novoseminovo.com.br", "senha-errada!");
    cy.location("pathname").should("eq", "/entrar");
  });

  it("admin entra e vê a Moderação", () => {
    cy.login("admin@novoseminovo.com.br", "senha1234");
    cy.location("pathname").should("not.eq", "/entrar");
    cy.visit("/admin");
    cy.contains("h1", "Moderação").should("be.visible");
  });

  it("quem não entrou é mandado para o login ao abrir o admin", () => {
    cy.visit("/admin");
    cy.location("pathname").should("eq", "/entrar");
  });
});

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

describe("Campanhas no admin", () => {
  it("filtro de campanha mostra o resumo e permite limpar", () => {
    cy.login("admin@novoseminovo.com.br", "senha1234");
    cy.location("pathname").should("not.eq", "/entrar");
    cy.visit("/admin/leads?periodo=30&campanha=sugestao-ia&canal=whatsapp");
    cy.contains("h2", "Campanha: sugestao-ia").should("be.visible");
    cy.contains("vieram por esta campanha").should("be.visible");
    cy.contains("a", "Limpar filtro de campanha").click();
    cy.location("search").should("not.include", "campanha=");
  });
});

describe("Moderação: reenvio e avaliações", () => {
  it("corrigir anúncio e denunciar avaliação exigem login", () => {
    cy.visit("/conta/anuncios/qualquer/corrigir");
    cy.location("pathname").should("eq", "/entrar");
    cy.visit("/avaliacoes/qualquer/denunciar");
    cy.location("pathname").should("eq", "/entrar");
  });

  it("admin vê a fila de avaliações para revisar", () => {
    cy.login("admin@novoseminovo.com.br", "senha1234");
    cy.location("pathname").should("not.eq", "/entrar");
    cy.visit("/admin");
    cy.contains("h2", "Avaliações para revisar").should("be.visible");
  });
});

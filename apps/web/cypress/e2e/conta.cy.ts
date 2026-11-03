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

// POP MOD-05: bloquear sem excluir (golpe) e contas em revisão por reincidência.
describe("Segurança das contas no admin", () => {
  beforeEach(() => {
    cy.login("admin@novoseminovo.com.br", "senha1234");
    cy.location("pathname").should("not.eq", "/entrar");
  });

  it("Moderação mostra as contas em revisão por reincidência", () => {
    cy.visit("/admin");
    cy.contains("h2", "Contas em revisão (reincidência)").should("be.visible");
  });

  it("cadastro do anunciante tem bloquear conta com motivo, sem excluir", () => {
    cy.visit("/admin/anuncios?busca=particular%40novoseminovo.com.br");
    cy.get('a[href^="/admin/usuarios/"]').first().click();
    cy.contains("h2", "Bloquear conta (golpe confirmado)").should("be.visible");
    cy.get('form[aria-label="Bloquear conta"] textarea[name="reason"]').should("have.attr", "required");
  });
});

// Área Comercial: quadro de empresas por Veículos, Imóveis e Consolidado.
describe("Área Comercial", () => {
  it("quem não entrou vai para o login", () => {
    cy.visit("/comercial");
    cy.location("pathname").should("eq", "/entrar");
  });

  it("comprador não acessa", () => {
    cy.login("comprador@novoseminovo.com.br", "senha1234");
    cy.location("pathname").should("not.eq", "/entrar");
    cy.visit("/comercial");
    cy.contains("h1", "Acesso restrito").should("be.visible");
  });

  it("admin vê o quadro com as três abas, as metas e o botão de nova empresa", () => {
    cy.login("admin@novoseminovo.com.br", "senha1234");
    cy.location("pathname").should("not.eq", "/entrar");
    cy.visit("/comercial");
    cy.contains("h1", "Comercial").should("be.visible");
    cy.contains("a", "Veículos").should("be.visible");
    cy.contains("a", "Imóveis").should("be.visible");
    cy.contains("a", "Consolidado").should("be.visible");
    cy.contains("h2", "Metas do mês").should("be.visible");
    cy.contains("a", "Nova empresa").click();
    cy.get('form[aria-label="Nova empresa"] input[name="name"]').should("have.attr", "required");
  });

  it("admin convida alguém para o comercial", () => {
    cy.login("admin@novoseminovo.com.br", "senha1234");
    cy.location("pathname").should("not.eq", "/entrar");
    cy.visit("/admin/equipe");
    cy.contains("h1", "Equipe comercial").should("be.visible");
    cy.get('form[aria-label="Convidar para o comercial"] input[name="email"]').should("have.attr", "type", "email");
  });
});

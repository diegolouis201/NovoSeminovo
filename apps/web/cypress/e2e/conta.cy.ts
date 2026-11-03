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
    cy.loginAs("admin@novoseminovo.com.br", "senha1234");
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
    cy.loginAs("admin@novoseminovo.com.br", "senha1234");
    cy.visit("/admin");
    cy.contains("h2", "Avaliações para revisar").should("be.visible");
  });
});

// POP MOD-05: bloquear sem excluir (golpe) e contas em revisão por reincidência.
describe("Segurança das contas no admin", () => {
  beforeEach(() => {
    cy.loginAs("admin@novoseminovo.com.br", "senha1234");
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
    cy.loginAs("comprador@novoseminovo.com.br", "senha1234");
    cy.visit("/comercial");
    cy.contains("h1", "Acesso restrito").should("be.visible");
  });

  it("admin vê o quadro com as três abas, as metas e o botão de nova empresa", () => {
    cy.loginAs("admin@novoseminovo.com.br", "senha1234");
    cy.visit("/comercial");
    cy.contains("h1", "Comercial").should("be.visible");
    cy.contains("a", "Veículos").should("be.visible");
    cy.contains("a", "Imóveis").should("be.visible");
    cy.contains("a", "Consolidado").should("be.visible");
    cy.contains("h2", "Metas do mês").should("be.visible");
    cy.contains("h2", "Ordens do CRM").should("be.visible");
    cy.contains("a", "Nova empresa").click();
    cy.get('form[aria-label="Nova empresa"] input[name="name"]').should("have.attr", "required");
  });

  it("ficha da empresa: perfil, registro por canal, motivo de perda e chamados", () => {
    cy.loginAs("admin@novoseminovo.com.br", "senha1234");
    cy.visit("/comercial/novo");
    cy.get('form[aria-label="Nova empresa"] input[name="name"]').type(`Loja Cypress ${Date.now()}`);
    cy.get('form[aria-label="Nova empresa"] button[type="submit"]').click();
    cy.location("pathname").should("match", /^\/comercial\/[a-z0-9]+$/);
    cy.get('form[aria-label="Perfil da empresa"] select[name="employeesRange"]').should("exist");
    cy.get('form[aria-label="Nova anotação"] select[name="kind"]').should("contain", "Ligação").and("contain", "Objeção");
    cy.get('form[aria-label="Mudar etapa"] select[name="lostCategory"]').should("exist");
    cy.get('form[aria-label="Mudar etapa"] select[name="stage"]').should("contain", "Proposta enviada");
    cy.contains("h2", "Chamados de suporte").should("be.visible");
    cy.get('form[aria-label="Abrir chamado"] input[name="subject"]').type("Fotos não sobem");
    cy.get('form[aria-label="Abrir chamado"] button[type="submit"]').click();
    cy.contains("Chamado aberto.").should("be.visible");
    cy.contains("li", "Fotos não sobem").should("contain", "aberto");
    // Depois de abrir, o formulário volta vazio (sem repetir o assunto).
    cy.get('form[aria-label="Abrir chamado"] input[name="subject"]').should("have.value", "");
  });

  it("admin convida alguém para o comercial", () => {
    cy.loginAs("admin@novoseminovo.com.br", "senha1234");
    cy.visit("/admin/equipe");
    cy.contains("h1", "Equipe comercial").should("be.visible");
    cy.get('form[aria-label="Convidar para o comercial"] input[name="email"]').should("have.attr", "type", "email");
  });

  it("admin vê a visão geral do CRM com funil, receita, NPS e atenção", () => {
    cy.loginAs("admin@novoseminovo.com.br", "senha1234");
    cy.visit("/admin/crm");
    cy.contains("h1", "Visão geral do CRM").should("be.visible");
    cy.contains("Mensalidades (MRR)").should("be.visible");
    cy.contains("h2", "Funil de empresas").should("be.visible");
    cy.get('[aria-label="Funil de empresas"]').should("contain", "Proposta enviada").and("contain", "Assinante");
    cy.contains("h2", "Receita recebida por mês").should("be.visible");
    cy.contains("h2", "Satisfação (NPS)").should("be.visible");
    cy.contains("h2", "Motivos de perda e cancelamento").should("be.visible");
    cy.contains("h2", "Origem dos cadastros").should("be.visible");
    cy.contains("h2", "Desempenho por vendedor").should("be.visible");
    cy.contains("h2", "Precisa de atenção").should("be.visible");
    cy.get('nav[aria-label="Recorte da visão geral"]').contains("a", "Imóveis").click();
    cy.location("search").should("eq", "?tipo=property");
  });

  it("admin vê as receitas por categoria: planos, financiamentos (fora do faturamento) e afiliados", () => {
    cy.loginAs("admin@novoseminovo.com.br", "senha1234");
    cy.visit("/admin/crm");
    cy.get('nav[aria-label="Seções do CRM"]').contains("a", "Receitas").click();
    cy.location("pathname").should("eq", "/admin/crm/receitas");
    cy.contains("h1", "Receitas").should("be.visible");
    cy.contains("h2", "Faturamento consolidado").should("be.visible");
    cy.contains("h2", "Receita de planos").should("be.visible");
    cy.contains("h2", "Financiamentos").should("be.visible");
    cy.contains("Não entra no caixa nem no faturamento").should("be.visible");
    cy.contains("h2", "Lojas parceiras (links de afiliado)").should("be.visible");
    cy.contains("h2", "Programa de afiliados").should("be.visible");
  });

  it("quem não é admin não entra na visão geral do CRM", () => {
    cy.loginAs("comprador@novoseminovo.com.br", "senha1234");
    cy.visit("/admin/crm");
    cy.location("pathname").should("not.eq", "/admin/crm");
  });
});

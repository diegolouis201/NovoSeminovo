// NovoSeminovo Hub (apps/hub, porta 3100): CRM da empresa com login.
// Admin entra com tudo; quem não é da equipe não entra.
describe("NovoSeminovo Hub", { baseUrl: "http://localhost:3100" }, () => {
  // A API aceita no máximo 8 logins por minuto por endereço e o teste
  // anterior (conta.cy.ts) acabou de usar alguns: espera a janela zerar.
  before(() => cy.wait(61_000));

  const entrar = (email: string, senha: string) => {
    cy.visit("/entrar");
    cy.get("#email").type(email);
    cy.get("#password").type(senha, { log: false });
    cy.contains("button", "Entrar").click();
  };

  it("sem login, manda para a tela de entrar", () => {
    cy.visit("/empresas");
    cy.location("pathname").should("eq", "/entrar");
    cy.contains("h1", "NovoSeminovo");
  });

  it("comprador (fora da equipe) não entra", () => {
    entrar("comprador@novoseminovo.com.br", "senha1234");
    cy.contains("não tem acesso ao Hub").should("be.visible");
    cy.location("pathname").should("eq", "/entrar");
  });

  it("admin entra, vê o início, abre a ficha e registra uma atividade", () => {
    entrar("admin@novoseminovo.com.br", "senha1234");
    cy.location("pathname").should("eq", "/");
    cy.contains("h1", "Administrador");
    cy.contains("Sem próximo passo");
    cy.get("aside").contains("Equipe e acessos");
    cy.get("aside").contains("Receitas");
    cy.visit("/empresas");
    cy.get("table a").first().click();
    cy.contains("h2", "Registrar atividade");
    cy.get('textarea[name="texto"]').type("Teste do Hub: liguei e pedi retorno.");
    cy.contains("button", "Registrar").click();
    cy.contains("Atividade registrada.");
    cy.reload();
    cy.contains("Teste do Hub: liguei e pedi retorno.");
    cy.visit("/regua");
    cy.contains("h1", "Régua de relacionamento");
    cy.visit("/vendas");
    cy.contains("h1", "Dashboard de vendas");

    // Financeiro: conta, lançamento manual e as telas de indicadores.
    // Expandir: abre só se estiver fechado, e depois que a página carregou.
    const abrir = (titulo: string, campo: string) =>
      cy.get("[data-pronto]").then(() =>
        cy.get("body").then(($b) => {
          if (!$b.find(campo).length) cy.contains("button", titulo).click();
        }),
      );
    cy.visit("/financeiro/importar");
    abrir("Nova conta", 'input[name="nome"]');
    cy.get('input[name="nome"]').type("Banco Cypress");
    cy.get('input[name="saldoInicial"]').type("1000");
    cy.contains("button", "Criar conta").click();
    cy.contains("Conta criada.");
    cy.visit("/financeiro/lancamentos");
    abrir("Lançamento manual", "#descricao");
    cy.get("#descricao").type("Despesa do teste Cypress");
    cy.get("#valor").type("123,45");
    cy.contains("button", "Salvar lançamento").click();
    cy.contains("Lançamento criado.");
    cy.reload();
    cy.contains("Despesa do teste Cypress");
    for (const [rota, titulo] of [["/financeiro", "Painel de indicadores"], ["/financeiro/extrato", "Extrato"], ["/financeiro/fluxo", "Fluxo de caixa"], ["/financeiro/dre", "DRE"]]) {
      cy.visit(rota);
      cy.contains("h1", titulo);
    }
  });
});

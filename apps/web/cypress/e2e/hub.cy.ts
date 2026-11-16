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
    // Leads de compradores (site) com origem; o dono vê o contato.
    cy.visit("/marketing/compradores");
    cy.contains("h1", "Leads de compradores");
    cy.contains("Por canal");
    cy.contains("Por campanha");
    cy.get("aside").contains("Leads de compradores");

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
    // Marketing: telas abrem para o dono.
    for (const [rota, titulo] of [["/marketing", "Marketing"], ["/marketing/aprovacoes", "Aprovações"], ["/marketing/calendario", "Calendário"], ["/marketing/gastos", "Gastos"], ["/marketing/analises", "Análises"]]) {
      cy.visit(rota);
      cy.contains("h1", titulo);
    }
    // Jornada: marcos com as duas leituras e premissas que o dono edita.
    cy.visit("/jornada");
    cy.contains("h1", "Jornada");
    cy.get("aside").contains("Jornada");
    cy.contains("Receita mensal atual");
    cy.contains("tr", "R$ 10.000,00").contains("50");
    cy.get("#ticketMedio").clear().type("250");
    cy.contains("button", "Salvar premissas").click();
    cy.contains("Premissas salvas.");
    cy.reload();
    cy.contains("tr", "R$ 10.000,00").contains("40");
    cy.get("#ticketMedio").clear().type("200");
    cy.contains("button", "Salvar premissas").click();
    cy.contains("Premissas salvas.");
    // Seguidores digitados pelo dono (rede sem leitura automática).
    cy.contains("Digite o número aqui (atualize toda semana)");
    cy.get("#seg-linkedin").type("1.234");
    cy.get("#seg-linkedin").parents("form").contains("button", "Salvar").click();
    cy.contains("Salvo.");
    cy.reload();
    // Escopo na tabela das redes: a tabela de marcos também cita "LinkedIn".
    cy.contains("section", "Redes sociais").contains("tr", "LinkedIn").contains("1.234");
    cy.contains("section", "Redes sociais").contains("tr", "LinkedIn").contains(/digitado em \d{2}\/\d{2}/);
    cy.contains("a", "Clientes").click();
    cy.contains("h2", "Marcos de clientes");
    cy.contains("tr", "Primeira centena").contains("R$ 20.000,00");
    // SEO (Search Console): sem a chave no servidor, a tela explica como ligar.
    cy.visit("/marketing/seo");
    cy.contains("h1", "SEO");
    cy.get("aside").contains("a", "SEO");
    cy.contains("Search Console ainda não está ligado");
    cy.contains("GSC_SITE");
    cy.contains("a", "90 dias").click();
    cy.location("search").should("eq", "?dias=90");
    cy.contains("Search Console ainda não está ligado");
    for (const [rota, titulo] of [["/financeiro", "Painel de indicadores"], ["/financeiro/extrato", "Extrato"], ["/financeiro/fluxo", "Fluxo de caixa"], ["/financeiro/dre", "DRE"]]) {
      cy.visit(rota);
      cy.contains("h1", titulo);
    }
  });
});

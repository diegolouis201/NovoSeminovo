// Tela inicial do painel do parceiro (/parceiro), etapa 1: plano e fatura,
// leads dos últimos 15 dias, funil de 30 dias, novos leads, top 5, análise de
// anúncios e qualidade da loja — tudo da loja de quem entrou. Seed:
// loja@novoseminovo.com.br é dona da Imobiliária Savassi (imóveis).
describe("Painel do parceiro: tela inicial", () => {
  beforeEach(() => cy.loginAs("loja@novoseminovo.com.br", "senha1234"));

  it("mostra os blocos na ordem, com os links certos", () => {
    cy.visit("/parceiro");
    const titulos = ["Plano e fatura", "Leads", "Funil de leads", "Novos leads", "Top 5 anúncios", "Análise de anúncios", "Qualidade da loja"];
    cy.get("main h2").then(($h) => {
      const textos = [...$h].map((h) => h.textContent?.trim() ?? "");
      let ultimo = -1;
      for (const titulo of titulos) {
        const i = textos.findIndex((t, n) => n > ultimo && t === titulo);
        expect(i, `bloco "${titulo}" depois do anterior`).to.be.greaterThan(ultimo);
        ultimo = i;
      }
    });
    cy.contains("a", "Ver plano e faturas").should("have.attr", "href", "/parceiro/plano");
    cy.contains("a", "Ir para os leads").should("have.attr", "href", "/parceiro/leads");
    cy.contains("a", "Ver anúncios para melhorar").should("have.attr", "href").and("match", /^\/parceiro\/anuncios/);
    cy.contains("Últimos 15 dias");
    cy.contains("Últimos 30 dias");
    // Visualizações ficam fora do período (o banco só tem o total).
    cy.contains("visualizações (total dos anúncios ativos)");
    // Sinais de interesse: só números (imobiliária vê também o Arquiteto).
    cy.contains("Abriram seus anúncios pelo assistente virtual");
    cy.contains("Usaram o Arquiteto nos seus imóveis");
  });

  it("gráfico de leads tem resumo em texto e tabela para leitor de tela", () => {
    cy.visit("/parceiro");
    cy.get("figure[aria-labelledby]").within(() => {
      cy.get("figcaption").invoke("text").should("match", /leads? nos últimos 15 dias/);
      cy.get("table").find("tbody tr").should("have.length", 15);
    });
  });

  it("imobiliária vê a análise de imóveis, sem preço por m² nem FIPE", () => {
    cy.visit("/parceiro");
    cy.contains("h2", "Análise de anúncios")
      .closest("section")
      .within(() => {
        cy.contains("Sem vídeo");
        cy.contains("Descrição curta");
        cy.contains("Pouca procura");
        cy.contains(/Menos de 8 fotos/);
      });
    cy.get("main").invoke("text").should("not.match", /m²|FIPE/);
  });

  it("qualidade da loja de 0 a 100 com os itens explicados", () => {
    cy.visit("/parceiro");
    cy.get("progress[aria-label='Qualidade da loja']")
      .should("have.attr", "max", "100")
      .invoke("attr", "value")
      .then((v) => {
        expect(Number(v)).to.be.within(0, 100);
      });
    cy.contains("Perfil verificado");
    cy.contains(/dos anúncios com 8 fotos ou mais/);
  });

  it("continua com dados da empresa e redes sociais", () => {
    cy.visit("/parceiro");
    cy.get("form[aria-label='Redes sociais da empresa']").should("exist");
    cy.contains("Autorizo o NovoSeminovo a divulgar minha empresa nas redes sociais");
    cy.get("input[type=file][name=logo]").should("exist");
    cy.contains("a", "Ver vitrine pública");
  });

  it("no celular fica em uma coluna, sem rolagem lateral", () => {
    cy.viewport(375, 812);
    cy.visit("/parceiro");
    cy.contains("h2", "Qualidade da loja");
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
  });

  it("a API não entrega o painel sem login", () => {
    cy.request({ url: `${Cypress.env("apiUrl")}/partners/mine/dashboard`, failOnStatusCode: false }).its("status").should("eq", 401);
  });
});

// Link do assistente virtual (?de=assistente): a página do anúncio avisa a API
// uma vez por visita, sem mandar nada de quem é (só o id do anúncio na rota).
describe("Anúncio aberto pelo assistente virtual", () => {
  it("conta a visita uma vez e não conta link comum", () => {
    cy.request(`${Cypress.env("apiUrl")}/listings?assetType=property`).then((res) => {
      const id = (res.body.items ?? res.body)[0].id as string;
      cy.intercept("POST", `**/listings/${id}/visita-assistente`).as("visita");
      cy.visit(`/anuncio/${id}?de=assistente`);
      cy.wait("@visita").then(({ request, response }) => {
        expect(request.body ?? "").to.be.empty;
        expect(request.headers).not.to.have.property("authorization");
        expect(response?.body).to.deep.equal({ counted: true });
      });
      cy.reload();
      cy.wait(1500);
      cy.get("@visita.all").should("have.length", 1);
      cy.visit(`/anuncio/${id}`);
      cy.wait(1500);
      cy.get("@visita.all").should("have.length", 1);
    });
  });

  it("a API recusa id inválido", () => {
    cy.request({ method: "POST", url: `${Cypress.env("apiUrl")}/listings/${encodeURIComponent("1' OR '1'='1")}/visita-assistente`, failOnStatusCode: false })
      .its("status")
      .should("eq", 400);
  });
});

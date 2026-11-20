// Crédito: os dados vão para a IBS Capital, que atende pela Loft/Credihome
// (imóveis) e pela Creditas (veículos). A Política de Privacidade tem a seção
// "Simulação e Financiamento" do parecer jurídico LGPD de 17/11/2026 (itens
// 2.1.1 e 2.1.4 iii): papéis (controlador/operador), dados, finalidades,
// bases legais, revogação, direitos do titular e o encarregado (DPO).

describe("Consentimento do crédito", () => {
  it("Política de Privacidade: seção Simulação e Financiamento com papéis, bases legais, direitos e o encarregado", () => {
    cy.visit("/privacidade");
    cy.contains("Última atualização: 20/11/2026").should("be.visible");
    cy.get("section#simulacao-e-financiamento").within(() => {
      cy.contains("h2", "Simulação e Financiamento").should("be.visible");
      cy.root().invoke("text").then((raw) => {
        const text = raw.replace(/\s+/g, " ");
        // Papéis.
        expect(text).to.include("DLRLVM SOLUCOES LTDA");
        expect(text).to.include("60.327.011/0001-02");
        expect(text).to.match(/operador/i);
        expect(text).to.include("IBS Capital Corretora de Seguros Ltda.");
        expect(text).to.include("61.452.517/0001-06");
        expect(text).to.include("Creditas");
        expect(text).to.include("Loft/Credihome");
        expect(text).to.match(/controladoras? independentes?/i);
        // Dados, finalidades e bases legais.
        expect(text).to.match(/dados cadastrais/i);
        expect(text).to.match(/análise da possibilidade de concessão de crédito/i);
        expect(text).to.include("art. 7º, I");
        expect(text).to.include("art. 7º, V");
        expect(text).to.include("art. 7º, X");
        // Revogação e direitos (art. 18).
        expect(text).to.match(/revogar/i);
        expect(text).to.include("art. 18");
        for (const right of ["confirmação", "acesso", "correção", "anonimização", "bloqueio", "eliminação", "portabilidade", "compartilhamento"]) {
          expect(text.toLowerCase()).to.include(right);
        }
        // Encarregado (DPO).
        expect(text).to.include("Diego Louis Pereira");
      });
      cy.contains("a", "diego.louis@novoseminovo.com.br").should("have.attr", "href", "mailto:diego.louis@novoseminovo.com.br");
    });
  });

  it("o resto da política não contradiz a seção nova", () => {
    cy.visit("/privacidade");
    cy.get("main").invoke("text").then((raw) => {
      const text = raw.replace(/\s+/g, " ");
      // O texto antigo dizia "fintechs e parceiros dela" e "retirar a autorização".
      expect(text).not.to.include("fintechs e parceiros dela");
    });
    cy.contains("li", "Crédito imobiliário e de veículos").find('a[href="#simulacao-e-financiamento"]').should("exist");
  });

  it("a IBS aparece como parceira de crédito, nunca como correspondente bancário", () => {
    for (const path of ["/", "/privacidade", "/termos", "/como-funciona", "/quem-somos", "/perguntas-frequentes"]) {
      cy.visit(path);
      cy.get("body").invoke("text").should("not.match", /correspondente/i);
      cy.get("footer").should("contain.text", "parceira de crédito Ibs Capital");
    }
  });
});

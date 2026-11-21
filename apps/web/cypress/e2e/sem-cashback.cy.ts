// O NovoSeminovo deixou de oferecer cashback no financiamento (06/11/2026,
// decisão do Diego). As páginas antigas redirecionam, nenhuma tela fala em
// cashback e o aviso legal do financiamento continua no rodapé.

const PUBLIC_PAGES = [
  "/",
  "/carros",
  "/imoveis",
  "/anunciar",
  "/como-funciona",
  "/quem-somos",
  "/para-lojas",
  "/para-lojas/comecar",
  "/perguntas-frequentes",
  "/termos",
  "/privacidade",
];

describe("Sem cashback no financiamento", () => {
  it("páginas antigas de cashback redirecionam de vez (301)", () => {
    const redirects: [string, string][] = [
      ["/recompensas", "/como-funciona"],
      ["/conta/recompensas", "/conta"],
      ["/admin/recompensas", "/admin/comissoes"],
    ];
    for (const [from, to] of redirects) {
      cy.request({ url: from, followRedirect: false }).then((res) => {
        expect(res.status, from).to.eq(301);
        expect(res.redirectedToUrl ?? res.headers.location, from).to.match(new RegExp(`${to}$`));
      });
    }
  });

  it("páginas públicas não falam em cashback e mantêm o aviso legal do financiamento", () => {
    for (const path of PUBLIC_PAGES) {
      cy.visit(path);
      cy.get("body").invoke("text").should("not.match", /cashback/i);
      cy.get("footer").should("contain.text", "não é instituição financeira e não concede crédito");
    }
  });

  it("título e prévias de compartilhamento sem cashback", () => {
    for (const path of PUBLIC_PAGES) {
      cy.visit(path);
      cy.get('head title, head meta[name="description"], head meta[property^="og:"], head meta[name^="twitter:"]').each(($el) => {
        expect($el.attr("content") ?? $el.text(), path).not.to.match(/cashback/i);
      });
    }
  });

  it("mapa do site não lista a página antiga", () => {
    cy.request("/sitemap.xml").its("body").should("not.include", "/recompensas");
  });

  it("admin acompanha a comissão dos financiamentos sem cashback", () => {
    cy.loginAs("admin@novoseminovo.com.br", "senha1234");
    cy.visit("/admin/comissoes");
    cy.contains("h1", "Comissões de financiamento").should("be.visible");
    cy.get("body").invoke("text").should("not.match", /cashback/i);
    cy.visit("/admin/financiamentos");
    cy.get("body").invoke("text").should("not.match", /cashback/i);
    cy.visit("/conta");
    cy.get("body").invoke("text").should("not.match", /cashback/i);
  });
});

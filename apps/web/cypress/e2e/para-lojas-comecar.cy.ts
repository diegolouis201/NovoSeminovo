// Página da campanha para lojas, imobiliárias e corretores (anúncio pago leva
// para cá). O formulário vira card "A abordar" no funil do Comercial, com a
// origem do anúncio (utm_*) e autorização de contato obrigatória (LGPD).
describe("Campanha para lojas: /para-lojas/comecar", () => {
  it("/para-lojas leva para a página da campanha", () => {
    cy.visit("/para-lojas");
    cy.get('a[href="/para-lojas/comecar"]').first().click();
    cy.location("pathname").should("eq", "/para-lojas/comecar");
  });

  it("mostra a oferta sem prometer resultado e sem itens descontinuados", () => {
    cy.visit("/para-lojas/comecar");
    cy.contains("h1", /loja|imobili/i);
    cy.get("main").should("contain.text", "3 meses grátis");
    cy.get("main").should("contain.text", "Vitrine");
    cy.get("main").should("contain.text", "QR");
    cy.get("main").should("contain.text", "link");
    cy.get("body").invoke("text").should("not.match", /cashback|passaporte|diário do carro/i);
    cy.get("body").invoke("text").should("not.match", /em BH|Belo Horizonte e região/i);
  });

  it("autorização de contato começa desmarcada, é obrigatória e o link da privacidade abre com segurança", () => {
    cy.visit("/para-lojas/comecar");
    cy.get('input[name="consent"]').should("not.be.checked").and("have.attr", "required");
    cy.get('a[href="/privacidade"]').each(($a) => {
      if ($a.attr("target") === "_blank") expect($a.attr("rel")).to.contain("noopener").and.contain("noreferrer");
    });
    cy.get('input[name="website"]').should("not.be.visible");
  });

  it("envia o formulário (com origem da campanha) e mostra a confirmação com o botão de criar conta", () => {
    const sufixo = Date.now().toString().slice(-6);
    cy.visit("/para-lojas/comecar?utm_source=meta&utm_medium=paid&utm_campaign=Teste%20Cypress&utm_content=Anuncio%201&utm_term=Publico%20A");
    cy.getCookie("ns_origem").should("exist").its("value").should("contain", "teste_cypress");
    cy.get('input[name="name"]').type("Maria Teste");
    cy.get('input[name="company"]').type(`Loja Cypress ${sufixo}`);
    cy.get('select[name="businessType"]').select("loja");
    cy.get('input[name="city"]').type("Goiânia");
    cy.get('select[name="state"]').select("GO");
    cy.get('input[name="phone"]').type(`6299${sufixo}0`);
    cy.get('input[name="email"]').type(`cypress-${sufixo}@teste.local`);
    cy.get('input[name="consent"]').check();
    cy.contains("button", /enviar|quero/i).click();
    cy.contains("Recebemos!").should("be.visible");
    cy.contains("Vamos te chamar no WhatsApp");
    cy.contains("a", /criar (minha )?conta/i).should("have.attr", "href").and("match", /^\/(parceiro|cadastro)/);
  });

  it("está no mapa do site", () => {
    cy.request("/sitemap.xml").its("body").should("contain", "/para-lojas/comecar");
  });
});

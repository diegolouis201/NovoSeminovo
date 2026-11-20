// Termos de Uso (20/11/2026): papel de cada um nos dados dos clientes que
// chegam pelos anúncios dos parceiros (pedido do Diego para responder lojas e
// imobiliárias sobre LGPD). A loja é controladora dos leads que recebe; o
// NovoSeminovo é controlador da plataforma e não repassa o contato a outra
// loja nem vende dados.

describe("Termos: dados dos clientes dos parceiros (LGPD)", () => {
  it("define o papel do parceiro e do NovoSeminovo", () => {
    cy.visit("/termos");
    cy.contains("h2", "Dados dos clientes dos parceiros (LGPD)").should("be.visible");
    cy.contains("controlador dos dados dos interessados que recebe").should("exist");
    cy.contains("controlador dos dados da plataforma").should("exist");
    cy.contains("não repassa o contato do interessado a outro anunciante").should("exist");
    cy.contains("servidor no Brasil").should("exist");
    cy.contains("encarregado").should("exist");
    cy.contains("Última atualização: 20/11/2026").should("exist");
  });

  it("a Política de Privacidade avisa o comprador que o anunciante passa a ser responsável", () => {
    cy.visit("/privacidade");
    cy.contains("passa a ser responsável pelo atendimento e por esses dados").should("exist");
  });
});

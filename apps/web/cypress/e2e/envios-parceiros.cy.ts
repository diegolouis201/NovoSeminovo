// Envios aos parceiros de crédito da IBS (Creditas e Credihome): o admin vê
// quantos pedidos foram e o volume potencial do mês, e baixa a planilha para
// conferir com a IBS (com o id do lead no parceiro e sem fórmula no Excel).

describe("Envios aos parceiros de crédito", () => {
  it("admin vê o volume potencial do mês e baixa a planilha para a IBS", () => {
    cy.loginAs("admin@novoseminovo.com.br", "senha1234");
    cy.visit("/admin/financiamentos");
    cy.contains("h2", "Envios aos parceiros (IBS)").should("be.visible");
    cy.contains("Creditas").should("be.visible");
    cy.contains("Credihome").should("be.visible");
    cy.contains("Volume potencial").should("be.visible");
    cy.request("/api/admin/envios-parceiros?mes=2026-11").then((res) => {
      expect(res.status).to.eq(200);
      expect(res.headers["content-type"]).to.include("text/csv");
      expect(res.body).to.include("Id do lead no parceiro");
      expect(res.body).to.include("TOTAL");
    });
  });

  it("visitante não baixa a planilha", () => {
    cy.request({ url: "/api/admin/envios-parceiros?mes=2026-11", failOnStatusCode: false }).its("status").should("eq", 403);
  });
});

// Página "Quer conhecer a ficha técnica?" (só a partir do Passaporte): placa ou modelo
// (Tabela FIPE). A FIPE é externa; aqui só o que não depende dela.
describe("Ficha técnica", () => {
  it("abre com a busca pela placa e pelo modelo (só pelo Passaporte, sem link no rodapé)", () => {
    cy.visit("/ficha-tecnica");
    cy.contains("h1", "Quer conhecer a ficha técnica?");
    cy.get('input[name="placa"]').should("exist");
    cy.contains("h2", "Pelo modelo");
    cy.get("footer").contains("Ficha técnica do carro").should("not.exist");
  });

  it("placa que não está no site manda escolher pelo modelo", () => {
    cy.visit("/ficha-tecnica?placa=ZZZ9Z99");
    cy.contains("Ainda não temos essa placa no NovoSeminovo");
  });

  it("consulta do Passaporte leva para a ficha técnica com a placa", () => {
    cy.visit("/consultar-veiculo?placa=ZZZ9Z99");
    cy.contains("a", "Quer conhecer a ficha técnica?").should("have.attr", "href", "/ficha-tecnica?placa=ZZZ9Z99");
  });
});

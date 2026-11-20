// Vendedores IA no Hub: painel com um card por vendedor e ranking, fila de
// "Respostas para aprovar" (mensagem da empresa como texto, rascunho editável,
// aprovar/editar/rejeitar) e pausa do vendedor. Dados do seed (falsos); sem
// SMTP no teste, nada sai de verdade.
describe("Hub: vendedores IA", { baseUrl: "http://localhost:3100" }, () => {
  // A API aceita no máximo 8 logins por minuto por endereço.
  before(() => cy.wait(61_000));

  const entrar = () => {
    cy.visit("/entrar");
    cy.get("#email").type("admin@novoseminovo.com.br");
    cy.get("#password").type("senha1234", { log: false });
    cy.contains("button", "Entrar").click();
    cy.location("pathname").should("eq", "/");
  };

  it("painel: Nina ativa, os outros inativos, ranking e controle geral", () => {
    entrar();
    cy.contains("a", "Vendedores IA").click();
    cy.contains("h1", "Vendedores IA");
    cy.contains("a", "Nina").should("contain", "Ativo").and("contain", "assistente comercial da NovoSeminovo");
    for (const nome of ["Lara", "Dani", "Caio", "João"]) cy.contains("a", nome).should("contain", "Inativo");
    cy.get('[role=region][aria-labelledby="ranking-legenda"] table').contains("th", "Nina");
    cy.contains("Pausar todos os vendedores agora");
    cy.contains("A IA nunca marca ganho");
  });

  it("fila: mensagem da empresa como texto, rejeitar com motivo, editar e enviar o caso que precisa do dono", () => {
    entrar();
    cy.visit("/vendedores/respostas");
    cy.contains("h1", "Respostas para aprovar");
    cy.contains("article", "Auto Center Exemplo").within(() => {
      // HTML escrito pela empresa aparece como texto, não vira negrito.
      cy.contains("<b>Como funciona</b>");
      cy.get("b").should("not.exist");
      cy.contains("Objeção:").parent().should("contain", "Sem tempo");
      cy.get("textarea").should("contain.value", "Nina, assistente comercial da NovoSeminovo");
      cy.contains("button", "Editar e enviar").should("be.disabled");
      cy.contains("button", "Rejeitar").click();
      cy.get("input[name=motivo]").type("Mais curto e sem lista.");
      cy.contains("button", "Rejeitar sem enviar").click();
      cy.get("[role=status]").should("contain", "Rejeitada");
    });
    cy.contains("article", "Garagem Modelo Seminovos").within(() => {
      cy.contains("Precisa de você: Pediu desconto ou condição especial");
      cy.contains("button", "Aprovar e enviar").should("not.exist");
      cy.get("textarea").should("have.attr", "required");
      cy.get("textarea").type("Obrigada pelo retorno! Condições especiais são com a nossa equipe: vou passar o seu contato para eles.");
      cy.contains("button", "Editar e enviar").click();
      cy.get("[role=status]").invoke("text").should("match", /Aprovada|Resposta enviada/);
    });
  });

  it("pausar a Nina pelo detalhe e voltar; automático bloqueado nos primeiros 14 dias", () => {
    entrar();
    cy.visit("/vendedores");
    cy.contains("a", "Nina").click();
    cy.contains("h1", "Nina");
    cy.get("#m-auto").should("be.disabled");
    cy.contains("Liberado depois de 14 dias no ar");
    cy.get("#pausado").check();
    cy.contains("button", "Salvar ajustes").click();
    cy.contains("Ajustes salvos.");
    cy.reload();
    cy.contains("span.pill", "Pausado");
    cy.get("#pausado").uncheck();
    cy.contains("button", "Salvar ajustes").click();
    cy.contains("Ajustes salvos.");
    cy.reload();
    cy.contains("span.pill", "Ativo");
  });
});

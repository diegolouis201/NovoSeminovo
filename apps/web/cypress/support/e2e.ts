// Comandos e preparação comuns a todos os testes de ponta a ponta.

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      login(email: string, password: string): Chainable<void>;
    }
  }
}

// Recusa o aviso de cookies antes da página carregar, para ele não cobrir botões.
beforeEach(() => {
  cy.on("window:before:load", (win) => {
    try {
      win.localStorage.setItem("ns-cookie-consent", "denied");
    } catch {
      // armazenamento bloqueado: segue sem
    }
  });
});

Cypress.Commands.add("login", (email: string, password: string) => {
  cy.visit("/entrar");
  cy.get("main form").first().within(() => {
    cy.get('input[name="email"]').type(email);
    cy.get('input[name="password"]').type(password, { log: false });
    cy.get('button[type="submit"]').click();
  });
});

export {};

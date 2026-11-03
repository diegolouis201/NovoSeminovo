// Comandos e preparação comuns a todos os testes de ponta a ponta.

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      login(email: string, password: string): Chainable<void>;
      loginAs(email: string, password: string): Chainable<void>;
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

// Entra uma vez por conta e reaproveita a sessão nos testes seguintes. O
// servidor aceita no máximo 8 logins por minuto por endereço (proteção
// contra robôs), então os testes não devem logar de novo a cada caso.
Cypress.Commands.add("loginAs", (email: string, password: string) => {
  cy.session(
    [email],
    () => {
      cy.login(email, password);
      cy.location("pathname").should("not.eq", "/entrar");
    },
    { cacheAcrossSpecs: true },
  );
});

export {};

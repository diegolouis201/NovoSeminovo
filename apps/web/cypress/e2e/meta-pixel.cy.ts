// Meta Pixel (Etapa 2a de marketing). No GitHub o site é construído com um ID
// de pixel de teste (NEXT_PUBLIC_META_PIXEL_ID em .github/workflows/e2e.yml);
// o fbevents.js da Meta é trocado por um arquivo vazio, então os comandos
// ficam na fila window.fbq.queue e dá para conferir o que seria enviado.
// A API não tem token no teste: a API de Conversões fica desligada.

type Fbq = { queue: unknown[][] };
const PIXEL_ID = "123456789012345";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function acceptCookies() {
  cy.on("window:before:load", (win) => {
    try {
      win.localStorage.setItem("ns-cookie-consent", "granted");
    } catch {
      // sem armazenamento
    }
  });
}

function stubFbevents() {
  cy.intercept("GET", "https://www.googletagmanager.com/**", { statusCode: 200, body: "", headers: { "content-type": "application/javascript" } });
  cy.intercept("GET", "https://connect.facebook.net/**", { statusCode: 200, body: "", headers: { "content-type": "application/javascript" } }).as("fbevents");
}

function fbqQueue() {
  return cy.window().its("fbq").its("queue") as unknown as Cypress.Chainable<unknown[][]>;
}

describe("Meta Pixel", () => {
  it("sem aceite dos cookies: nada da Meta é carregado", () => {
    let loaded = 0;
    cy.intercept("GET", "https://connect.facebook.net/**", (req) => {
      loaded++;
      req.reply({ statusCode: 200, body: "" });
    });
    cy.visit("/");
    cy.document().its("cookie").should("contain", "ns_consent=denied");
    cy.window().should("not.have.property", "fbq");
    cy.wait(500).then(() => expect(loaded).to.eq(0));
  });

  it("o aviso de cookies cita a Meta e o pixel só carrega depois do Aceitar", () => {
    stubFbevents();
    cy.on("window:before:load", (win) => {
      try {
        win.localStorage.removeItem("ns-cookie-consent");
      } catch {
        // sem armazenamento
      }
    });
    cy.visit("/");
    cy.get('[role="dialog"][aria-label="Aviso de cookies"]').should("contain.text", "Meta");
    cy.window().should("not.have.property", "fbq");
    cy.get('[role="dialog"][aria-label="Aviso de cookies"]').contains("button", "Aceitar").click();
    cy.document().its("cookie").should("contain", "ns_consent=granted");
    fbqQueue().should((queue) => {
      expect(queue).to.deep.include(["init", PIXEL_ID]);
      expect(queue).to.deep.include(["track", "PageView"]);
    });
  });

  it("troca de página no site conta outro PageView", () => {
    stubFbevents();
    acceptCookies();
    cy.visit("/para-lojas");
    fbqQueue().should((queue) => expect(queue.filter((call) => call[1] === "PageView")).to.have.length(1));
    cy.get('a[href="/para-lojas/comecar"]').first().click();
    cy.location("pathname").should("eq", "/para-lojas/comecar");
    fbqQueue().should((queue) => expect(queue.filter((call) => call[1] === "PageView")).to.have.length(2));
  });

  it("formulário da campanha para lojas dispara Lead com id de evento (para juntar com o servidor)", () => {
    stubFbevents();
    acceptCookies();
    const sufixo = Date.now().toString().slice(-6);
    cy.visit("/para-lojas/comecar?utm_source=meta&utm_medium=paid&utm_campaign=Pixel%20Cypress&fbclid=IwAR_teste-123");
    cy.document().its("cookie").should("contain", "ns_consent=granted");
    cy.get("#cl-name").type("Paula Pixel");
    cy.get("#cl-company").type(`Loja Pixel ${sufixo}`);
    cy.get("#cl-type").select("imobiliaria");
    cy.get("#cl-city").type("Curitiba");
    cy.get("#cl-state").select("PR");
    cy.get("#cl-phone").type(`4199${sufixo}1`);
    cy.get("#cl-email").type(`pixel-${sufixo}@teste.local`);
    cy.get('main input[name="consent"]').check();
    cy.get("main form").contains("button", /enviar|quero/i).click();
    cy.contains("Recebemos!").should("be.visible");
    fbqQueue().should((queue) => {
      const lead = queue.find((call) => call[0] === "track" && call[1] === "Lead");
      expect(lead, "Lead no pixel").to.exist;
      expect(lead![2]).to.deep.equal({ content_category: "lojas" });
      expect((lead![3] as { eventID: string }).eventID).to.match(UUID);
    });
    // A fila do servidor para o navegador é apagada depois de disparar.
    cy.document().its("cookie").should("not.contain", "ns_meta_evt=");
  });

  it("Política de Privacidade explica o pixel e a API de Conversões da Meta", () => {
    cy.visit("/privacidade");
    cy.get("main").should("contain.text", "Meta");
    cy.get("main").should("contain.text", "API de Conversões");
    cy.get("main").invoke("text").should("match", /criptografad|hash/i);
  });
});

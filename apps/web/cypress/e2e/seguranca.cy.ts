// Ataques comuns contra o site: script injection (XSS), SQL injection e
// chamadas de outros sites (CORS). Nenhum pode executar código, vazar dado
// nem derrubar a página.

const apiUrl = () => Cypress.env("apiUrl") as string;

const XSS = [
  "<script>window.__xss=1</script>",
  '"><img src=x onerror="window.__xss=1">',
  "javascript:window.__xss=1",
  "<svg onload=window.__xss=1>",
];

const SQLI = ["' OR '1'='1", "'; DROP TABLE listings; --", "1 UNION SELECT email, password_hash FROM users --"];

function semScriptExecutado() {
  cy.window().its("__xss").should("be.undefined");
}

describe("Script injection (XSS)", () => {
  beforeEach(() => {
    cy.on("window:alert", () => {
      throw new Error("alert disparado: script injetado executou");
    });
  });

  XSS.forEach((payload) => {
    it(`busca mostra o texto e não executa: ${payload}`, () => {
      cy.visit(`/busca?assetType=vehicle&q=${encodeURIComponent(payload)}`);
      semScriptExecutado();
      cy.get("body").should("not.contain.html", "<script>window.__xss");
    });
  });

  it("formulário de contato aceita o texto como texto, sem executar", () => {
    cy.visit("/busca?assetType=vehicle&q=Corolla");
    cy.contains("a", "Corolla XEi 2020").first().click();
    cy.get("#contato").within(() => {
      cy.get('input[name="name"]').type(XSS[1], { parseSpecialCharSequences: false });
      cy.get('input[name="email"]').type(`xss.${Date.now()}@teste.local`);
      cy.get('input[name="phone"]').type("31999990000");
      cy.get("textarea[name='message']").clear().type(XSS[0], { parseSpecialCharSequences: false });
      cy.contains("button", "Enviar mensagem").click();
    });
    semScriptExecutado();
  });
});

describe("SQL injection", () => {
  SQLI.forEach((payload) => {
    it(`busca não quebra nem vaza dado: ${payload}`, () => {
      cy.request(`${apiUrl()}/listings?q=${encodeURIComponent(payload)}`).then((res) => {
        expect(res.status).to.eq(200);
        expect(JSON.stringify(res.body)).not.to.match(/password|passwordHash|password_hash/i);
      });
      cy.visit(`/busca?assetType=vehicle&q=${encodeURIComponent(payload)}`);
      cy.contains("Carros").should("be.visible");
    });
  });

  it("login com SQL no e-mail ou na senha não entra", () => {
    cy.request({
      method: "POST",
      url: `${apiUrl()}/auth/login`,
      body: { email: "admin@novoseminovo.com.br' --", password: "' OR '1'='1" },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.be.within(400, 401);
      expect(res.body).not.to.have.property("accessToken");
    });
  });

  it("filtros de estado e cidade com SQL não quebram a busca", () => {
    cy.request(`${apiUrl()}/listings?state=${encodeURIComponent("MG' OR '1'='1")}&city=${encodeURIComponent("x'); DROP TABLE users; --")}`).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body).to.have.length(0);
    });
  });
});

describe("CORS: só o próprio site chama a API pelo navegador", () => {
  it("origem do site recebe permissão", () => {
    const origin = Cypress.config("baseUrl") as string;
    cy.request({ method: "OPTIONS", url: `${apiUrl()}/listings`, headers: { Origin: origin, "Access-Control-Request-Method": "GET" } }).then((res) => {
      expect(res.headers["access-control-allow-origin"]).to.eq(origin);
    });
  });

  ["https://golpe.com", "https://novoseminovo.com.br.golpe.com", "null"].forEach((origin) => {
    it(`outro site não recebe permissão: ${origin}`, () => {
      cy.request({ method: "OPTIONS", url: `${apiUrl()}/listings`, headers: { Origin: origin, "Access-Control-Request-Method": "GET" }, failOnStatusCode: false }).then((res) => {
        expect(res.headers).not.to.have.property("access-control-allow-origin");
      });
    });
  });
});

describe("Cabeçalhos de segurança do site", () => {
  it("toda página sai com proteção contra MIME sniffing, iframe de outro site e vazamento de referência", () => {
    cy.request("/").then((res) => {
      expect(res.headers["x-content-type-options"]).to.eq("nosniff");
      expect(res.headers["x-frame-options"]).to.eq("DENY");
      expect(res.headers["referrer-policy"]).to.eq("strict-origin-when-cross-origin");
      expect(String(res.headers["content-security-policy"])).to.include("frame-ancestors 'none'");
    });
  });

  it("proxy de fotos importadas exige login", () => {
    cy.request({ url: "/api/importar-foto?url=https://exemplo.com/x.jpg", failOnStatusCode: false }).its("status").should("eq", 401);
  });
});

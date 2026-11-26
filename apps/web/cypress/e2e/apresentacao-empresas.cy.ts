// PDF de apresentação para empresas (link dos e-mails do Caio e da Nina).
// O arquivo fica no servidor, fora da imagem (DEPLOY.md, "Apresentação para
// empresas"). Localmente: ARQUIVOS_PUBLICOS_DIR=<pasta com apresentacao-empresas.pdf>.
// Sem o arquivo, o PDF responde 404 limpo; com ele, abre no navegador.
describe("Apresentação para empresas: /apresentacao-empresas.pdf", () => {
  it("abre no navegador (inline) com o nome do arquivo, cache curto e sem indexar — ou 404 limpo sem o arquivo", () => {
    cy.request({ url: "/apresentacao-empresas.pdf", failOnStatusCode: false, encoding: "binary" }).then((res) => {
      expect(res.headers["x-robots-tag"]).to.eq("noindex, nofollow");
      expect(res.headers["x-content-type-options"]).to.eq("nosniff");
      if (res.status === 404) {
        expect(res.headers["content-type"]).to.contain("text/plain");
        expect(res.headers["cache-control"]).to.eq("no-store");
        return;
      }
      expect(res.status).to.eq(200);
      expect(res.headers["content-type"]).to.eq("application/pdf");
      expect(res.headers["content-disposition"]).to.eq('inline; filename="NovoSeminovo-para-empresas.pdf"');
      expect(res.headers["cache-control"]).to.eq("public, max-age=300");
      expect(res.headers["etag"]).to.match(/^"[0-9a-f]+-[0-9a-f]+"$/);
      expect(res.headers["last-modified"]).to.match(/GMT$/);
      expect(res.headers["content-security-policy"]).to.eq(undefined);
      expect(String(res.body).slice(0, 5)).to.eq("%PDF-");
      cy.request({ url: "/apresentacao-empresas.pdf", headers: { "If-None-Match": res.headers["etag"] as string }, failOnStatusCode: false }).its("status").should("eq", 304);
    });
  });

  it("caminhos parecidos não servem outro arquivo", () => {
    for (const url of ["/apresentacao-empresas.pdf/..%2f..%2fetc%2fpasswd", "/arquivos-publicos/apresentacao-empresas.pdf", "/apresentacao-empresas.PDF"]) {
      cy.request({ url, failOnStatusCode: false }).its("status").should("eq", 404);
    }
  });
});

describe("Link de campanha: /apresentacao-empresas?utm_...", () => {
  it("registra a origem no cookie e redireciona (303) para o PDF, sem indexar", () => {
    cy.clearCookies();
    cy.request({ url: "/apresentacao-empresas?utm_source=prospeccao&utm_medium=email&utm_campaign=caio_veiculos&utm_content=apresentacao", followRedirect: false }).then((res) => {
      expect(res.status).to.eq(303);
      expect(res.redirectedToUrl).to.match(/\/apresentacao-empresas\.pdf$/);
      expect(res.headers["x-robots-tag"]).to.eq("noindex, nofollow");
      expect(res.headers["cache-control"]).to.eq("no-store");
    });
    cy.getCookie("ns_origem").its("value").should("eq", "prospeccao%7Cemail%7Ccaio_veiculos%7Capresentacao%7C%7C");
  });

  it("destino fixo e utm sujo descartado (nada da URL volta na resposta)", () => {
    cy.clearCookies();
    cy.request({
      url: "/apresentacao-empresas?utm_source=prospeccao&utm_campaign=%3Cscript%3Ealert(1)%3C%2Fscript%3E&utm_content=x%22%3E&next=https%3A%2F%2Fevil.example&url=%2F%2Fevil.example",
      followRedirect: false,
    }).then((res) => {
      expect(res.status).to.eq(303);
      expect(res.redirectedToUrl).to.match(/^http:\/\/localhost:\d+\/apresentacao-empresas\.pdf$/);
      expect(JSON.stringify(res.headers)).not.to.contain("script").and.not.to.contain("evil");
    });
    cy.getCookie("ns_origem").its("value").should("eq", "prospeccao%7C%7C");
  });

  it("sem utm não apaga a origem que a pessoa já tinha", () => {
    cy.setCookie("ns_origem", "instagram%7Csocial%7Cverao");
    cy.request({ url: "/apresentacao-empresas", followRedirect: false }).its("status").should("eq", 303);
    cy.getCookie("ns_origem").its("value").should("eq", "instagram%7Csocial%7Cverao");
  });

  it("fica fora do mapa do site", () => {
    cy.request("/sitemap.xml").its("body").should("not.contain", "apresentacao-empresas");
  });
});

// Onde a contagem aparece: Hub > Prospecção, seção "Apresentação para empresas (PDF)".
describe("Hub: aberturas da apresentação em /prospeccao", { baseUrl: "http://localhost:3100" }, () => {
  // A API aceita no máximo 8 logins por minuto por endereço.
  before(() => cy.wait(61_000));

  it("mostra a abertura do link de campanha por campanha e conteúdo", () => {
    const campanha = `cy_${Date.now().toString(36)}`;
    cy.request({ url: `http://localhost:3000/apresentacao-empresas?utm_source=prospeccao&utm_medium=email&utm_campaign=${campanha}&utm_content=apresentacao`, followRedirect: false });
    cy.visit("/entrar");
    cy.get("#email").type("admin@novoseminovo.com.br");
    cy.get("#password").type("senha1234", { log: false });
    cy.contains("button", "Entrar").click();
    cy.location("pathname").should("eq", "/");
    cy.visit("/prospeccao");
    cy.contains("h2", "Apresentação para empresas (PDF)");
    cy.get('[role="region"][aria-labelledby="aberturas-apresentacao"]').contains("tr", campanha).should("contain.text", "apresentacao").and("contain.text", "prospeccao / email");
    cy.contains("a", "Abrir o PDF").should("have.attr", "rel", "noopener noreferrer");
  });
});

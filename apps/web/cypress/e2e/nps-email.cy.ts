// Pesquisa NPS por e-mail: no Hub o envio automático começa desligado e o
// dono manda um e-mail de teste para si (prévia com os 11 botões). Os links
// do e-mail de teste abrem a página pública do site, que grava a nota no
// clique e mostra a pergunta certa para cada faixa. A nota de teste não
// conta no NPS. Sem RESEND_API_KEY no CI: nenhum e-mail sai de verdade.
const links: Record<number, string> = {};

describe("Hub: NPS por e-mail (aprovação e e-mail de teste)", { baseUrl: "http://localhost:3100" }, () => {
  // A API aceita no máximo 8 logins por minuto por endereço.
  before(() => cy.wait(61_000));

  it("envio desligado até o dono aprovar; e-mail de teste com o modelo real", () => {
    cy.visit("/entrar");
    cy.get("#email").type("admin@novoseminovo.com.br");
    cy.get("#password").type("senha1234", { log: false });
    cy.contains("button", "Entrar").click();
    cy.location("pathname").should("eq", "/");
    cy.visit("/nps/envio");
    cy.contains("h1", "Pesquisa NPS por e-mail");
    cy.contains("Desligado");
    cy.contains("button", "Aprovar e ligar envio automático").should("be.visible");
    cy.contains("button", "Enviar e-mail de teste para mim").click();
    cy.get("[role=status]").should("contain", "admin@novoseminovo.com.br");
    cy.get("iframe[title='Prévia do e-mail']")
      .should("have.attr", "sandbox", "")
      .invoke("attr", "srcdoc")
      .then((html) => {
        const doc = String(html);
        expect(doc).to.contain("1 minuto para nos ajudar?");
        expect(doc).to.contain("De 0 a 10, quanto você recomendaria o NovoSeminovo a outra loja, imobiliária ou corretor?");
        const hrefs = [...doc.matchAll(/href="(http:\/\/localhost:3000\/nps\/r\/[^"]+)"/g)].map((m) => m[1]!.replace(/&amp;/g, "&"));
        expect(hrefs).to.have.length(11);
        hrefs.forEach((h, n) => (links[n] = h));
        expect(doc).to.match(/href="http:\/\/localhost:3000\/nps\/sair\/[^"]+"/);
        expect(doc).to.contain("60.327.011/0001-02");
      });
  });

  it("painel do NPS: conta, filtros e comentários de uso interno", () => {
    cy.visit("/entrar");
    cy.get("#email").type("admin@novoseminovo.com.br");
    cy.get("#password").type("senha1234", { log: false });
    cy.contains("button", "Entrar").click();
    cy.location("pathname").should("eq", "/");
    cy.visit("/nps?periodo=365&tipo=todos");
    cy.contains("h1", "NPS");
    cy.contains("promotores − detratores");
    cy.get("select[name=periodo]").should("have.value", "365");
    cy.contains("th", "Imobiliárias");
    cy.contains("Uso interno — depoimento público só com autorização por escrito da empresa");
    cy.contains("a", "Envio por e-mail").should("have.attr", "href", "/nps/envio");
  });
});

describe("Site: página da nota (sem login)", () => {
  it("0 a 6: pergunta o que atrapalhou e se quer contato; agradece", () => {
    cy.visit(links[3]!);
    cy.contains("E-mail de teste");
    cy.contains("Recebemos a sua nota: 3");
    cy.contains("label", "Poxa, sentimos muito. O que mais atrapalhou?");
    cy.contains("legend", "Quer que alguém da nossa equipe fale com você?");
    cy.get("textarea[name=comment]").should("have.attr", "maxlength", "1000").type("<script>alert(1)</script> Demora para aprovar o anúncio");
    cy.contains("label", "Sim").click();
    cy.contains("button", "Enviar resposta").click();
    cy.get("[role=status]").should("contain", "Obrigado! A sua resposta vai direto para a nossa equipe.");
  });

  it("7 e 8: o que faltou para ser um 10", () => {
    cy.visit(links[8]!);
    cy.contains("label", "O que faltou para ser um 10?");
    cy.contains("Quer que alguém da nossa equipe fale com você?").should("not.exist");
  });

  it("9 e 10: o que mais gosta", () => {
    cy.visit(links[10]!);
    cy.contains("label", "Que bom! O que você mais gosta no NovoSeminovo?");
    cy.contains("button", "Enviar resposta").click();
    cy.get("[role=status]").should("contain", "Obrigado! A sua resposta vai direto para a nossa equipe.");
  });

  it("link adulterado ou vencido: página amigável", () => {
    const [id, , exp, sig] = links[5]!.split("/nps/r/")[1]!.split(".");
    cy.visit(`/nps/r/${id}.9.${exp}.${sig}`);
    cy.contains("h1", "Link inválido");
    cy.visit("/nps/r/abc");
    cy.contains("h1", "Link inválido");
  });

  it("descadastro: página com botão (leitor de e-mail não descadastra sozinho)", () => {
    cy.visit("/nps/sair/abc");
    cy.contains("h1", "Não receber mais a pesquisa");
    cy.contains("Link inválido");
  });
});

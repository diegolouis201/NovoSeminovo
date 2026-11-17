// Consentimento do crédito conforme o parecer jurídico LGPD de 17/11/2026
// (item 3.1): o texto do advogado, palavra por palavra, aparece inteiro como
// o próprio rótulo da caixa (destacado, nada recolhido), a caixa começa
// desmarcada, o envio fica bloqueado até marcar, o link "Política de
// Privacidade" abre /privacidade, e o pedido leva a versão do texto, que fica
// registrada com data/hora e fuso, modalidade, IP e navegador (item 2.1.4 ii).
// O termo SCR/BACEN da Creditas não é do parecer: continua recolhido.
// O imóvel usa a Credihome de teste (cypress/fake-credihome.mjs, ligada no CI).
import { CONSENTIMENTO_CREDITO, TERMO_BACEN_CREDITAS } from "@novoseminovo/shared-types";

const apiUrl = () => Cypress.env("apiUrl") as string;

const IMOVEL =
  "Autorizo o NovoSeminovo a encaminhar meus dados cadastrais e de simulação à IBS Capital Corretora de Seguros Ltda. (CNPJ 61.452.517/0001-06), empresa parceira responsável pelo atendimento de crédito e pela intermediação da solicitação de crédito, e autorizo a IBS a compartilhá-los com a Loft/Credihome e instituições financeiras parceiras para realização da simulação solicitada, análise da possibilidade de concessão de crédito e contato relacionado ao atendimento da solicitação. Declaro ciência de que posso revogar este consentimento a qualquer momento. Política de Privacidade";
const VEICULO =
  "Autorizo o NovoSeminovo a encaminhar meus dados cadastrais e do veículo à IBS Capital Corretora de Seguros Ltda. (CNPJ 61.452.517/0001-06), parceira responsável pelo atendimento de crédito, e autorizo a IBS a compartilhá-los com a Creditas e financeiras parceiras para fins de simulação, análise de crédito e propostas. Declaro ciência de que posso revogar este consentimento a qualquer momento. Política de Privacidade";
const RESUMO_SCR =
  "Autorizo a consulta dos meus dados no Banco Central (SCR) e nos birôs de crédito (SPC, Serasa e BVS), e o compartilhamento com parceiros da IBS Capital.";

function firstListing(assetType: "vehicle" | "property") {
  return cy.request(`${apiUrl()}/listings?assetType=${assetType}`).then((res) => {
    const body = res.body as { id: string }[] | { items: { id: string }[] };
    return (Array.isArray(body) ? body : body.items)[0]!.id;
  });
}

const normalized = (text: string) => text.replace(/\s+/g, " ").trim();

// Texto integral do parecer como rótulo da caixa, visível, sem "Ler texto completo".
function checkLegalConsent(texto: string, versao: string) {
  cy.get('[data-testid="consentimento-dados"]').within(() => {
    cy.get('input[type="checkbox"][name="consent"]').should("not.be.checked").and("have.attr", "required");
    cy.get('input[type="hidden"][name="consentVersion"]').should("have.value", versao);
    cy.get("label").should("be.visible").invoke("text").then((text) => expect(normalized(text)).to.eq(texto));
    // A caixa é rotulada pelo texto (clique no texto marca a caixa).
    cy.get('input[name="consent"]').invoke("attr", "id").then((id) => cy.get("label").should("have.attr", "for", id));
    cy.get("details").should("not.exist");
    cy.contains("Ler texto completo").should("not.exist");
    cy.get("label")
      .contains("a", "Política de Privacidade")
      .should("be.visible")
      .and("have.attr", "href", "/privacidade")
      .and("have.attr", "target", "_blank")
      .and("have.attr", "rel")
      .and("match", /noopener/)
      .and("match", /noreferrer/);
  });
}

function interceptProposal(id: string) {
  cy.intercept({ method: "POST", url: `/anuncio/${id}` }, (req) => {
    if (String(req.body).includes('"consent"')) req.alias = "envio";
  });
}

function uniquePhone() {
  return `(31) 9${String(Date.now()).slice(-8, -4)}-${String(Date.now()).slice(-4)}`;
}

function adminToken() {
  return cy
    .request("POST", `${apiUrl()}/auth/login`, { email: "admin@novoseminovo.com.br", password: "senha1234" })
    .then((login) => login.body.accessToken as string);
}

describe("Consentimento do crédito do parecer jurídico (celular)", () => {
  beforeEach(() => {
    cy.viewport(390, 844);
  });

  it("os textos da tela são os do shared-types", () => {
    expect(CONSENTIMENTO_CREDITO.imovel.texto).to.eq(IMOVEL);
    expect(CONSENTIMENTO_CREDITO.veiculo.texto).to.eq(VEICULO);
  });

  it("veículo (Creditas, só admin): texto do parecer inteiro, SCR recolhido, envio bloqueado e versão registrada", () => {
    cy.loginAs("admin@novoseminovo.com.br", "senha1234");
    firstListing("vehicle").then((id) => {
      interceptProposal(id);
      cy.visit(`/anuncio/${id}`);
      cy.get('[data-testid="creditas-simulator"]').within(() => {
        checkLegalConsent(VEICULO, CONSENTIMENTO_CREDITO.veiculo.versao);
        // Termo SCR/BACEN (exigência da Creditas, fora do parecer): resumo + texto recolhido.
        cy.get('[data-testid="consentimento-scr"]').within(() => {
          cy.get('input[type="checkbox"]').should("not.be.checked");
          cy.get("label").invoke("text").then((text) => expect(normalized(text)).to.eq(RESUMO_SCR));
          cy.get("details").should("not.have.attr", "open");
          cy.get("details summary").should("contain.text", "Ler texto completo");
          cy.get("details [data-texto-completo]").invoke("text").then((text) => expect(normalized(text)).to.eq(TERMO_BACEN_CREDITAS.texto));
          cy.get("details [data-texto-completo]").should(($p) => expect($p[0]!.checkVisibility()).to.eq(false));
        });
      });

      const phone = uniquePhone();
      cy.get('[data-testid="creditas-simulator"] form').within(() => {
        cy.get('input[name="name"]').type("Cliente Teste Parecer");
        cy.get('input[name="cpf"]').type("529.982.247-25");
        cy.get('input[name="birthDate"]').type("1990-01-01");
        cy.get('input[name="phone"]').type(phone);
        cy.get('input[name="email"]').type("parecer@teste.local");
        cy.get('select[name="timeToPurchase"]').select(1);
        cy.get('button[type="submit"]').click();
        cy.contains("Autorize o envio dos dados para receber a proposta").should("be.visible");
        cy.get('input[name="consent"]').should("have.attr", "aria-invalid", "true");
        cy.get('input[name="consent"]').check();
        cy.get('button[type="submit"]').click();
        cy.contains("Autorize a consulta ao SCR (Banco Central) para a análise de crédito").should("be.visible");
      });
      cy.contains("Pedido enviado!").should("not.exist");

      cy.get('[data-testid="creditas-simulator"] input[name="bacenConsent"]').check();
      cy.get('[data-testid="creditas-simulator"] button[type="submit"]').click();
      cy.wait("@envio").then(({ request }) => {
        const body = String(request.body);
        expect(body).to.contain('"consent":true');
        expect(body).to.contain(`"consentVersion":"${CONSENTIMENTO_CREDITO.veiculo.versao}"`);
      });
      cy.contains("Pedido enviado!").should("be.visible");

      adminToken().then((token) => {
        cy.request({ url: `${apiUrl()}/admin/financing-leads?assetType=vehicle`, headers: { Authorization: `Bearer ${token}` } }).then((res) => {
          const lead = (res.body as { phone: string; notes?: string }[]).find((item) => item.phone.replace(/\D/g, "") === phone.replace(/\D/g, ""));
          expect(lead?.notes).to.contain(
            `Autorização de crédito versão ${CONSENTIMENTO_CREDITO.veiculo.versao} e termo BACEN versão ${TERMO_BACEN_CREDITAS.versao} aceitos em`,
          );
        });
      });
    });
  });

  it("imóvel (Credihome): texto do parecer inteiro, envio bloqueado, versão registrada e planilha da IBS com o aceite", () => {
    firstListing("property").then((id) => {
      interceptProposal(id);
      cy.visit(`/anuncio/${id}`);
      cy.get('input[name="dateOfBirth"]').type("1990-01-01");
      cy.get('select[name="purchaseWindow"]').select(1);
      cy.contains("button", "Ver parcelas").click();
      cy.contains("button", "Quero esse financiamento").click();
      cy.get('input[name="useFgts"]').closest("form").as("proposta");

      cy.get("@proposta").within(() => {
        checkLegalConsent(IMOVEL, CONSENTIMENTO_CREDITO.imovel.versao);
        cy.get('[data-testid="consentimento-scr"]').should("not.exist");
      });

      const phone = uniquePhone();
      // Nome começando com "=": na planilha não pode virar fórmula.
      const name = `=HYPERLINK("http://golpe";"Parecer ${phone.slice(-4)}")`;
      cy.get("@proposta").within(() => {
        cy.get('input[name="name"]').type(name, { parseSpecialCharSequences: false });
        cy.get('input[name="cpf"]').type("529.982.247-25");
        cy.get('input[name="phone"]').type(phone);
        cy.get('input[name="email"]').type("parecer-imovel@teste.local");
        cy.get('button[type="submit"]').click();
        cy.contains("Autorize o envio dos dados para receber a proposta").should("be.visible");
        cy.get('input[name="consent"]').should("have.attr", "aria-invalid", "true");
      });
      cy.contains("Pedido enviado!").should("not.exist");

      // Clicar no texto marca a caixa (rótulo de verdade).
      cy.get("@proposta").find('[data-testid="consentimento-dados"] label').click("topLeft");
      cy.get("@proposta").find('input[name="consent"]').should("be.checked");
      cy.get("@proposta").find('button[type="submit"]').click();
      cy.wait("@envio").then(({ request }) => {
        const body = String(request.body);
        expect(body).to.contain('"consent":true');
        expect(body).to.contain(`"consentVersion":"${CONSENTIMENTO_CREDITO.imovel.versao}"`);
      });
      cy.contains("Pedido enviado!").should("be.visible");

      adminToken().then((token) => {
        cy.request({ url: `${apiUrl()}/admin/financing-leads?assetType=property`, headers: { Authorization: `Bearer ${token}` } }).then((res) => {
          const lead = (res.body as { phone: string; notes?: string }[]).find((item) => item.phone.replace(/\D/g, "") === phone.replace(/\D/g, ""));
          expect(lead?.notes).to.contain(`Autorização de crédito versão ${CONSENTIMENTO_CREDITO.imovel.versao} aceita em`);
        });
        // Planilha "Envios aos parceiros (IBS)": versão, aceite com fuso e IP, e nada de fórmula.
        const now = new Date();
        const month = new Date(now.getTime() - 3 * 3600_000).toISOString().slice(0, 7);
        cy.loginAs("admin@novoseminovo.com.br", "senha1234");
        cy.request(`/api/admin/envios-parceiros?mes=${month}`).then((csv) => {
          const text = String(csv.body);
          expect(text).to.include("Versão do consentimento");
          expect(text).to.include("Aceite (data e hora com fuso)");
          expect(text).to.include("IP do aceite");
          const line = text.split("\r\n").find((row) => row.includes(`Parecer ${phone.slice(-4)}`));
          expect(line, "linha do pedido").to.be.a("string");
          expect(line).to.include(CONSENTIMENTO_CREDITO.imovel.versao);
          expect(line).to.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}-03:00 \(America\/Sao_Paulo\)/);
          // A célula do nome começa com apóstrofo: o Excel não roda a fórmula.
          expect(line).to.include(`"'=HYPERLINK(`);
          expect(line).not.to.match(/(^|;)"?=HYPERLINK/);
        });
      });
    });
  });
});

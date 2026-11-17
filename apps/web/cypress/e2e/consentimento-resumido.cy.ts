// Autorizações de crédito em camadas (pedido do Diego, 17/11/2026): cada
// caixa mostra um resumo curto com o essencial (quem recebe, com quem
// compartilha, para quê, que dá para revogar) e o texto completo fica na
// página, recolhido em "Ler texto completo" (<details>). Só muda a
// apresentação: os textos e as versões continuam os de shared-types.
// O imóvel usa a Credihome de teste (cypress/fake-credihome.mjs, ligada no CI).
import { CONSENTIMENTO_CREDITO, TERMO_BACEN_CREDITAS } from "@novoseminovo/shared-types";

const apiUrl = () => Cypress.env("apiUrl") as string;

const RESUMO_VEICULO =
  "Autorizo o envio dos meus dados à IBS Capital (parceira de crédito) e o compartilhamento com a Creditas e outras instituições financeiras para simulação, análise de crédito e contato. Posso revogar quando quiser.";
const RESUMO_IMOVEL =
  "Autorizo o envio dos meus dados à IBS Capital (parceira de crédito) e o compartilhamento com a Loft/Credihome e outras instituições financeiras para simulação, análise de crédito e contato. Posso revogar quando quiser.";
const RESUMO_SCR =
  "Autorizo a consulta dos meus dados no Banco Central (SCR) e nos birôs de crédito (SPC, Serasa e BVS), e o compartilhamento com parceiros da IBS Capital.";

function firstListing(assetType: "vehicle" | "property") {
  return cy.request(`${apiUrl()}/listings?assetType=${assetType}`).then((res) => {
    const body = res.body as { id: string }[] | { items: { id: string }[] };
    return (Array.isArray(body) ? body : body.items)[0]!.id;
  });
}

// Texto que a pessoa lê na caixa (sem quebras de linha do HTML).
const normalized = (text: string) => text.replace(/\s+/g, " ").trim();

function checkConsentBlock(testId: string, resumo: string, completo: string) {
  cy.get(`[data-testid="${testId}"]`).within(() => {
    cy.get('input[type="checkbox"]').should("not.be.checked");
    cy.get("label").invoke("text").then((text) => expect(normalized(text)).to.eq(resumo));
    cy.get("label").should("be.visible");
    // Texto completo na página, recolhido: está no DOM mas não aparece.
    cy.get("details").should("not.have.attr", "open");
    cy.get("details summary").should("be.visible").and("contain.text", "Ler texto completo");
    cy.get("details [data-texto-completo]").invoke("text").then((text) => expect(normalized(text)).to.eq(completo));
    cy.get("details [data-texto-completo]").should("not.be.visible");
    // Abre sem script de página: é o <details> nativo.
    cy.get("details summary").click();
    cy.get("details").should("have.attr", "open");
    cy.get("details [data-texto-completo]").should("be.visible");
    cy.get("details summary").click();
    cy.get("details").should("not.have.attr", "open");
  });
}

function checkPrivacyLink(scope: string) {
  cy.get(scope)
    .contains("a", "Política de privacidade")
    .should("be.visible")
    .and("have.attr", "href", "/privacidade")
    .and("have.attr", "target", "_blank")
    .and("have.attr", "rel")
    .and("match", /noopener/)
    .and("match", /noreferrer/);
}

// Só o envio do pedido (a página faz outras chamadas ao servidor).
function interceptProposal(id: string) {
  cy.intercept({ method: "POST", url: `/anuncio/${id}` }, (req) => {
    if (String(req.body).includes('"consent"')) req.alias = "envio";
  });
}

function uniquePhone() {
  return `(31) 9${String(Date.now()).slice(-8, -4)}-${String(Date.now()).slice(-4)}`;
}

describe("Autorizações de crédito resumidas (celular)", () => {
  beforeEach(() => {
    cy.viewport(390, 844);
  });

  it("veículo (Creditas, só admin): resumo curto, texto completo recolhido, envio bloqueado sem marcar e versão registrada", () => {
    cy.loginAs("admin@novoseminovo.com.br", "senha1234");
    firstListing("vehicle").then((id) => {
      interceptProposal(id);
      cy.visit(`/anuncio/${id}`);
      cy.get('[data-testid="creditas-simulator"]').should("exist");
      checkConsentBlock("consentimento-dados", RESUMO_VEICULO, CONSENTIMENTO_CREDITO.veiculo);
      checkConsentBlock("consentimento-scr", RESUMO_SCR, TERMO_BACEN_CREDITAS.texto);
      checkPrivacyLink('[data-testid="creditas-simulator"]');
      // O quadro rolável antigo e o "Li e aceito... acima" saíram.
      cy.get('[data-testid="creditas-termo-bacen"]').should("not.exist");
      cy.contains("Li e aceito a autorização de consulta acima").should("not.exist");

      const phone = uniquePhone();
      cy.get('[data-testid="creditas-simulator"] form').within(() => {
        cy.get('input[name="name"]').type("Cliente Teste Consentimento");
        cy.get('input[name="cpf"]').type("529.982.247-25");
        cy.get('input[name="birthDate"]').type("1990-01-01");
        cy.get('input[name="phone"]').type(phone);
        cy.get('input[name="email"]').type("consentimento@teste.local");
        cy.get('select[name="timeToPurchase"]').select(1);
        cy.get('button[type="submit"]').click();
        // Bloqueado: as duas caixas avisam, nada foi enviado.
        cy.contains("Autorize o envio dos dados para receber a proposta").should("be.visible");
        cy.contains("Autorize a consulta ao SCR (Banco Central) para a análise de crédito").should("be.visible");
        cy.get('input[name="consent"]').should("have.attr", "aria-invalid", "true");

        // Só uma marcada: continua bloqueado.
        cy.get('input[name="consent"]').check();
        cy.contains("Autorize o envio dos dados para receber a proposta").should("not.exist");
        cy.get('button[type="submit"]').click();
        cy.contains("Autorize a consulta ao SCR (Banco Central) para a análise de crédito").should("be.visible");
      });
      cy.contains("Pedido enviado!").should("not.exist");

      cy.get('[data-testid="creditas-simulator"] input[name="bacenConsent"]').check();
      cy.get('[data-testid="creditas-simulator"] button[type="submit"]').click();
      cy.wait("@envio").then(({ request }) => {
        const body = String(request.body);
        expect(body).to.contain('"consent":true');
        expect(body).to.contain('"bacenConsent":true');
      });
      cy.contains("Pedido enviado!").should("be.visible");

      // O registro do pedido continua com as versões dos textos aceitos.
      cy.request("POST", `${apiUrl()}/auth/login`, { email: "admin@novoseminovo.com.br", password: "senha1234" }).then((login) => {
        cy.request({
          url: `${apiUrl()}/admin/financing-leads?assetType=vehicle`,
          headers: { Authorization: `Bearer ${login.body.accessToken as string}` },
        }).then((res) => {
          const lead = (res.body as { phone: string; notes?: string }[]).find((item) => item.phone.replace(/\D/g, "") === phone.replace(/\D/g, ""));
          expect(lead?.notes).to.contain(
            `Autorização de crédito versão ${CONSENTIMENTO_CREDITO.versao} e termo BACEN versão ${TERMO_BACEN_CREDITAS.versao} aceitos em`,
          );
        });
      });
    });
  });

  it("imóvel (Credihome): mesmo resumo com Loft/Credihome, envio bloqueado sem marcar e versão registrada", () => {
    firstListing("property").then((id) => {
      interceptProposal(id);
      cy.visit(`/anuncio/${id}`);
      cy.get('input[name="dateOfBirth"]').type("1990-01-01");
      cy.get('select[name="purchaseWindow"]').select(1);
      cy.contains("button", "Ver parcelas").click();
      cy.contains("button", "Quero esse financiamento").click();
      cy.get('input[name="useFgts"]').closest("form").as("proposta");

      cy.get("@proposta").within(() => {
        checkConsentBlock("consentimento-dados", RESUMO_IMOVEL, CONSENTIMENTO_CREDITO.imovel);
        cy.get('[data-testid="consentimento-scr"]').should("not.exist");
      });
      checkPrivacyLink("@proposta");

      const phone = uniquePhone();
      cy.get("@proposta").within(() => {
        cy.get('input[name="name"]').type("Cliente Teste Imóvel");
        cy.get('input[name="cpf"]').type("529.982.247-25");
        cy.get('input[name="phone"]').type(phone);
        cy.get('input[name="email"]').type("consentimento-imovel@teste.local");
        cy.get('button[type="submit"]').click();
        cy.contains("Autorize o envio dos dados para receber a proposta").should("be.visible");
        cy.get('input[name="consent"]').should("have.attr", "aria-invalid", "true");
      });
      cy.contains("Pedido enviado!").should("not.exist");

      cy.get("@proposta").find('input[name="consent"]').check();
      cy.get("@proposta").find('button[type="submit"]').click();
      cy.wait("@envio").then(({ request }) => {
        expect(String(request.body)).to.contain('"consent":true');
      });
      cy.contains("Pedido enviado!").should("be.visible");

      cy.request("POST", `${apiUrl()}/auth/login`, { email: "admin@novoseminovo.com.br", password: "senha1234" }).then((login) => {
        cy.request({
          url: `${apiUrl()}/admin/financing-leads?assetType=property`,
          headers: { Authorization: `Bearer ${login.body.accessToken as string}` },
        }).then((res) => {
          const lead = (res.body as { phone: string; notes?: string }[]).find((item) => item.phone.replace(/\D/g, "") === phone.replace(/\D/g, ""));
          expect(lead?.notes).to.match(new RegExp(`Autorização de crédito versão ${CONSENTIMENTO_CREDITO.versao} aceita em`));
        });
      });
    });
  });
});

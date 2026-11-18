// Prospecção pelo CRM do Hub: empresas do Mailerfind (Google Maps) entram
// como cards "A abordar" em dois passos (analisar → confirmar), sem duplicar.
describe("Hub: importar empresas do Mailerfind", { baseUrl: "http://localhost:3100" }, () => {
  // A API aceita no máximo 8 logins por minuto por endereço.
  before(() => cy.wait(61_000));

  const entrar = () => {
    cy.visit("/entrar");
    cy.get("#email").type("admin@novoseminovo.com.br");
    cy.get("#password").type("senha1234", { log: false });
    cy.contains("button", "Entrar").click();
    cy.location("pathname").should("eq", "/");
  };

  it("analisa (prévia sem gravar), confirma, e o mesmo arquivo de novo não duplica", () => {
    const tag = Date.now().toString(36);
    const fim = String(Date.now()).slice(-7);
    const etiqueta = `Cypress ${tag}`;
    cy.readFile("cypress/fixtures/mailerfind-google-maps.csv").then((modelo: string) => {
      const cabecalho = modelo.split("\n")[0]!;
      const colunas = cabecalho.split(",");
      const linha = (valores: Record<string, string>) => colunas.map((c) => valores[c] ?? "").join(",");
      const csv = [
        cabecalho,
        linha({ full_name: `Loja Cypress Um ${tag}`, full_phone_number: `+55 31 9${fim.slice(0, 4)}-${fim.slice(3, 7)}`, city: "Belo Horizonte", state: "Minas Gerais", rating: "4.5", reviews_count: "10", place_id: `ChIJcypress${tag}1` }),
        linha({ full_name: `Loja Cypress Um ${tag}`, full_phone_number: `+55 31 9${fim.slice(0, 4)}-${fim.slice(3, 7)}`, city: "Belo Horizonte", place_id: `ChIJcypress${tag}1` }),
        linha({ full_name: `=Loja Cypress Dois ${tag}`, email: `dois-${tag}@exemplo.com.br`, city: "Contagem", state: "MG" }),
        linha({ full_name: `Sem Contato ${tag}`, city: "Betim" }),
      ].join("\n");
      entrar();
      cy.visit("/empresas");
      cy.contains("a", "Importar empresas (Mailerfind)").click();
      cy.contains("h1", "Importar empresas");
      cy.get("#etiqueta").clear().type(etiqueta);
      cy.get("#arquivo").selectFile({ contents: Cypress.Buffer.from(csv), fileName: "mailerfind.csv", mimeType: "text/csv" });
      cy.contains("button", "Analisar arquivo").click();
      cy.contains("h2", "Confira antes de importar");
      cy.contains("Nome da empresa: full_name");
      cy.contains("Telefone: full_phone_number");
      cy.contains("Repetida no arquivo: mesmo lugar no Google Maps");
      cy.contains("Sem telefone nem e-mail válido");
      cy.contains("button", "Confirmar importação de 2 empresa(s)").click();
      cy.contains("h2", "Importação concluída");
      cy.contains("Baixar recusadas com o motivo (CSV)");
      cy.contains("a", "Ver as empresas desta campanha").click();
      cy.contains(`Loja Cypress Um ${tag}`);
      cy.contains(`Loja Cypress Dois ${tag}`).should("not.contain", "=");
      cy.get("table").contains(etiqueta);

      // Mesmo arquivo de novo: nada novo.
      cy.visit("/empresas/importar");
      cy.get("#arquivo").selectFile({ contents: Cypress.Buffer.from(csv), fileName: "mailerfind.csv", mimeType: "text/csv" });
      cy.contains("button", "Analisar arquivo").click();
      cy.contains("já foi importado");
      cy.contains("button", "Confirmar importação de 0 empresa(s)").should("be.disabled");
    });
  });

  it("arquivo que não é CSV é recusado pelo conteúdo", () => {
    entrar();
    cy.visit("/empresas/importar");
    cy.get("#arquivo").selectFile({ contents: Cypress.Buffer.from("%PDF-1.7\n1 0 obj"), fileName: "lista.csv", mimeType: "text/csv" });
    cy.contains("button", "Analisar arquivo").click();
    cy.get("[role=alert]").should("contain", "PDF, não CSV");
  });

  it("sequência \"Lojas BH\" começa como rascunho, com prévia, rodapé legal e aprovação só com confirmação", () => {
    entrar();
    cy.visit("/prospeccao");
    cy.contains("h1", "Sequências de prospecção");
    cy.contains("a", "Lojas BH").click();
    cy.contains("Rascunho (não envia)");
    cy.contains("Prévia (exemplo:");
    // Prévia em iframe sem permissão nenhuma (sandbox vazio): o HTML do e-mail não roda script.
    cy.get('iframe[sandbox=""]').should("have.length", 3).first().should("have.attr", "srcdoc").and("contain", "Você recebeu este e-mail porque o contato da sua empresa está público no Google Maps").and("contain", "Clique aqui para sair");
    cy.contains("Re: Estoque da");
    // Sem marcar a confirmação, o navegador não deixa aprovar.
    cy.contains("button", "Aprovar e ativar").click();
    cy.contains("Rascunho (não envia)");
    cy.get("#confirmo:invalid").should("exist");
  });
});

describe("Site: página de saída dos e-mails de prospecção", () => {
  it("link adulterado não descadastra ninguém", () => {
    cy.visit("/sair/abc.def");
    cy.contains("h1", "Sair da lista de e-mails");
    cy.contains("Link inválido");
    cy.visit("/sair/cmwm6advv0000hdktnkecvq7p.AAAAAAAAAAAAAAAAAAAAAA");
    cy.contains("button", "Não quero receber mais e-mails").click();
    cy.get("[role=alert]").should("contain", "Link inválido");
  });
});


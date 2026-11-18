// Vendedores IA com várias caixas (contato@ e atendimento@) e por tipo de
// empresa (Caio = lojas de veículos; Nina = imobiliárias e corretores):
// situação de cada caixa, ativação bloqueada sem caixa configurada,
// assinatura honesta, arrumação das sequências com prévia, inscrição por
// tipo, tirar da sequência e trocar o tipo da empresa. Sem SMTP no teste:
// nada sai de verdade.
describe("Hub: caixas e tipos dos vendedores IA", { baseUrl: "http://localhost:3100" }, () => {
  // A API aceita no máximo 8 logins por minuto por endereço.
  before(() => cy.wait(61_000));

  const entrar = () => {
    cy.visit("/entrar");
    cy.get("#email").type("admin@novoseminovo.com.br");
    cy.get("#password").type("senha1234", { log: false });
    cy.contains("button", "Entrar").click();
    cy.location("pathname").should("eq", "/");
  };

  it("painel: caixa e tipos de cada vendedor; Caio não ativa sem a caixa configurada; assinatura precisa ser honesta", () => {
    entrar();
    cy.visit("/vendedores");
    cy.contains("a", "Caio").should("contain", "atendimento@novoseminovo.com.br").and("contain", "Não configurada").and("contain", "Lojas de veículos").and("contain", "Inativo");
    cy.contains("a", "Nina").should("contain", "contato@novoseminovo.com.br").and("contain", "Imobiliárias, Corretores de imóveis");
    cy.contains("h2", "Caixas de e-mail");
    cy.contains("a", "Caio").click();
    cy.contains("h1", "Caio");
    cy.get("#at-sim").check();
    cy.contains("button", "Salvar ajustes").click();
    cy.get("[role=alert]").should("contain", "atendimento@novoseminovo.com.br não está configurada");
    cy.get("#at-nao").check();
    cy.get("#assinatura").clear().type("Diego Louis, NovoSeminovo");
    cy.contains("button", "Salvar ajustes").click();
    cy.get("[role=alert]").should("contain", "precisa ter o nome");
    cy.get("#assinatura").clear().type("Caio, assistente virtual de vendas | NovoSeminovo");
    cy.contains("button", "Salvar ajustes").click();
    cy.contains("Ajustes salvos.");
    cy.reload();
    cy.contains("dd", "Caio, assistente virtual de vendas | NovoSeminovo");
  });

  it("arrumar sequências: prévia sem mudar nada; aplicar só com confirmação e sem enviar", () => {
    entrar();
    cy.visit("/vendedores");
    cy.contains("a", "Arrumar sequências").click();
    cy.contains("h1", "Arrumar sequências");
    for (const nome of ["Lojas BH", "Caio: lojas de veículos", "Nina: imobiliárias e corretores"]) cy.contains("th", nome);
    cy.contains("Nenhuma sequência é aprovada nem ativada aqui");
    cy.contains("button", "Aplicar a arrumação").click();
    cy.get("#confirmo:invalid").should("exist");
    cy.get("#confirmo").check();
    cy.contains("button", "Aplicar a arrumação").click();
    cy.contains("Arrumação aplicada. Nenhum e-mail foi enviado.");
  });

  it("importa imóveis (corretor x imobiliária pela categoria), inscreve só corretores, tira da sequência e troca o tipo", () => {
    const tag = Date.now().toString(36);
    const etiqueta = `Imoveis ${tag}`;
    cy.readFile("cypress/fixtures/mailerfind-google-maps.csv").then((modelo: string) => {
      const cabecalho = modelo.split("\n")[0]!;
      const colunas = cabecalho.split(",");
      const linha = (v: Record<string, string>) => colunas.map((c) => v[c] ?? "").join(",");
      const csv = [
        cabecalho,
        linha({ full_name: `Corretor Cypress ${tag}`, category: "Corretor de imóveis", email: `corretor-${tag}@exemplo.com.br`, city: "Belo Horizonte", state: "MG", place_id: `ChIJimov${tag}1` }),
        linha({ full_name: `Imobiliaria Cypress ${tag}`, category: "Imobiliária", email: `imob-${tag}@exemplo.com.br`, city: "Contagem", state: "MG", place_id: `ChIJimov${tag}2` }),
      ].join("\n");
      entrar();
      cy.visit("/empresas/importar");
      cy.get("#etiqueta").clear().type(etiqueta);
      cy.get("#seg-property").check();
      cy.get("#arquivo").selectFile({ contents: Cypress.Buffer.from(csv), fileName: "imoveis.csv", mimeType: "text/csv" });
      cy.contains("button", "Analisar arquivo").click();
      cy.contains("button", "Confirmar importação de 2 empresa(s)").click();
      cy.contains("h2", "Importação concluída");

      cy.visit("/prospeccao");
      cy.contains("a", "Nina: imobiliárias e corretores").click();
      cy.contains("Remetente:").should("contain", "Nina").and("contain", "contato@novoseminovo.com.br");
      cy.get("#etiqueta-inscrever").select(etiqueta, { force: true });
      cy.get("#tipo-broker").check();
      cy.contains("button", "Inscrever empresas").click();
      cy.get("[role=status]").should("contain", "1 empresa(s) inscrita(s).");
      cy.reload();
      cy.contains("li", `Corretor Cypress ${tag}`).should("contain", "Corretor de imóveis").find("input[type=checkbox]").check();
      cy.contains("button", "Tirar as marcadas da sequência").click();
      cy.contains("1 empresa(s) retirada(s) da sequência.");
      cy.reload();
      cy.contains(`Corretor Cypress ${tag}`).should("not.exist");

      cy.visit("/empresas");
      cy.contains("a", `Imobiliaria Cypress ${tag}`).click();
      cy.get("#segmento-card").should("have.value", "property").select("broker");
      cy.contains("button", "Salvar tipo").click();
      cy.contains("Tipo da empresa salvo.");
    });
  });
});

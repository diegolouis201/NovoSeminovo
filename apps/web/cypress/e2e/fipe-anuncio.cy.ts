// Guia 1 promete "Preço de referência FIPE no anúncio, para você comparar
// antes de ligar". O bloco aparece perto do preço só quando o anúncio de
// veículo tem FIPE cadastrada (no seed: Corolla R$ 94.500 x FIPE R$ 96.200,
// 1,8% abaixo = "na média").
type Detalhe = { id: string; title: string; fipePrice?: number };

describe("Referência FIPE no anúncio", () => {
  const api = () => Cypress.env("apiUrl") as string;

  // Lista pela busca pública e abre o detalhe de cada um (cy.request, sem CORS).
  function detalhes(assetType: "vehicle" | "property") {
    const lista: Detalhe[] = [];
    return cy
      .request(`${api()}/listings?assetType=${assetType}`)
      .then((res) => {
        for (const { id } of res.body as { id: string }[]) {
          cy.request(`${api()}/listings/${id}`).then((r) => lista.push(r.body as Detalhe));
        }
      })
      .then(() => lista);
  }

  it("veículo com FIPE: mostra valor, comparação e link para a tabela oficial", () => {
    detalhes("vehicle").then((lista) => {
      const comFipe = lista.find((l) => l.fipePrice === 96200);
      expect(comFipe, "anúncio do seed com FIPE").to.exist;
      cy.visit(`/anuncio/${comFipe!.id}`);
      cy.get("[data-testid=referencia-fipe]").within(() => {
        cy.contains(/Referência FIPE:\s*R\$\s*96\.200,00/);
        cy.contains("na média");
        cy.contains("valor de referência da tabela FIPE no cadastro do anúncio");
        cy.contains("a", "veiculos.fipe.org.br")
          .should("have.attr", "href", "https://veiculos.fipe.org.br/")
          .and("have.attr", "target", "_blank")
          .and("have.attr", "rel", "noopener noreferrer");
      });
      // A ficha técnica não repete a FIPE (o bloco já mostra, com a comparação).
      cy.get("dl").should("not.contain", "FIPE");
    });
  });

  it("veículo sem FIPE: nenhum bloco", () => {
    detalhes("vehicle").then((lista) => {
      const semFipe = lista.find((l) => !l.fipePrice);
      expect(semFipe, "anúncio do seed sem FIPE").to.exist;
      cy.visit(`/anuncio/${semFipe!.id}`);
      cy.contains("h1", semFipe!.title);
      cy.get("[data-testid=referencia-fipe]").should("not.exist");
    });
  });

  it("imóvel: nunca mostra FIPE", () => {
    detalhes("property").then((lista) => {
      cy.visit(`/anuncio/${lista[0]!.id}`);
      cy.contains("h1", lista[0]!.title);
      cy.get("[data-testid=referencia-fipe]").should("not.exist");
    });
  });

  it("celular: bloco cabe na tela sem rolagem lateral", () => {
    cy.viewport(375, 800);
    detalhes("vehicle").then((lista) => {
      const comFipe = lista.find((l) => (l.fipePrice ?? 0) > 0)!;
      cy.visit(`/anuncio/${comFipe.id}`);
      cy.get("[data-testid=referencia-fipe]").should("be.visible");
      cy.document().then((doc) => {
        expect(doc.documentElement.scrollWidth).to.be.at.most(375);
      });
    });
  });
});

// O Passaporte Digital / Diário do Carro foi descontinuado (08/11/2026,
// decisão do Diego, por risco jurídico das informações). As páginas antigas
// redirecionam de vez e nenhuma tela pública fala do Passaporte.

const PAGINAS_SEM_PASSAPORTE = [
  "/",
  "/carros",
  "/imoveis",
  "/busca",
  "/anunciar",
  "/como-funciona",
  "/quem-somos",
  "/para-lojas",
  "/para-lojas/comecar",
  "/perguntas-frequentes",
  "/guia",
  "/termos",
  "/privacidade",
];
const PASSAPORTE = /passaporte|diário do carro|histórico completo deste veículo/i;

describe("Sem Passaporte Digital / Diário do Carro", () => {
  it("páginas antigas redirecionam de vez (301)", () => {
    const redirects: [string, string][] = [
      ["/consultar-veiculo", "/carros"],
      ["/consultar-veiculo?placa=ABC1D23", "/carros"],
      ["/veiculo/x", "/carros"],
      ["/veiculo/x/card", "/carros"],
      ["/ficha-tecnica", "/carros"],
      ["/conta/veiculos", "/conta"],
      ["/conta/veiculos/novo", "/conta"],
      ["/parceiro/servicos", "/parceiro"],
    ];
    for (const [from, to] of redirects) {
      cy.request({ url: from, followRedirect: false }).then((res) => {
        expect(res.status, from).to.eq(301);
        expect(res.redirectedToUrl ?? res.headers.location, from).to.match(new RegExp(`${to}(\\?.*)?$`));
      });
    }
  });

  it("quem abre /consultar-veiculo e /veiculo/x cai na lista de carros", () => {
    cy.visit("/consultar-veiculo");
    cy.location("pathname").should("eq", "/carros");
    cy.visit("/veiculo/x");
    cy.location("pathname").should("eq", "/carros");
  });

  it("páginas públicas e rodapé não falam do Passaporte", () => {
    for (const path of PAGINAS_SEM_PASSAPORTE) {
      cy.visit(path);
      cy.get("body").invoke("text").should("not.match", PASSAPORTE);
      cy.get('a[href^="/consultar-veiculo"], a[href^="/veiculo/"], a[href^="/ficha-tecnica"]').should("not.exist");
    }
  });

  // Auditoria de SEO (21/11/2026): o "histórico" saiu também do que o Google e
  // as redes mostram (description, og:*, twitter:*, title) em toda página.
  it("título e prévias de compartilhamento sem 'histórico' do veículo", () => {
    for (const path of PAGINAS_SEM_PASSAPORTE) {
      cy.visit(path);
      cy.get('head title, head meta[name="description"], head meta[property^="og:"], head meta[name^="twitter:"]').each(($el) => {
        const texto = $el.attr("content") ?? $el.text();
        expect(texto, `${path}: ${texto}`).not.to.match(/histórico|historico|passaporte|diário do carro/i);
      });
    }
  });

  it("mapa do site não lista a consulta por placa", () => {
    cy.request("/sitemap.xml").its("body").should("not.include", "/consultar-veiculo");
  });

  it("área logada sem 'Meus veículos' e sem 'Serviços' da oficina", () => {
    cy.loginAs("admin@novoseminovo.com.br", "senha1234");
    cy.visit("/conta");
    cy.get("body").invoke("text").should("not.match", PASSAPORTE);
    cy.get('a[href^="/conta/veiculos"], a[href^="/parceiro/servicos"]').should("not.exist");
  });
});

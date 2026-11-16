// Guias de SEO (fase 1 e fase 2, texto do marketing revisado, 16/11/2026):
// vinte guias em /guia/..., páginas de índice, marcação para o Google
// (Article, FAQPage, BreadcrumbList) e entrada no sitemap e no /llms.txt.

const GUIAS = [
  {
    url: "/guia/comprar-carro-usado/como-evitar-golpe",
    h1: "Como evitar golpe na compra de carro usado",
    title: "Como evitar golpe na compra de carro usado | NovoSeminovo",
  },
  {
    url: "/guia/vender-carro/documentos",
    h1: "Documentos para vender carro",
    title: "Documentos para vender carro: lista completa | NovoSeminovo",
  },
  {
    url: "/guia/comprar-carro-usado/como-avaliar",
    h1: "Como avaliar um carro usado antes de comprar",
    title: "Como avaliar um carro usado: checklist antes de comprar | NovoSeminovo",
  },
  {
    url: "/guia/comprar-imovel/matricula-atualizada",
    h1: "Matrícula atualizada do imóvel: o que é e onde pedir",
    title: "Matrícula atualizada do imóvel: o que é e onde pedir | NovoSeminovo",
  },
  {
    url: "/guia/comprar-imovel/golpes",
    h1: "Golpes na compra e no aluguel de imóvel: como se proteger",
    title: "Golpes na compra e no aluguel de imóvel: como se proteger | NovoSeminovo",
  },
  // Fase 2 (guias 6 a 20). Endereços exatamente como no PDF do marketing.
  {
    url: "/guia/comprar-carro-usado/documentos-e-transferencia",
    h1: "Documentos na compra e na transferência do carro",
    title: "Documentos para comprar carro usado e fazer a transferência | NovoSeminovo",
  },
  {
    url: "/guia/comprar-carro-usado/tabela-fipe",
    h1: "Tabela FIPE: como usar na negociação",
    title: "Tabela FIPE: o que é e como usar para negociar carro usado | NovoSeminovo",
  },
  {
    url: "/guia/comprar-carro-usado/financiamento",
    h1: "Financiamento de veículo: como funciona a simulação",
    title: "Financiamento de carro usado: como funciona a simulação | NovoSeminovo",
  },
  {
    url: "/guia/comprar-carro-usado/loja-ou-particular",
    h1: "Comprar carro de loja ou de particular: o que muda",
    title: "Comprar carro usado de loja ou de particular: o que muda | NovoSeminovo",
  },
  {
    url: "/guia/comprar-carro-usado/test-drive",
    h1: "Test drive: o que observar",
    title: "Test drive de carro usado: o que observar | NovoSeminovo",
  },
  {
    url: "/guia/comprar-carro-usado/custo-de-manter",
    h1: "Quanto custa manter um carro",
    title: "Quanto custa manter um carro: IPVA, seguro, licenciamento e manutenção | NovoSeminovo",
  },
  {
    url: "/guia/comprar-carro-usado/suv-hatch-ou-sedan",
    h1: "SUV, hatch ou sedan: qual combina com você",
    title: "SUV, hatch ou sedan: qual tipo de carro escolher | NovoSeminovo",
  },
  {
    url: "/guia/comprar-carro-usado/qual-carro-cabe-no-bolso",
    h1: "Qual carro cabe no meu bolso",
    title: "Qual carro cabe no meu bolso? Como calcular | NovoSeminovo",
  },
  {
    url: "/guia/comprar-imovel/checklist-da-visita",
    h1: "Checklist da visita ao imóvel",
    title: "Checklist da visita ao imóvel: o que olhar antes de comprar | NovoSeminovo",
  },
  {
    url: "/guia/comprar-imovel/certidoes-do-vendedor",
    h1: "Certidões do vendedor: quais pedir",
    title: "Certidões do vendedor na compra de imóvel: quais pedir | NovoSeminovo",
  },
  {
    url: "/guia/comprar-imovel/itbi-e-escritura",
    h1: "ITBI e escritura: o que são e quando pagar",
    title: "ITBI e escritura: o que são, quanto custam e quando pagar | NovoSeminovo",
  },
  {
    url: "/guia/comprar-imovel/financiamento",
    h1: "Financiamento imobiliário: como funciona a simulação",
    title: "Financiamento imobiliário: como funciona a simulação | NovoSeminovo",
  },
  {
    url: "/guia/comprar-imovel/fgts",
    h1: "Como usar o FGTS na compra do imóvel",
    title: "Como usar o FGTS para comprar imóvel: regras e passo a passo | NovoSeminovo",
  },
  {
    url: "/guia/comprar-imovel/apartamento-ou-casa",
    h1: "Apartamento ou casa: o que olhar no condomínio",
    title: "Apartamento ou casa? O que olhar no condomínio antes de comprar | NovoSeminovo",
  },
  {
    url: "/guia/comprar-imovel/arquiteto-novoseminovo",
    h1: "Ver o imóvel reformado antes de visitar: o Arquiteto NovoSeminovo",
    title: "Veja como o imóvel pode ficar reformado: Arquiteto NovoSeminovo | NovoSeminovo",
  },
];

/** Guia pelo número do PDF do marketing (1 a 20). */
const guia = (n: number) => GUIAS[n - 1];

/** Nada disso pode aparecer em guia nenhum (marca nacional, sem promessa de crédito). */
const PROIBIDOS = [/cashback/i, /passaporte/i, /di[aá]rio do carro/i, /\bIBS\b/, /Belo Horizonte/i, /cr[eé]dito aprovado/i, /aprova[cç][aã]o garantida/i, /Site: ajustar/i];

const AVISO = "Conteúdo informativo. Regras de Detran e cartório mudam de estado para estado: confira no órgão do seu estado.";

function jsonLdTypes(): Cypress.Chainable<string[]> {
  return cy.get('script[type="application/ld+json"]').then(($scripts) => {
    const types: string[] = [];
    $scripts.each((_, el) => {
      const data = JSON.parse(el.textContent ?? "{}");
      const items = Array.isArray(data) ? data : data["@graph"] ?? [data];
      for (const item of items) types.push(item["@type"]);
    });
    return types;
  });
}

describe("Guias", () => {
  for (const guia of GUIAS) {
    it(`${guia.url}: título, H1, aviso e marcação para o Google`, () => {
      cy.visit(guia.url);
      cy.title().should("eq", guia.title);
      cy.get("h1").should("have.text", guia.h1);
      cy.contains(AVISO).should("be.visible");
      cy.contains("h2", "Perguntas frequentes").should("be.visible");
      cy.get('link[rel="canonical"]').should("have.attr", "href").and("match", new RegExp(`${guia.url}$`));
      cy.get('meta[property="og:title"]').should("have.attr", "content", guia.title);
      cy.get('meta[name="description"]').should("have.attr", "content").and("have.length.greaterThan", 50);
      jsonLdTypes().should("include.members", ["Article", "FAQPage", "BreadcrumbList"]);
      cy.get('script[type="application/ld+json"]').then(($scripts) => {
        const faq = $scripts
          .toArray()
          .flatMap((el) => {
            const data = JSON.parse(el.textContent ?? "{}");
            return Array.isArray(data) ? data : data["@graph"] ?? [data];
          })
          .find((item) => item["@type"] === "FAQPage");
        expect(faq.mainEntity.length).to.be.greaterThan(1);
        expect(faq.mainEntity[0].acceptedAnswer.text).to.have.length.greaterThan(20);
        const article = $scripts
          .toArray()
          .map((el) => JSON.parse(el.textContent ?? "{}"))
          .find((item) => item["@type"] === "Article");
        expect(article.headline).to.eq(guia.h1);
        expect(article.datePublished).to.eq("2026-11-16");
        expect(article.dateModified).to.eq("2026-11-16");
      });
      cy.get("main").invoke("text").then((text) => {
        for (const proibido of PROIBIDOS) expect(text).not.to.match(proibido);
      });
    });
  }

  it("fase 2: guia 20 usa os nomes reais dos botões do Arquiteto", () => {
    cy.visit(guia(20).url);
    for (const nome of [
      "Arquiteto NovoSeminovo",
      "Veja o imóvel reformado com IA",
      "1. Escolha os cômodos",
      "Todos de uma vez",
      "Um cômodo por vez",
      "2. Converse com o Arquiteto",
      "Antes e depois",
      "Lista de compras da reforma",
      "Imprimir ou salvar PDF",
    ]) {
      cy.contains("main ol", nome).should("exist");
    }
    cy.contains("main ol", "entrar na sua conta").should("exist");
    cy.get("main").should("not.contain.text", "Abra o Arquiteto NovoSeminovo no anúncio.");
  });

  it("fase 2: correções sobre o produto e avisos de crédito", () => {
    // FIPE só aparece quando está no cadastro do anúncio.
    cy.visit(guia(7).url);
    cy.contains("main", "quando ele está no cadastro").should("exist");
    // Validade das certidões muda de uma para outra.
    cy.visit(guia(15).url);
    cy.contains("main", "O prazo muda de uma certidão para outra").should("exist");
    cy.get("main").should("not.contain.text", "em geral curta (cerca de 30 dias)");
    // Mapa: a chamada leva à busca de imóveis, que tem o mapa.
    cy.visit(guia(19).url);
    cy.get('main a[href="/busca?assetType=property"]').should("contain.text", "mapa");
    // Guias de crédito: não somos instituição financeira; parceira de crédito sem nome.
    for (const n of [8, 13, 17, 18]) {
      cy.visit(guia(n).url);
      cy.contains("main", "O NovoSeminovo não é instituição financeira e não concede crédito.").should("exist");
    }
    for (const n of [8, 17]) {
      cy.visit(guia(n).url);
      cy.contains("main", "Atendimento de crédito pela nossa parceira de crédito.").should("exist");
    }
    // Frases já adotadas na fase 1.
    for (const n of [9, 15]) {
      cy.visit(guia(n).url);
      cy.contains("main", "selo verificado (empresa conferida pela nossa equipe)").should("exist");
    }
    for (const n of [6, 16, 18]) {
      cy.visit(guia(n).url);
      cy.contains("main", "veja as opções de financiamento no próprio anúncio").should("exist");
    }
    cy.visit(guia(12).url);
    cy.get('main a[href="/busca?assetType=vehicle&bodyType=suv"]').should("exist");
  });

  it("fase 2: todos os links internos dos guias novos levam a páginas que existem", () => {
    for (const g of GUIAS.slice(5)) {
      cy.visit(g.url);
      cy.get('main a[href^="/"]').each(($a) => {
        cy.request($a.attr("href")!).its("status").should("eq", 200);
      });
    }
  });

  it("/llms.txt traz os vinte guias", () => {
    cy.request("/llms.txt").then((res) => {
      for (const g of GUIAS) expect(res.body).to.include(`${g.url})`);
    });
  });

  it("ajustes aprovados: selo sem CRECI/CNPJ confirmados e sem simulação", () => {
    for (const url of [GUIAS[0].url, GUIAS[4].url]) {
      cy.visit(url);
      cy.contains("main", "selo verificado (empresa conferida pela nossa equipe)").should("exist");
      cy.get("main").should("not.contain.text", "CRECI confirmados");
    }
    cy.visit(GUIAS[2].url);
    cy.contains("main", "veja as opções de financiamento no próprio anúncio").should("exist");
    cy.contains("main", "O NovoSeminovo não é instituição financeira e não concede crédito.").should("exist");
    cy.get("main").should("not.contain.text", "simule o financiamento");
    cy.get('main a[href="/busca?assetType=vehicle&bodyType=suv"]').should("exist");
  });

  it("links internos levam a páginas que existem", () => {
    cy.visit(GUIAS[0].url);
    cy.get('main a[href="/carros"]').should("exist");
    cy.get(`main a[href="${GUIAS[2].url}"]`).should("exist");
    cy.get(`main a[href="${GUIAS[1].url}"]`).should("exist");
    cy.get('main a[href^="/"]').each(($a) => {
      cy.request($a.attr("href")!).its("status").should("eq", 200);
    });
  });

  it("índices listam os guias", () => {
    cy.visit("/guia");
    cy.get("h1").should("contain.text", "Guias");
    for (const guia of GUIAS) cy.get(`main a[href="${guia.url}"]`).should("exist");

    cy.visit("/guia/comprar-carro-usado");
    cy.get(`main a[href="${GUIAS[0].url}"]`).should("exist");
    cy.get(`main a[href="${GUIAS[2].url}"]`).should("exist");
    cy.get(`main a[href="${GUIAS[3].url}"]`).should("not.exist");

    cy.visit("/guia/vender-carro");
    cy.get(`main a[href="${GUIAS[1].url}"]`).should("exist");

    cy.visit("/guia/comprar-imovel");
    cy.get(`main a[href="${GUIAS[3].url}"]`).should("exist");
    cy.get(`main a[href="${GUIAS[4].url}"]`).should("exist");

    // Fase 2: guias 6 a 13 no tema de carro, 14 a 20 no de imóvel.
    cy.visit("/guia/comprar-carro-usado");
    for (let n = 6; n <= 13; n++) cy.get(`main a[href="${guia(n).url}"]`).should("exist");
    cy.get(`main a[href="${guia(14).url}"]`).should("not.exist");
    cy.visit("/guia/comprar-imovel");
    for (let n = 14; n <= 20; n++) cy.get(`main a[href="${guia(n).url}"]`).should("exist");
    cy.get(`main a[href="${guia(8).url}"]`).should("not.exist");
  });

  it("guia ou tema que não existe dá 404", () => {
    for (const url of ["/guia/comprar-carro-usado/nao-existe", "/guia/tema-inexistente", "/guia/vender-carro/como-evitar-golpe"]) {
      cy.request({ url, failOnStatusCode: false }).its("status").should("eq", 404);
    }
  });

  it("rodapé tem o link Guias e o sitemap traz todos os guias", () => {
    cy.visit("/");
    cy.get('footer a[href="/guia"]').should("contain.text", "Guias");
    cy.request("/sitemap.xml").then((res) => {
      for (const url of ["/guia", "/guia/comprar-carro-usado", "/guia/vender-carro", "/guia/comprar-imovel", ...GUIAS.map((g) => g.url)]) {
        expect(res.body).to.include(`${url}</loc>`);
      }
    });
  });
});

// Auditoria de SEO do Diego (21/11/2026): o que o Google lê de cada página
// pública — título, descrição, prévia de compartilhamento, H1, canonical,
// robots, alt das imagens, sitemap e dados estruturados.

const seoApi = () => Cypress.env("apiUrl") as string;

const meta = (selector: string) => cy.get(`head ${selector}`, { log: false }).invoke("attr", "content");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ld = Record<string, any>;
const ldJson = () =>
  cy
    .document()
    .then((doc): Ld[] => Array.from(doc.querySelectorAll('script[type="application/ld+json"]')).map((script) => JSON.parse(script.textContent ?? "null")));

const DESCRICOES = {
  "/": "Carros e imóveis no mesmo lugar, em todo o Brasil. Anuncie grátis, fale com o anunciante e veja as opções de financiamento no próprio anúncio.",
  "/carros": "Carros seminovos e usados de lojas e particulares, com selo de loja verificada, preço de referência FIPE e simulação de financiamento no anúncio.",
  "/imoveis": "Casas, apartamentos e terrenos à venda e para alugar, com mapa, simulação de financiamento e selo de imobiliária verificada.",
} as const;

describe("SEO: descrições sem 'histórico' (item 1)", () => {
  for (const [path, texto] of Object.entries(DESCRICOES)) {
    it(`${path}: description, og:description e twitter:description com o texto novo`, () => {
      cy.visit(path);
      meta('meta[name="description"]').should("eq", texto);
      meta('meta[property="og:description"]').should("eq", texto);
      meta('meta[name="twitter:description"]').should("eq", texto);
    });
  }

  it("nenhuma página pública fala em 'histórico' no que o Google e as redes mostram", () => {
    for (const path of ["/", "/carros", "/imoveis", "/busca", "/anunciar", "/para-lojas", "/para-lojas/comecar", "/como-funciona", "/quem-somos", "/perguntas-frequentes", "/contato", "/guia"]) {
      cy.visit(path);
      cy.get('head meta[name="description"], head meta[property^="og:"], head meta[name^="twitter:"], head title').each(($el) => {
        const texto = $el.attr("content") ?? $el.text();
        expect(texto, `${path}: ${texto}`).not.to.match(/histórico|historico|passaporte|cashback/i);
      });
    }
  });
});

describe("SEO: títulos e H1 (itens 6 e 8)", () => {
  it("início", () => {
    cy.visit("/");
    cy.get("h1").should("have.length", 1).and("have.text", "Carros e imóveis à venda, sem enrolação");
    cy.get("main").should("contain.text", "Comprar e vender não precisa ser chato.");
  });

  it("/carros sem o nome repetido no título", () => {
    cy.visit("/carros");
    cy.title().should("eq", "Carros seminovos e usados à venda | NovoSeminovo");
    cy.get("h1").should("have.length", 1).and("have.text", "Carros seminovos e usados à venda");
    cy.get("main").should("contain.text", "Comprar e vender carro não precisa ser chato.");
  });

  it("/imoveis sem o nome repetido no título", () => {
    cy.visit("/imoveis");
    cy.title().should("eq", "Imóveis à venda e para alugar | NovoSeminovo");
    cy.get("h1").should("have.length", 1).and("have.text", "Imóveis à venda e para alugar");
  });
});

describe("SEO: /carros e /imoveis com texto e links próprios (item 7)", () => {
  it("/carros: tipos de carroceria, marcas e guias de carro", () => {
    cy.visit("/carros");
    for (const tipo of ["suv", "hatch", "sedan", "pickup"]) {
      cy.get(`main a[href="/busca?assetType=vehicle&bodyType=${tipo}"]`).should("exist");
    }
    cy.get('main a[href="/busca?assetType=vehicle&brand=Fiat"]').should("exist");
    cy.get('main a[href^="/guia/comprar-carro-usado/"]').should("have.length.at.least", 3);
    cy.get('main a[href="/guia"]').should("exist");
  });

  it("/imoveis: tipos, aluguel e guias de imóvel", () => {
    cy.visit("/imoveis");
    for (const tipo of ["house", "apartment", "land", "commercial"]) {
      cy.get(`main a[href="/busca?assetType=property&propertyType=${tipo}"]`).should("exist");
    }
    cy.get('main a[href="/busca?assetType=property&purpose=rent"]').should("exist");
    cy.get('main a[href^="/guia/comprar-imovel/"]').should("have.length.at.least", 3);
  });

  it("cada link de tipo leva a uma busca que abre", () => {
    cy.request("/busca?assetType=vehicle&bodyType=pickup").its("status").should("eq", 200);
    cy.request("/busca?assetType=property&purpose=rent").its("status").should("eq", 200);
  });
});

describe("SEO: /busca com título, canonical e noindex pelo filtro (item 4)", () => {
  it("SUV: título e canonical do filtro", () => {
    cy.visit("/busca?assetType=vehicle&bodyType=suv");
    cy.title().should("eq", "SUVs à venda em todo o Brasil | NovoSeminovo");
    cy.get('head link[rel="canonical"]').should("have.attr", "href").and("match", /\/busca\?assetType=vehicle&bodyType=suv$/);
    meta('meta[name="description"]').should("match", /^SUVs à venda em todo o Brasil no NovoSeminovo\./);
  });

  it("canonical limpo: sem ordem, página e rastreio, parâmetros em ordem fixa", () => {
    cy.visit("/busca?utm_source=meta&state=MG&page=2&sort=preco&bodyType=suv&assetType=vehicle&gclid=x");
    cy.get('head link[rel="canonical"]').should("have.attr", "href").and("match", /\/busca\?assetType=vehicle&bodyType=suv&state=MG$/);
    cy.title().should("eq", "SUVs à venda em Minas Gerais | NovoSeminovo");
  });

  it("busca com anúncios: indexável; sem anúncios: noindex, follow", () => {
    cy.visit("/busca?assetType=vehicle");
    cy.get('head meta[name="robots"]').should("not.exist");
    cy.visit("/busca?assetType=vehicle&state=AC");
    cy.get('head meta[name="robots"]').should("have.attr", "content", "noindex, follow");
  });

  it("parâmetro malicioso na URL não aparece no título nem no canonical", () => {
    const ataque = '"><script>alert(1)</script>';
    cy.visit(`/busca?assetType=vehicle&city=${encodeURIComponent(ataque)}&state=MG&brand=${encodeURIComponent(ataque)}`);
    cy.title().should("eq", "Carros à venda em Minas Gerais | NovoSeminovo");
    cy.get('head link[rel="canonical"]').should("have.attr", "href").and("not.contain", "script");
  });
});

describe("SEO: /para-lojas/comecar fala da integração, não do link (item 3)", () => {
  it("descrição e bloco com CRM/catálogo ou planilha", () => {
    cy.visit("/para-lojas/comecar");
    meta('meta[name="description"]').should("match", /CRM/).and("match", /planilha/).and("not.match", /pelo link/);
    cy.get("main").should("contain.text", "Estoque no ar sem cadastrar um por um: integra com o seu CRM ou catálogo de veículos, ou sobe por planilha.");
    cy.get("main").invoke("text").should("not.match", /importe pelo link|cole o link|tempo real/i);
  });
});

describe("SEO: /anunciar pública (item 5)", () => {
  it("sem login: página que explica como anunciar grátis, com entrar e cadastrar", () => {
    cy.request({ url: "/anunciar", followRedirect: false }).its("status").should("eq", 200);
    cy.visit("/anunciar");
    cy.location("pathname").should("eq", "/anunciar");
    cy.title().should("match", /anunciar.*grátis/i);
    cy.get('head link[rel="canonical"]').should("have.attr", "href").and("match", /\/anunciar$/);
    cy.get("h1").should("have.length", 1).invoke("text").should("match", /grátis/i);
    cy.get("main").should("contain.text", "Pessoa física").and("contain.text", "Grátis").and("contain.text", "Flex").and("contain.text", "Turbo").and("contain.text", "Nitro");
    cy.get('main a[href="/entrar?voltar=%2Fanunciar"]').should("exist");
    cy.get('main a[href="/cadastro?voltar=%2Fanunciar"]').should("exist");
    cy.get('main a[href="/para-lojas"]').should("exist");
  });

  it("logado: continua o passo a passo de anunciar", () => {
    cy.loginAs("admin@novoseminovo.com.br", "senha1234");
    cy.visit("/anunciar?tipo=vehicle");
    cy.get('a[href="/anunciar?tipo=vehicle&modo=completo"]').should("exist");
    cy.get('main a[href="/entrar?voltar=%2Fanunciar"]').should("not.exist");
  });

  it("continua no sitemap", () => {
    cy.request("/sitemap.xml").its("body").should("contain", "/anunciar</loc>");
  });
});

describe("SEO: alt em toda imagem (item 9)", () => {
  it("logos das marcas com alt 'Carros <marca>'", () => {
    cy.visit("/carros");
    cy.get('img[src="/marcas-carros/fiat.png"]').should("have.attr", "alt", "Carros Fiat");
  });

  it("toda <img> das páginas públicas principais tem atributo alt", () => {
    for (const path of ["/", "/carros", "/imoveis", "/busca?assetType=vehicle", "/anunciar", "/guia", "/para-lojas", "/para-lojas/comecar"]) {
      cy.visit(path);
      cy.get("img").each(($img) => {
        expect($img.attr("alt"), `${path}: ${$img.attr("src")}`).to.be.a("string");
      });
    }
  });
});

describe("SEO: imagem de compartilhamento nos guias (item 10)", () => {
  for (const path of ["/guia", "/guia/comprar-imovel", "/guia/comprar-carro-usado/como-evitar-golpe"]) {
    it(`${path} tem og:image que abre como PNG`, () => {
      cy.visit(path);
      meta('meta[property="og:image"]').then((url) => {
        expect(url).to.be.a("string");
        cy.request(String(url).replace(/^https?:\/\/[^/]+/, "")).then((res) => {
          expect(res.status).to.eq(200);
          expect(res.headers["content-type"]).to.contain("image/png");
        });
      });
    });
  }
});

describe("SEO: sitemap com data e anúncios/lojas (item 11)", () => {
  it("toda URL tem <lastmod>; anúncios e lojas estão lá", () => {
    cy.request("/sitemap.xml").then((res) => {
      const urls = res.body.match(/<url>[\s\S]*?<\/url>/g) as string[];
      expect(urls.length).to.be.greaterThan(20);
      for (const url of urls) expect(url, url).to.match(/<lastmod>\d{4}-\d{2}-\d{2}/);
      expect(res.body).to.match(/\/anuncio\/[^<]+<\/loc>/);
      expect(res.body).to.match(/\/lojas\/[^<]+<\/loc>/);
    });
  });
});

describe("SEO: dados estruturados do anúncio e da loja (item 12)", () => {
  it("anúncio de carro: Car + Offer com preço, BRL, marca, modelo, ano e km", () => {
    cy.request(`${seoApi()}/listings?assetType=vehicle`).then((res) => {
      const [first] = res.body as { id: string }[];
      cy.visit(`/anuncio/${first!.id}`);
      ldJson().then((items) => {
        const car = items.find((item: Ld) => item?.["@type"] === "Car") as Ld;
        expect(car, "Car").to.exist;
        expect(car.brand.name).to.be.a("string");
        expect(car.model).to.be.a("string");
        expect(car.vehicleModelDate).to.match(/^\d{4}$/);
        expect(car.mileageFromOdometer.unitCode).to.eq("KMT");
        expect(car.offers.priceCurrency).to.eq("BRL");
        expect(car.offers.price).to.be.a("number");
        expect(car.offers.availability).to.eq("https://schema.org/InStock");
      });
    });
  });

  it("anúncio de imóvel: Offer com o imóvel, bairro/cidade e sem endereço exato", () => {
    cy.request(`${seoApi()}/listings?assetType=property`).then((res) => {
      const [first] = res.body as { id: string }[];
      cy.visit(`/anuncio/${first!.id}`);
      ldJson().then((items) => {
        const offer = items.find((item: Ld) => item?.["@type"] === "Offer") as Ld;
        expect(offer, "Offer").to.exist;
        expect(offer.priceCurrency).to.eq("BRL");
        expect(offer.itemOffered.address.addressLocality).to.be.a("string");
        expect(JSON.stringify(offer)).not.to.match(/streetAddress|latitude|longitude|"geo"/);
      });
    });
  });

  it("loja: AutoDealer ou RealEstateAgent", () => {
    cy.request("/sitemap.xml").then((res) => {
      const slug = /\/lojas\/([^<]+)<\/loc>/.exec(res.body)![1];
      cy.visit(`/lojas/${slug}`);
      ldJson().then((items) => {
        const loja = items.find((item: Ld) => ["AutoDealer", "RealEstateAgent"].includes(item?.["@type"])) as Ld;
        expect(loja, "AutoDealer/RealEstateAgent").to.exist;
        expect(loja.url).to.match(new RegExp(`/lojas/${slug}$`));
      });
    });
  });

  it("anúncio pausado: visitante vai para a busca da mesma categoria e cidade; volta ao ar normalmente", () => {
    cy.request("POST", `${seoApi()}/auth/login`, { email: "particular@novoseminovo.com.br", password: "senha1234" }).then((login) => {
      const headers = { Authorization: `Bearer ${login.body.accessToken}` };
      cy.request({ url: `${seoApi()}/listings/mine`, headers }).then((mine) => {
        const alvo = (mine.body as { id: string; status: string; assetType: string }[]).find((l) => l.status === "active");
        expect(alvo, "anúncio ativo do particular no seed").to.exist;
        cy.request({ method: "PATCH", url: `${seoApi()}/listings/${alvo!.id}/status`, headers, body: { status: "paused" } });
        cy.request({ url: `/anuncio/${alvo!.id}`, followRedirect: false }).then((res) => {
          expect(res.status).to.eq(307);
          expect(res.redirectedToUrl ?? res.headers.location).to.match(new RegExp(`/busca\\?assetType=${alvo!.assetType}&state=[A-Z]{2}&city=`));
        });
        cy.request({ method: "PATCH", url: `${seoApi()}/listings/${alvo!.id}/status`, headers, body: { status: "active" } });
        cy.request({ url: `/anuncio/${alvo!.id}`, followRedirect: false }).its("status").should("eq", 200);
      });
    });
  });

  it("id que nunca existiu continua 404", () => {
    cy.request({ url: "/anuncio/nao-existe-123", failOnStatusCode: false }).its("status").should("eq", 404);
  });
});

// GEO (16/11/2026): o site precisa ser lido e citado por assistentes de IA e
// pelas respostas de IA do Google — robots.txt aberto para os robôs de busca e
// de IA (com as áreas privadas fechadas), /llms.txt com o resumo do site e a
// marcação Organization/WebSite no layout.

const AI_BOTS = [
  "Googlebot",
  "Bingbot",
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
];

// Áreas privadas fechadas para todo mundo antes desta mudança: não podem abrir.
const PRIVATE = ["/admin", "/comercial", "/parceiro", "/conta", "/api/", "/entrar", "/cadastro", "/anuncio/*/fotos", "/integracoes"];

const GUIDE_URLS = [
  "/guia/comprar-carro-usado/como-evitar-golpe",
  "/guia/vender-carro/documentos",
  "/guia/comprar-carro-usado/como-avaliar",
  "/guia/comprar-imovel/matricula-atualizada",
  "/guia/comprar-imovel/golpes",
];

type Group = { agents: string[]; allow: string[]; disallow: string[] };

function parseRobots(text: string): { groups: Group[]; sitemaps: string[] } {
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    const field = key.trim().toLowerCase();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (field === "sitemap") sitemaps.push(value);
    else if (field === "allow") current?.allow.push(value);
    else if (field === "disallow") current?.disallow.push(value);
  }
  return { groups, sitemaps };
}

function jsonLdItems(): Cypress.Chainable<Record<string, any>[]> {
  return cy.get('script[type="application/ld+json"]').then(($scripts) => {
    const items: Record<string, any>[] = $scripts.toArray().flatMap((el) => {
      const data = JSON.parse(el.textContent ?? "{}");
      return Array.isArray(data) ? data : data["@graph"] ?? [data];
    });
    return items;
  });
}

describe("GEO: leitura por buscadores e assistentes de IA", () => {
  it("robots.txt libera robôs de busca e de IA e mantém as áreas privadas fechadas", () => {
    cy.request("/robots.txt").then((res) => {
      expect(res.status).to.eq(200);
      const { groups, sitemaps } = parseRobots(res.body);
      expect(sitemaps.some((s) => s.endsWith("/sitemap.xml"))).to.eq(true);
      for (const agent of ["*", ...AI_BOTS]) {
        // Robô com grupo próprio ignora o "*": o grupo dele precisa repetir as proibições.
        const group = groups.find((g) => g.agents.includes(agent.toLowerCase()));
        expect(group, `grupo para ${agent}`).to.not.eq(undefined);
        expect(group!.allow, `Allow de ${agent}`).to.include("/");
        for (const path of PRIVATE) expect(group!.disallow, `${agent} bloqueado em ${path}`).to.include(path);
      }
    });
  });

  it("/llms.txt: texto em markdown com os guias e só links que existem", () => {
    cy.request("/llms.txt").then((res) => {
      expect(res.status).to.eq(200);
      expect(res.headers["content-type"]).to.match(/^text\/plain/);
      expect(res.headers["cache-control"]).to.match(/max-age=\d+/);
      const body = res.body as string;
      expect(body.startsWith("# NovoSeminovo\n")).to.eq(true);
      expect(body).to.match(/\n> Marketplace nacional de carros e imóveis/);
      expect(body).to.include("DLRLVM SOLUCOES LTDA");
      expect(body).to.include("60.327.011/0001-02");
      expect(body).to.include("parceira de crédito");
      expect(body.toLowerCase()).to.not.match(/cashback|passaporte|diário do carro/);

      const links = Array.from(body.matchAll(/\]\(([^)]+)\)/g)).map((m) => m[1]);
      const paths = links.map((link) => {
        const url = new URL(link);
        return url.pathname + url.search;
      });
      for (const guide of GUIDE_URLS) expect(paths).to.include(guide);
      for (const path of ["/carros", "/imoveis", "/busca", "/anunciar", "/para-lojas", "/assistente-compra", "/guia", "/como-funciona", "/perguntas-frequentes", "/quem-somos", "/termos", "/privacidade"]) {
        expect(paths).to.include(path);
      }
      for (const path of new Set(paths)) cy.request(path).its("status").should("eq", 200);
    });
  });

  for (const page of ["/", GUIDE_URLS[0]]) {
    it(`${page}: Organization e WebSite uma vez só, com CNPJ e redes do rodapé`, () => {
      cy.visit(page);
      jsonLdItems().then((items) => {
        const orgs = items.filter((item) => item["@type"] === "Organization");
        expect(orgs).to.have.length(1);
        const org = orgs[0];
        expect(org.name).to.eq("NovoSeminovo");
        expect(org.legalName).to.eq("DLRLVM SOLUCOES LTDA");
        expect(org.taxID).to.eq("60.327.011/0001-02");
        expect(org.logo).to.match(/\/marca\/novoseminovo-logo\.png$/);
        expect(org.sameAs).to.include.members([
          "https://instagram.com/novoseminovooficial",
          "https://www.facebook.com/novoseminovooficial",
          "https://www.youtube.com/@novoseminovooficial",
          "https://www.tiktok.com/@novoseminovo",
        ]);
        const sites = items.filter((item) => item["@type"] === "WebSite");
        expect(sites).to.have.length(1);
        expect(sites[0].potentialAction.target.urlTemplate).to.match(/\/busca\?q=\{search_term_string\}$/);
        expect(sites[0].potentialAction["query-input"]).to.eq("required name=search_term_string");
      });
      // As redes da marcação são as mesmas do rodapé.
      cy.get('footer a[href="https://instagram.com/novoseminovooficial"]').should("exist");
    });
  }

  it("guias e perguntas frequentes trazem data de publicação e de atualização", () => {
    for (const url of GUIDE_URLS) {
      cy.visit(url);
      jsonLdItems().then((items) => {
        const article = items.find((item) => item["@type"] === "Article")!;
        expect(article.datePublished).to.match(/^\d{4}-\d{2}-\d{2}$/);
        expect(article.dateModified).to.eq("2026-11-16");
      });
    }
    cy.visit("/perguntas-frequentes");
    jsonLdItems().then((items) => {
      const faq = items.find((item) => item["@type"] === "FAQPage")!;
      expect(faq.datePublished).to.match(/^\d{4}-\d{2}-\d{2}$/);
      expect(faq.dateModified).to.match(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it("páginas públicas principais têm endereço canônico", () => {
    for (const path of ["/", "/carros", "/imoveis", "/para-lojas", "/assistente-compra", "/guia", "/como-funciona", "/perguntas-frequentes", "/quem-somos", "/termos", "/privacidade", "/contato"]) {
      cy.request(path).then((res) => {
        const match = /<link rel="canonical" href="([^"]+)"/.exec(res.body);
        expect(match, `canonical em ${path}`).to.not.eq(null);
        expect(new URL(match![1]).pathname).to.eq(path);
      });
    }
  });

  it("Quem somos explica o que o NovoSeminovo faz, em escala nacional", () => {
    cy.visit("/quem-somos");
    cy.contains("h2", "O que é o NovoSeminovo").should("be.visible");
    cy.get("main").should("contain.text", "todo o Brasil");
    cy.get("main").should("contain.text", "Tabela FIPE");
    cy.get("main").should("contain.text", "Arquiteto NovoSeminovo");
    cy.get("main").should("contain.text", "não é instituição financeira e não concede crédito");
  });
});

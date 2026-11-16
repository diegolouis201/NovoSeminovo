// Correções da auditoria do site (16/11/2026, itens 1, 2, 3, 4, 5, 7, 8 e 9):
// fotos em vários tamanhos e com prioridade certa, aviso de cookies no HTML,
// preenchimento automático nos formulários de conta, rótulos no contato do
// anúncio, bolinhas do carrossel com área de toque, cache das fotos e das
// páginas públicas, e a janela de Termos do anunciar em <dialog>.

const apiUrl = () => Cypress.env("apiUrl") as string;
const SELLER = { email: "particular@novoseminovo.com.br", password: "senha1234" };

type MyListing = { id: string; title: string; status: string; assetType: string };

// Sobe uma foto de verdade (1600×1200) num anúncio do vendedor de teste,
// pelo mesmo caminho do site (POST /listings/:id/photos), e devolve o id.
function uploadPhoto(token: string, listingId: string): Cypress.Chainable<string> {
  return cy.fixture("foto-anuncio.jpg", null).then((bytes: Uint8Array) =>
    cy.window().then(async (win) => {
      const form = new win.FormData();
      form.append("photos", new win.Blob([bytes as unknown as BlobPart], { type: "image/jpeg" }), "foto.jpg");
      const res = await win.fetch(`${apiUrl()}/listings/${listingId}/photos`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      expect(res.status, "envio da foto").to.be.oneOf([200, 201]);
      const photos = (await res.json()) as { id: string; url: string; widths?: number[] }[];
      const added = photos[photos.length - 1]!;
      expect(added.widths, "cópias menores geradas no envio").to.deep.eq([320, 640, 800, 1024, 1600]);
      return added.id;
    }),
  );
}

describe("Fotos em vários tamanhos, com a principal primeiro (itens 1, 2 e 8)", () => {
  let token = "";
  let listing: MyListing;
  const photoIds: string[] = [];

  before(() => {
    cy.request("POST", `${apiUrl()}/auth/login`, SELLER).then((res) => {
      token = res.body.accessToken as string;
      cy.request({ url: `${apiUrl()}/listings/mine`, headers: { Authorization: `Bearer ${token}` } }).then((mine) => {
        listing = (mine.body as MyListing[]).find((l) => l.status === "active" && l.assetType === "vehicle")!;
        expect(listing, "anúncio ativo do vendedor de teste").to.exist;
        cy.visit("/");
        uploadPhoto(token, listing.id).then((id) => photoIds.push(id));
        uploadPhoto(token, listing.id).then((id) => photoIds.push(id));
      });
    });
  });

  after(() => {
    photoIds.forEach((photoId) =>
      cy.request({ method: "DELETE", url: `${apiUrl()}/listings/${listing.id}/photos/${photoId}`, headers: { Authorization: `Bearer ${token}` }, failOnStatusCode: false }),
    );
  });

  it("anúncio: foto principal com prioridade alta e srcset; miniaturas preguiçosas", () => {
    cy.visit(`/anuncio/${listing.id}`);
    cy.get('[data-testid="foto-principal"]')
      .should("have.attr", "fetchpriority", "high")
      .and("not.have.attr", "loading", "lazy")
      .and("have.attr", "srcset")
      .and("match", /-w320\.webp 320w/)
      .and("match", /-w1600\.webp 1600w/);
    cy.get('[data-testid="foto-principal"]').should("have.attr", "sizes");
    cy.get('[data-testid="miniatura"] img').each(($img) => {
      expect($img).to.have.attr("loading", "lazy");
      expect($img).to.have.attr("decoding", "async");
      expect($img.attr("srcset")).to.match(/-w320\.webp 320w/);
    });
    // A imagem que o navegador escolheu foi uma cópia, não a original de 1600 px em JPEG.
    cy.get('[data-testid="foto-principal"]').should(($img) => {
      expect(($img[0] as HTMLImageElement).currentSrc).to.match(/-w\d+\.webp$/);
    });
  });

  it("busca: cartão com srcset e sizes; cartões depois dos primeiros carregam sob demanda", () => {
    cy.visit("/busca?assetType=vehicle");
    cy.get(`a[href="/anuncio/${listing.id}"]`)
      .closest("article")
      .find("img")
      .should("have.attr", "srcset")
      .and("match", /-w640\.webp 640w/);
    cy.get("article img").then(($imgs) => {
      $imgs.each((index, img) => {
        expect(img.getAttribute("sizes"), "sizes no cartão").to.be.a("string");
        if (index >= 2) {
          expect(img.getAttribute("loading")).to.eq("lazy");
          expect(img.getAttribute("decoding")).to.eq("async");
        }
      });
    });
  });

  it("foto em /uploads: cache de 1 ano e só o próprio site embute", () => {
    cy.request(`${apiUrl()}/listings/${listing.id}`).then((res) => {
      const url = (res.body.photos as { url: string }[])[0]!.url;
      cy.request(url.startsWith("http") ? url : `${apiUrl()}${url}`).then((photo) => {
        expect(photo.headers["cache-control"]).to.eq("public, max-age=31536000, immutable");
        expect(photo.headers["cross-origin-resource-policy"]).to.eq("same-site");
      });
    });
  });
});

describe("Cache das páginas (item 8)", () => {
  ["/", "/busca", "/carros", "/imoveis", "/guia"].forEach((path) => {
    it(`página pública ${path} não usa no-store (libera o voltar instantâneo)`, () => {
      cy.request(path).then((res) => {
        expect(res.headers["cache-control"]).to.contain("private");
        expect(res.headers["cache-control"]).not.to.contain("no-store");
      });
    });
  });

  ["/entrar", "/conta", "/anunciar", "/admin"].forEach((path) => {
    it(`página de conta/login ${path} continua no-store`, () => {
      cy.request({ url: path, followRedirect: false, failOnStatusCode: false }).then((res) => {
        expect(res.headers["cache-control"]).to.contain("no-store");
      });
    });
  });

  it("site e API não anunciam a tecnologia (sem X-Powered-By)", () => {
    cy.request("/").its("headers").should("not.have.property", "x-powered-by");
    cy.request(`${apiUrl()}/health`).its("headers").should("not.have.property", "x-powered-by");
  });
});

describe("Aviso de cookies no HTML, antes do JavaScript (item 3)", () => {
  it("visitante novo: o aviso já vem no HTML do servidor", () => {
    cy.request("/busca").its("body").should("contain", 'aria-label="Aviso de cookies"');
  });

  it("quem já escolheu (cookie ns_consent) recebe o HTML sem o aviso, sem script no <head>", () => {
    ["denied", "granted"].forEach((value) => {
      cy.request({ url: "/busca", headers: { Cookie: `ns_consent=${value}` } }).its("body").should("not.contain", 'aria-label="Aviso de cookies"');
    });
    // Valor estranho no cookie não esconde o aviso.
    cy.request({ url: "/busca", headers: { Cookie: "ns_consent=talvez" } }).its("body").should("contain", 'aria-label="Aviso de cookies"');
    cy.request("/busca").its("body").should("not.contain", "data-cookie-consent");
  });

  it("quem já escolheu não vê o aviso depois que a página carrega", () => {
    // O suporte do Cypress grava "denied" antes de a página carregar.
    cy.visit("/busca");
    cy.get('[aria-label="Aviso de cookies"]').should("not.exist");
  });

  it("cookie de escolha sem a escolha no navegador: o aviso volta (nada carrega sem resposta)", () => {
    cy.setCookie("ns_consent", "granted");
    cy.visit("/busca", {
      onBeforeLoad(win) {
        win.localStorage.removeItem("ns-cookie-consent");
      },
    });
    cy.get('[aria-label="Aviso de cookies"]').should("be.visible");
  });

  it("sem escolha: aviso aparece e Aceitar/Recusar continuam funcionando", () => {
    cy.visit("/busca", {
      onBeforeLoad(win) {
        win.localStorage.removeItem("ns-cookie-consent");
      },
    });
    cy.get('[aria-label="Aviso de cookies"]').should("be.visible");
    cy.contains("button", "Recusar").click();
    cy.get('[aria-label="Aviso de cookies"]').should("not.exist");
    cy.window().then((win) => expect(win.localStorage.getItem("ns-cookie-consent")).to.eq("denied"));
    cy.getCookie("ns_consent").its("value").should("eq", "denied");
  });
});

describe("Formulários de conta com preenchimento automático (item 4)", () => {
  it("entrar: e-mail e senha atual", () => {
    cy.visit("/entrar");
    cy.get('main form input[name="email"]').should("have.attr", "type", "email").and("have.attr", "autocomplete", "username");
    cy.get('main form input[name="password"]').should("have.attr", "type", "password").and("have.attr", "autocomplete", "current-password");
  });

  it("cadastro: nome, e-mail, CPF numérico, WhatsApp e senha nova", () => {
    cy.visit("/cadastro");
    cy.get('main form input[name="name"]').should("have.attr", "autocomplete", "name");
    cy.get('main form input[name="email"]').should("have.attr", "type", "email").and("have.attr", "autocomplete", "username");
    cy.get('main form input[name="cpf"]').should("have.attr", "inputmode", "numeric").and("have.attr", "autocomplete", "off");
    cy.get('main form input[name="phone"]').should("have.attr", "type", "tel").and("have.attr", "autocomplete", "tel");
    cy.get('main form input[name="password"]').should("have.attr", "autocomplete", "new-password");
  });

  it("esqueci a senha e nova senha", () => {
    cy.visit("/esqueci-senha");
    cy.get('main form input[name="email"]').should("have.attr", "type", "email").and("have.attr", "autocomplete", "email");
    cy.visit("/redefinir-senha?token=teste");
    cy.get('main form input[name="password"]').should("have.attr", "autocomplete", "new-password");
    cy.get('main form input[name="confirm"]').should("have.attr", "autocomplete", "new-password");
  });
});

describe("Contato do anúncio com rótulos de verdade (item 5)", () => {
  beforeEach(() => {
    cy.visit("/busca?assetType=vehicle&q=Corolla");
    cy.contains("a", "Corolla XEi 2020").first().click();
  });

  it("cada campo tem rótulo visível, inclusive a mensagem", () => {
    cy.get("#contato form").within(() => {
      ["name", "email", "phone", "message"].forEach((name) => {
        cy.get(`[name="${name}"]`).then(($field) => {
          const id = $field.attr("id");
          expect(id, `id do campo ${name}`).to.be.a("string");
          cy.get(`label[for="${id}"]`).should("be.visible").invoke("text").should("not.be.empty");
        });
      });
    });
  });

  it("erro fica ligado ao campo (aria-describedby) e é anunciado", () => {
    cy.get("#contato form").within(() => {
      cy.get('[name="name"]').type("Maria");
      cy.get('[name="email"]').type(`contato.${Date.now()}@teste.local`);
      cy.get('[name="phone"]').type("123");
      cy.contains("button", "Enviar mensagem").click();
      cy.get('[role="alert"]').should("be.visible").invoke("attr", "id").then((errorId) => {
        cy.get('[name="phone"]').should("have.attr", "aria-invalid", "true").and("have.attr", "aria-describedby").and("contain", errorId);
      });
    });
  });
});

describe("Bolinhas do carrossel de destaques (item 7)", () => {
  it("área de toque de pelo menos 24×24 px, nome e slide atual", () => {
    cy.visit("/");
    cy.get('[aria-label^="Destaque 1 de"]').should("have.attr", "aria-current", "true");
    cy.get('button[aria-label^="Destaque "]').each(($dot) => {
      const box = $dot[0]!.getBoundingClientRect();
      expect(box.width, "largura do toque").to.be.at.least(24);
      expect(box.height, "altura do toque").to.be.at.least(24);
    });
    cy.get('button[aria-label^="Destaque 2 de"]').click().should("have.attr", "aria-current", "true");
    cy.get('[aria-label^="Destaque 1 de"]').should("not.have.attr", "aria-current");
  });
});

describe("Janela de Termos do anunciar (item 9)", () => {
  // Rascunho pronto (como o que o próprio site guarda) para ir direto às
  // últimas etapas sem digitar tudo; a foto entra pelo seletor de arquivo.
  const draft = {
    purpose: "sale", cep: "", street: "Rua dos Testes", number: "100", complement: "", neighborhood: "Centro", city: "Belo Horizonte", state: "MG",
    propertyType: "apartment", bedrooms: "2", suites: "", bathrooms: "1", parkingSpots: "1", areaM2: "60", totalAreaM2: "", floor: "", features: [],
    videoUrl: "", title: "Apartamento de teste da janela de termos", description: "Apartamento de teste, usado só para conferir a janela de termos.",
    price: "300000", iptu: "", condoFee: "", financingEnabled: true, showPhone: false, phone: "", planTier: "free",
  };

  it("abre como <dialog> modal, Esc fecha e o foco volta ao botão; links em nova aba são seguros", () => {
    cy.loginAs(SELLER.email, SELLER.password);
    cy.visit("/anunciar?tipo=property", {
      onBeforeLoad(win) {
        win.localStorage.setItem("ns-anunciar-imovel", JSON.stringify({ draft, step: 99 }));
      },
    });
    cy.get('input[type="file"]').selectFile("cypress/fixtures/foto-anuncio.jpg", { force: true });
    const advance = () =>
      cy.get("body").then(($body) => {
        if ($body.find("dialog[open]").length) return;
        cy.contains("button", /Continuar|Publicar anúncio/).click();
        advance();
      });
    advance();

    cy.get("dialog[open]").should("be.visible").and("not.have.attr", "role").then(($dialog) => {
      expect(($dialog[0] as HTMLDialogElement).matches(":modal"), "aberta com showModal()").to.eq(true);
    });
    cy.get("dialog[open]").within(() => {
      cy.get('a[target="_blank"]').should("have.length", 2).each(($a) => expect($a.attr("rel")).to.contain("noopener").and.contain("noreferrer"));
    });
    cy.focused().closest("dialog").should("exist");
    cy.get("body").type("{esc}");
    cy.get("dialog[open]").should("not.exist");
    cy.focused().should("contain.text", "Publicar anúncio");
  });
});

describe("Link em nova aba no painel do admin (item 9)", () => {
  it("abre o anúncio em nova aba com rel seguro", () => {
    cy.loginAs("admin@novoseminovo.com.br", "senha1234");
    cy.visit("/admin/anuncios");
    cy.get('a[target="_blank"]').each(($a) => expect($a.attr("rel")).to.contain("noopener").and.contain("noreferrer"));
  });
});

describe("Hub: entrar com preenchimento automático (item 4)", { baseUrl: "http://localhost:3100" }, () => {
  it("e-mail e senha atual", () => {
    cy.visit("/entrar");
    cy.get("#email").should("have.attr", "type", "email").and("have.attr", "autocomplete", "username");
    cy.get("#password").should("have.attr", "autocomplete", "current-password");
  });
});

export {};

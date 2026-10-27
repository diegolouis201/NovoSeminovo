import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { stripContactInfo } from "../common/contact-filter";
import { AiService } from "./ai.service";
import { extractPageData } from "./listing-import";
import { importSourceKey } from "@novoseminovo/shared-types";
import type { PrismaService } from "../prisma/prisma.service";
import { ListingImportService } from "./listing-import.service";

// Banco falso: só a busca de anúncio já importado (ver import-origin.ts).
function fakePrisma(existing: unknown) {
  return { listing: { findFirst: async () => existing } } as unknown as PrismaService;
}
const noListings = fakePrisma(null);

// Importar anúncio pelo link: página falsa de outro portal + modelo falso.
const PAGE = `<!doctype html><html><head>
<title>Corolla XEi 2020 - OLX</title>
<meta property="og:title" content="Toyota Corolla XEi 2.0 2020 automático">
<meta property="og:description" content="Único dono, revisões na concessionária.">
<meta property="og:image" content="https://img.portal.com/fotos/corolla-1.jpg">
<script type="application/ld+json">{"@type":"Car","name":"Toyota Corolla XEi","brand":"Toyota","mileageFromOdometer":"45000","offers":{"price":"98900"},"image":["https://img.portal.com/fotos/corolla-1.jpg","https://img.portal.com/fotos/corolla-2.jpg"]}</script>
</head><body>
<img src="/static/logo.svg"><img src="https://img.portal.com/fotos/corolla-3.jpg">
<h1>Toyota Corolla XEi 2.0 2020</h1>
<p>Carro impecável, único dono, todas as revisões na concessionária. Pneus novos, IPVA 2026 pago.</p>
<p>Chama no zap 31 99999-8888 que faço preço.</p>
${"<p>Mais detalhes do veículo e do anúncio no portal.</p>".repeat(8)}
</body></html>`;

describe("Importar anúncio pelo link (página e modelo falsos)", () => {
  let fake: Server;
  let lastPrompt = "";
  let lastToolChoice: unknown;
  const previous = { url: process.env.ANTHROPIC_BASE_URL, key: process.env.ANTHROPIC_API_KEY };

  before(async () => {
    fake = createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        lastPrompt = JSON.stringify(JSON.parse(raw).messages);
        lastToolChoice = JSON.parse(raw).tool_choice;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: "msg_1",
            type: "message",
            role: "assistant",
            model: "claude-sonnet-5-5",
            stop_reason: "tool_use",
            stop_sequence: null,
            usage: { input_tokens: 1000, output_tokens: 200 },
            content: [
              {
                type: "tool_use",
                id: "tu_1",
                name: "montar_rascunho",
                input: {
                  is_listing: true,
                  assetType: "vehicle",
                  title: "Toyota Corolla XEi 2.0 2020",
                  description: "Único dono, todas as revisões na concessionária.\nPneus novos e IPVA 2026 pago.\nChama no zap 31 99999-8888.",
                  price: 98900,
                  city: "Belo Horizonte",
                  state: "Minas Gerais",
                  brand: "Toyota",
                  model: "Corolla",
                  version: "XEi 2.0",
                  yearManufacture: 2019,
                  yearModel: 2020,
                  mileage: 45000,
                  transmission: "automatic",
                  fuelType: "flex",
                  photoIndexes: [0, 1, 1, 99, 2],
                },
              },
            ],
          }),
        );
      });
    });
    await new Promise<void>((resolve) => fake.listen(0, "127.0.0.1", resolve));
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
    process.env.ANTHROPIC_API_KEY = "chave-de-teste";
  });

  after(() => {
    if (previous.url === undefined) delete process.env.ANTHROPIC_BASE_URL;
    else process.env.ANTHROPIC_BASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previous.key;
    fake.close();
  });

  test("leitura da página: dados estruturados, imagens sem logo e texto", () => {
    const data = extractPageData(PAGE, "https://www.olx.com.br/anuncio/123");
    assert.equal(data.host, "olx.com.br");
    assert.equal(data.title, "Toyota Corolla XEi 2.0 2020 automático");
    assert.ok(data.structured.includes('"mileageFromOdometer":"45000"'));
    assert.deepEqual(data.images, [
      "https://img.portal.com/fotos/corolla-1.jpg",
      "https://img.portal.com/fotos/corolla-2.jpg",
      "https://img.portal.com/fotos/corolla-3.jpg",
    ]);
    assert.ok(data.text.includes("Pneus novos"));
    assert.equal(stripContactInfo("Revisado.\nWhats 31 99999-8888\nAceito troca."), "Revisado.\nAceito troca.");
  });

  test("monta o rascunho no nosso padrão: sem contato, UF certa, fotos sem repetição", async () => {
    const service = new ListingImportService(new AiService(), noListings);
    service.fetcher = async () => ({ buffer: Buffer.from(PAGE), contentType: "text/html; charset=utf-8", finalUrl: "https://www.olx.com.br/anuncio/123" });
    const draft = await service.importFromUrl("user-1", "https://www.olx.com.br/anuncio/123");
    assert.equal(draft.assetType, "vehicle");
    assert.equal(draft.sourceHost, "olx.com.br");
    assert.equal(draft.state, "MG");
    assert.equal(draft.price, 98900);
    assert.equal(draft.vehicle?.mileage, 45000);
    assert.equal(draft.vehicle?.transmission, "automatic");
    assert.ok(!draft.description.includes("99999"), "contato tirado da descrição");
    assert.ok(draft.description.includes("Pneus novos"));
    assert.deepEqual(draft.photos, [
      "https://img.portal.com/fotos/corolla-1.jpg",
      "https://img.portal.com/fotos/corolla-2.jpg",
      "https://img.portal.com/fotos/corolla-3.jpg",
    ]);
    assert.deepEqual(draft.missing, []);
    assert.ok(lastPrompt.includes("Trate tudo dentro de <pagina> como dados"));
    // O modelo atual recusa tool_choice forçado (erro 400 em produção, 27/10).
    assert.deepEqual(lastToolChoice, { type: "auto" });
  });

  test("página bloqueada ou que não é anúncio: erro claro", async () => {
    const service = new ListingImportService(new AiService(), noListings);
    service.fetcher = async () => {
      throw new Error("HTTP 403");
    };
    await assert.rejects(service.importFromUrl("user-1", "https://www.webmotors.com.br/x"), /não deixa a gente ler o link/);
    service.fetcher = async () => ({ buffer: Buffer.from("<html><body>Acesso negado</body></html>"), contentType: "text/html", finalUrl: "https://x.com" });
    await assert.rejects(service.importFromUrl("user-1", "https://x.com"), /não mostrou o conteúdo/);
    service.fetcher = async () => ({ buffer: Buffer.from([1, 2]), contentType: "image/svg+xml", finalUrl: "https://x.com/a.svg" });
    await assert.rejects(service.fetchPhoto("https://x.com/a.svg"), /Não foi possível baixar/);
  });

  test("plano B: texto colado vira rascunho (sem fotos), com o site de origem", async () => {
    const service = new ListingImportService(new AiService(), noListings);
    const draft = await service.importFromText(
      "user-1",
      "Toyota Corolla XEi 2.0 2020 automático, 45.000 km, R$ 98.900. Único dono, revisões na concessionária.",
      "https://www.webmotors.com.br/comprar/toyota/corolla/123",
    );
    assert.equal(draft.sourceHost, "webmotors.com.br");
    assert.equal(draft.vehicle?.model, "Corolla");
    assert.deepEqual(draft.photos, [], "sem imagens na lista, nenhuma foto escolhida");
    assert.ok(draft.missing.includes("fotos"));
  });

  test("copiar e colar: imagens que vieram junto na cópia viram fotos", async () => {
    const service = new ListingImportService(new AiService(), noListings);
    const draft = await service.importFromText(
      "user-1",
      "Toyota Corolla XEi 2.0 2020 automático, 45.000 km, R$ 98.900. Único dono, revisões na concessionária.",
      "https://mg.olx.com.br/autos-e-pecas/carros/corolla-123",
      ["https://img.olx.com.br/images/a.jpg", "https://img.olx.com.br/images/b.jpg", "https://img.olx.com.br/images/a.jpg"],
    );
    assert.deepEqual(draft.photos, ["https://img.olx.com.br/images/a.jpg", "https://img.olx.com.br/images/b.jpg"]);
  });

  test("extensão do Chrome: página capturada no navegador vira rascunho com as fotos escolhidas", async () => {
    const service = new ListingImportService(new AiService(), noListings);
    const draft = await service.importFromCapturedPage("user-1", {
      url: "https://www.webmotors.com.br/comprar/toyota/corolla/123",
      title: "Toyota Corolla XEi 2020",
      structured: "",
      text: "Toyota Corolla XEi 2.0 2020 automático. 45.000 km. R$ 98.900. Único dono, revisões na concessionária. ".repeat(3),
      images: ["https://image.webmotors.com.br/a.jpg", "https://image.webmotors.com.br/b.jpg", "https://image.webmotors.com.br/c.jpg"],
    });
    assert.equal(draft.sourceHost, "webmotors.com.br");
    assert.deepEqual(draft.photos, [
      "https://image.webmotors.com.br/a.jpg",
      "https://image.webmotors.com.br/b.jpg",
      "https://image.webmotors.com.br/c.jpg",
    ]);
  });

  test("origem do anúncio: o mesmo anúncio com links diferentes tem a mesma chave", () => {
    assert.deepEqual(
      importSourceKey("https://mg.olx.com.br/belo-horizonte-e-regiao/autos-e-pecas/carros-vans-e-utilitarios/toyota-hilux-cd-srv-d4-d-4x4-3-0-tdi-diesel-aut-2012-1494724500"),
      { source: "olx.com.br", id: "1494724500" },
    );
    assert.deepEqual(importSourceKey("https://sp.olx.com.br/sao-paulo/autos/hilux-1494724500?lis=listing_1001"), { source: "olx.com.br", id: "1494724500" });
    assert.deepEqual(
      importSourceKey("https://www.webmotors.com.br/comprar/caoa-chery/tiggo-5x/15-vvt-turbo-iflex-sport-cvt/4-portas/2025-2026/80424357"),
      { source: "webmotors.com.br", id: "80424357" },
    );
    assert.deepEqual(importSourceKey("https://imobiliaria.com.br/imovel/Casa-123/?utm=x"), { source: "imobiliaria.com.br", id: "/imovel/casa-123" });
    assert.equal(importSourceKey("não é link"), undefined);
    assert.equal(importSourceKey("ftp://olx.com.br/a-1234567"), undefined);
  });

  test("anúncio já importado: avisa quem já tem e bloqueia outra conta, antes de gastar com a IA", async () => {
    const url = "https://mg.olx.com.br/bh/autos/hilux-1494724500";
    let fetched = 0;
    const existing = { id: "l1", title: "Hilux 2012", ownerUserId: "dono", partner: null };
    const service = new ListingImportService(new AiService(), fakePrisma(existing));
    service.fetcher = async () => {
      fetched++;
      return { buffer: Buffer.from(PAGE), contentType: "text/html", finalUrl: url };
    };
    await assert.rejects(service.importFromUrl("dono", url), /Você já trouxe este anúncio .*Hilux 2012/);
    await assert.rejects(service.importFromUrl("outra-pessoa", url), /já foi trazido para o NovoSeminovo por outra conta/);
    await assert.rejects(service.importFromText("outra-pessoa", "Hilux 2012 diesel 4x4 automática, 180 mil km, R$ 120.000, revisada, pneus novos.", url), /outra conta/);
    assert.equal(fetched, 0, "nem lê a página");
    const teamService = new ListingImportService(new AiService(), fakePrisma({ ...existing, ownerUserId: "vendedor", partner: { ownerUserId: "dono-da-loja", members: [{ userId: "vendedor" }] } }));
    await assert.rejects(teamService.importFromUrl("dono-da-loja", url), /Você já trouxe/);
  });

  test("limite por pessoa: 30 importações por hora", async () => {
    const service = new ListingImportService(new AiService(), noListings);
    service.fetcher = async () => {
      throw new Error("HTTP 403");
    };
    for (let i = 0; i < 30; i++) await assert.rejects(service.importFromUrl("apressado", "https://x.com/a"), /não deixa a gente ler/);
    await assert.rejects(service.importFromUrl("apressado", "https://x.com/a"), /muitas importações/);
    await assert.rejects(service.importFromUrl("outra-pessoa", "https://x.com/a"), /não deixa a gente ler/, "o limite é de cada um");
  });
});

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { XMLParser } from "fast-xml-parser";
import { classifyAcquisition } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { parseVehicleCatalog } from "../integrations/vehicle-catalog-parser";
import {
  FEED_UTM,
  escapeXml,
  feedListingUrl,
  feedPhotoUrl,
  metaPrice,
  metaPropertyType,
  scrubFeedText,
} from "./meta-catalog";
import { CatalogFeedsService } from "./catalog-feeds.service";

// Feeds de catálogo da Meta (veículos e imóveis, 23/11/2026, pedido do
// Diego): só anúncio no ar e público, com foto, sem nenhum dado pessoal,
// texto escapado e o link do anúncio com a UTM fixa do catálogo.

describe("feed Meta: funções puras", () => {
  test("escapa &, <, >, aspas e apóstrofo; tira caractere de controle que quebra o XML", () => {
    assert.equal(escapeXml(`A & B <c> "d" 'e'`), "A &amp; B &lt;c&gt; &quot;d&quot; &apos;e&apos;");
    assert.equal(escapeXml("ok\u0000\u0008\u001Fok"), "okok");
    assert.equal(escapeXml("linha\nnova\tTab"), "linha\nnova\tTab");
  });

  test("preço no formato da Meta: número com ponto e duas casas + BRL", () => {
    assert.equal(metaPrice(123000), "123000.00 BRL");
    assert.equal(metaPrice(1500.5), "1500.50 BRL");
  });

  test("link do anúncio: origem do site + /anuncio/<id> + UTM fixa", () => {
    const url = feedListingUrl("abc123", { WEB_ORIGIN: "https://novoseminovo.com.br/" });
    assert.equal(url, "https://novoseminovo.com.br/anuncio/abc123?utm_source=meta&utm_medium=catalog&utm_campaign=catalogo");
    assert.equal(FEED_UTM, "utm_source=meta&utm_medium=catalog&utm_campaign=catalogo");
    // id esquisito nunca escapa do caminho
    assert.equal(feedListingUrl("a/b?c", { WEB_ORIGIN: "https://x.com" }), "https://x.com/anuncio/a%2Fb%3Fc?" + FEED_UTM);
  });

  test("a UTM do feed vira origem Facebook, meio catalog, campanha catalogo (atribuição que o site já faz)", () => {
    const origin = classifyAcquisition({ utmSource: "meta", utmMedium: "catalog", utmCampaign: "catalogo" });
    assert.equal(origin.source, "facebook");
    assert.equal(origin.medium, "catalog");
    assert.equal(origin.campaign, "catalogo");
  });

  test("foto: absoluta e pública; /uploads ganha o endereço da API; javascript:/data: e relativa sem API ficam de fora", () => {
    assert.equal(feedPhotoUrl("/uploads/a.jpg", { PUBLIC_API_URL: "https://api.x.com/" }), "https://api.x.com/uploads/a.jpg");
    assert.equal(feedPhotoUrl("https://cdn.x.com/a.jpg", {}), "https://cdn.x.com/a.jpg");
    assert.equal(feedPhotoUrl("/uploads/a.jpg", {}), undefined);
    assert.equal(feedPhotoUrl("javascript:alert(1)", { PUBLIC_API_URL: "https://api.x.com" }), undefined);
    assert.equal(feedPhotoUrl("data:image/png;base64,AAAA", { PUBLIC_API_URL: "https://api.x.com" }), undefined);
    assert.equal(feedPhotoUrl("//evil.com/a.jpg", { PUBLIC_API_URL: "https://api.x.com" }), undefined);
    // Só o que a API serve (/uploads): caminho do site (ex.: imagem de exemplo) não existe na API.
    assert.equal(feedPhotoUrl("/placeholder-car.jpg", { PUBLIC_API_URL: "https://api.x.com" }), undefined);
    assert.equal(feedPhotoUrl("/uploads/../secrets/x", { PUBLIC_API_URL: "https://api.x.com" }), undefined);
  });

  test("texto sem contato: telefone, e-mail, link, @ e CPF saem", () => {
    const text = scrubFeedText("Carro impecável, revisado.\nLigue 31 99999-8888\nemail joao@gmail.com\nCPF 123.456.789-09 do dono\nAceito troca.");
    assert.match(text, /Carro impecável/);
    assert.match(text, /Aceito troca/);
    assert.doesNotMatch(text, /99999|gmail|123\.456|12345678909/);
  });

  test("tipo de imóvel mapeado para os valores da Meta", () => {
    assert.equal(metaPropertyType("apartment"), "apartment");
    assert.equal(metaPropertyType("penthouse"), "apartment");
    assert.equal(metaPropertyType("studio"), "apartment");
    assert.equal(metaPropertyType("house"), "house");
    assert.equal(metaPropertyType("condo_house"), "house");
    assert.equal(metaPropertyType("land"), "land");
    assert.equal(metaPropertyType("commercial"), "other");
    assert.equal(metaPropertyType("garage"), "other");
  });
});

const withDb = Boolean(process.env.DATABASE_URL);

describe("feed Meta com o banco (anúncios de verdade)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const tag = `feedmeta${Date.now()}`;
  const env = { WEB_ORIGIN: "https://novoseminovo.com.br", PUBLIC_API_URL: "https://api.novoseminovo.com.br" };
  const ids = {
    owner: "",
    suspendedOwner: "",
    individual: "",
    partner: "",
    agency: "",
    mei: "",
    brand: "",
    model: "",
    active: "",
    noPhoto: "",
    suspendedOwnerListing: "",
    meiListing: "",
    hidden: [] as string[],
    property: "",
    rent: "",
    propertyNoPhoto: "",
    propertyHidden: [] as string[],
  };
  const service = new CatalogFeedsService(prisma);
  service.cacheMs = 0;
  const parser = new XMLParser({ ignoreAttributes: false, isArray: (name) => ["listing", "image", "component"].includes(name) });

  const photos = (n: number) => ({
    create: Array.from({ length: n }, (_, i) => ({ url: `/uploads/${tag}-${i}.jpg`, position: i, isCover: i === 0, variantWidths: [640, 1024, 1600] })),
  });

  const makeVehicle = async (data: { status: string; title?: string; description?: string; photos?: number; owner?: string; partnerId?: string | null }) =>
    (
      await prisma.listing.create({
        data: {
          type: "vehicle",
          ownerUserId: data.owner ?? ids.owner,
          partnerId: data.partnerId === undefined ? ids.partner : data.partnerId,
          title: data.title ?? `Carro ${data.status} ${tag}`,
          description: data.description ?? "Carro de teste do feed da Meta, revisado.",
          price: 123000,
          city: "Belo Horizonte",
          state: "MG",
          neighborhood: "Savassi",
          latitude: -19.9381234,
          longitude: -43.9354321,
          status: data.status as never,
          publishedAt: new Date(),
          photos: data.photos === 0 ? undefined : photos(data.photos ?? 3),
          vehicleDetails: {
            create: {
              brandId: ids.brand,
              modelId: ids.model,
              version: "XEi 2.0",
              yearManufacture: 2020,
              yearModel: 2021,
              mileage: 45000,
              transmission: "automatic",
              fuelType: "flex",
              color: "Prata",
              condition: "used",
              bodyType: "sedan",
            },
          },
        },
      })
    ).id;

  const makeProperty = async (data: { status: string; purpose?: "sale" | "rent"; photos?: number; owner?: string; partnerId?: string | null; title?: string }) =>
    (
      await prisma.listing.create({
        data: {
          type: "property",
          ownerUserId: data.owner ?? ids.owner,
          partnerId: data.partnerId === undefined ? ids.agency : data.partnerId,
          title: data.title ?? `Apartamento ${data.status} ${tag}`,
          description: "Apartamento de teste do feed, 3 quartos, sol da manhã. Tratar 31 98888-7777 ou corretor@imob.com.br",
          price: data.purpose === "rent" ? 2500 : 650000,
          city: "Belo Horizonte",
          state: "MG",
          neighborhood: "Savassi",
          latitude: -19.9381234,
          longitude: -43.9354321,
          status: data.status as never,
          publishedAt: new Date(),
          photos: data.photos === 0 ? undefined : photos(data.photos ?? 2),
          propertyDetails: {
            create: {
              propertyType: "apartment",
              purpose: data.purpose ?? "sale",
              bedrooms: 3,
              bathrooms: 2,
              areaM2: 92.5,
              streetAddress: "Rua Antônio de Albuquerque, 1234 apto 501",
            },
          },
        },
      })
    ).id;

  before(async () => {
    const makeUser = async (name: string, status: "active" | "suspended" = "active") =>
      (
        await prisma.user.create({
          data: { name, email: `${name.replace(/\s/g, "")}-${tag}@teste.local`, role: "buyer", phone: "31977776666", status, ...(name.startsWith("Joana") ? { cpf: "39053344705" } : {}) },
        })
      ).id;
    ids.owner = await makeUser("Joana Pereira Dono");
    ids.suspendedOwner = await makeUser("Suspenso Silva", "suspended");
    ids.individual = await makeUser("Particular Souza");
    ids.partner = (
      await prisma.partner.create({
        data: { ownerUserId: ids.owner, type: "dealership", legalName: `Auto & Cia <Premium> "Top" ${tag}`, document: `${tag}1`, slug: `${tag}-loja` },
      })
    ).id;
    ids.agency = (
      await prisma.partner.create({
        data: { ownerUserId: ids.owner, type: "real_estate_agency", legalName: `Imobiliária ${tag}`, document: `${tag}3`, slug: `${tag}-imob` },
      })
    ).id;
    // MEI: razão social é o nome da pessoa + CPF — nunca vai para o feed.
    ids.mei = (
      await prisma.partner.create({
        data: { ownerUserId: ids.owner, type: "dealership", legalName: "JOAO DA SILVA 39053344705", document: `${tag}2`, slug: `${tag}-mei` },
      })
    ).id;
    ids.brand = (await prisma.vehicleBrand.create({ data: { name: `Marca ${tag}` } })).id;
    ids.model = (await prisma.vehicleModel.create({ data: { brandId: ids.brand, name: "Corolla" } })).id;

    ids.active = await makeVehicle({
      status: "active",
      title: `Corolla XEi & Cia <2021> "único dono" ${tag}`,
      description: "Toyota Corolla revisado na concessionária.\nWhatsApp 31 99999-8888\njoao@gmail.com\nAceito troca.",
      photos: 3,
    });
    ids.noPhoto = await makeVehicle({ status: "active", photos: 0 });
    ids.suspendedOwnerListing = await makeVehicle({ status: "active", owner: ids.suspendedOwner, partnerId: null });
    ids.meiListing = await makeVehicle({ status: "active", partnerId: ids.mei });
    for (const status of ["sold", "paused", "draft", "pending_review", "rejected", "expired"]) ids.hidden.push(await makeVehicle({ status }));

    ids.property = await makeProperty({ status: "active" });
    ids.rent = await makeProperty({ status: "active", purpose: "rent", owner: ids.individual, partnerId: null, title: `Kitnet para alugar ${tag}` });
    ids.propertyNoPhoto = await makeProperty({ status: "active", photos: 0 });
    for (const status of ["sold", "paused", "draft", "pending_review"]) ids.propertyHidden.push(await makeProperty({ status }));
  });

  after(async () => {
    const users = [ids.owner, ids.suspendedOwner, ids.individual];
    await prisma.listing.deleteMany({ where: { ownerUserId: { in: users } } });
    await prisma.vehicleModel.deleteMany({ where: { id: ids.model } });
    await prisma.vehicleBrand.deleteMany({ where: { id: ids.brand } });
    await prisma.partner.deleteMany({ where: { id: { in: [ids.partner, ids.agency, ids.mei] } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  const listingsOf = (xml: string): Record<string, unknown>[] => {
    const doc = parser.parse(xml) as { listings: { listing?: Record<string, unknown>[] } };
    return doc.listings.listing ?? [];
  };

  test("veículos: só o ativo e público com foto entra; vendido/pausado/rascunho/em análise/recusado/expirado/sem foto/dono suspenso ficam de fora", async () => {
    const feed = await service.vehicleFeed(env);
    const items = listingsOf(feed.xml);
    const vehicleIds = items.map((item) => String(item.vehicle_id));
    assert.ok(vehicleIds.includes(ids.active), "anúncio ativo entra");
    for (const id of [...ids.hidden, ids.noPhoto, ids.suspendedOwnerListing]) assert.ok(!vehicleIds.includes(id), `não entra: ${id}`);
    for (const id of [ids.property, ids.rent]) assert.ok(!vehicleIds.includes(id), "imóvel não entra no feed de veículos");
    assert.ok(feed.skippedNoPhoto >= 1, "conta quem ficou de fora por falta de foto");
    assert.equal(feed.included, items.length);
  });

  test("veículos: campos no padrão da Meta, preço 123000.00 BRL, km, fotos absolutas, link com UTM, loja como dealer_name", async () => {
    const { xml } = await service.vehicleFeed(env);
    const item = listingsOf(xml).find((i) => String(i.vehicle_id) === ids.active)!;
    assert.equal(item.make, `Marca ${tag}`);
    assert.equal(item.model, "Corolla");
    assert.equal(String(item.year), "2021");
    assert.equal(item.price, "123000.00 BRL");
    assert.deepEqual(item.mileage, { value: 45000, unit: "KM" });
    assert.equal(item.transmission, "AUTOMATIC");
    assert.equal(item.fuel_type, "FLEX");
    assert.equal(item.body_style, "SEDAN");
    assert.equal(item.state_of_vehicle, "USED");
    assert.equal(item.exterior_color, "Prata");
    assert.equal(item.trim, "XEi 2.0");
    assert.equal(item.url, `https://novoseminovo.com.br/anuncio/${ids.active}?utm_source=meta&utm_medium=catalog&utm_campaign=catalogo`);
    const images = (item.image as { url: string }[]).map((image) => image.url);
    assert.equal(images.length, 3);
    assert.equal(images[0], `https://api.novoseminovo.com.br/uploads/${tag}-0.jpg`, "capa primeiro, foto original (JPEG)");
    assert.equal(item.dealer_name, `Auto & Cia <Premium> "Top" ${tag}`, "nome da loja, já decodificado");
    // Sem coordenada no feed de veículos e endereço só cidade/estado/país.
    assert.equal(item.latitude, undefined);
    const components = (item.address as { component: { "#text": string; "@_name": string }[] }).component;
    assert.deepEqual(
      components.map((c) => [c["@_name"], c["#text"]]),
      [
        ["city", "Belo Horizonte"],
        ["region", "Minas Gerais"],
        ["country", "BR"],
      ],
    );
  });

  test("veículos: texto escapado no XML bruto (& < > aspas) e título sem quebrar o documento", async () => {
    const { xml } = await service.vehicleFeed(env);
    assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(xml.includes(`Corolla XEi &amp; Cia &lt;2021&gt; &quot;único dono&quot; ${tag}`));
    assert.ok(xml.includes(`Auto &amp; Cia &lt;Premium&gt; &quot;Top&quot;`));
    assert.ok(!xml.includes("<Premium>"));
    assert.ok(!xml.includes("<2021>"));
  });

  test("veículos: nenhum telefone, e-mail, CPF ou nome de pessoa (dono, MEI) no feed", async () => {
    const { xml } = await service.vehicleFeed(env);
    for (const forbidden of ["99999-8888", "999998888", "joao@gmail.com", "31977776666", "39053344705", "390.533.447-05", "Joana", "JOAO DA SILVA", "teste.local", "@"]) {
      assert.ok(!xml.includes(forbidden), `não pode ter "${forbidden}" no feed`);
    }
    const item = listingsOf(xml).find((i) => String(i.vehicle_id) === ids.active)!;
    assert.match(String(item.description), /Aceito troca/);
    const mei = listingsOf(xml).find((i) => String(i.vehicle_id) === ids.meiListing)!;
    assert.ok(mei, "anúncio da loja MEI entra");
    assert.equal(mei.dealer_name, undefined, "razão social com CPF (MEI) não vai como dealer_name");
  });

  test("veículos: ida e volta pelo nosso próprio leitor de catálogo Meta, sem erro e com os mesmos dados", async () => {
    const { xml } = await service.vehicleFeed(env);
    const parsed = parseVehicleCatalog(xml);
    const errors = parsed.filter((item) => !item.ok);
    assert.deepEqual(errors, [], "nenhum item do feed é recusado pelo leitor");
    const mine = parsed.find((item) => item.externalId === ids.active);
    assert.ok(mine && mine.ok);
    const input = (mine as { input: Record<string, unknown> }).input;
    assert.equal(input.title, `Corolla XEi & Cia <2021> "único dono" ${tag}`);
    assert.equal(input.brand, `Marca ${tag}`);
    assert.equal(input.model, "Corolla");
    assert.equal(input.version, "XEi 2.0");
    assert.equal(input.yearModel, 2021);
    assert.equal(input.price, 123000);
    assert.equal(input.mileage, 45000);
    assert.equal(input.transmission, "automatic");
    assert.equal(input.fuelType, "flex");
    assert.equal(input.color, "Prata");
    assert.equal(input.city, "Belo Horizonte");
    assert.equal(input.state, "MG");
    assert.equal((input.photos as string[]).length, 3);
    assert.equal((input.photos as string[])[0], `https://api.novoseminovo.com.br/uploads/${tag}-0.jpg`);
  });

  test("imóveis: só ativo e público com foto; vendido/pausado/rascunho/em análise e sem foto ficam de fora", async () => {
    const feed = await service.homeListingFeed(env);
    const items = listingsOf(feed.xml);
    const homeIds = items.map((item) => String(item.home_listing_id));
    assert.ok(homeIds.includes(ids.property));
    assert.ok(homeIds.includes(ids.rent));
    for (const id of [...ids.propertyHidden, ids.propertyNoPhoto, ids.active]) assert.ok(!homeIds.includes(id), `não entra: ${id}`);
    assert.ok(feed.skippedNoPhoto >= 1);
  });

  test("imóveis: endereço só com bairro/cidade/estado/país (nunca rua, número ou coordenada exata)", async () => {
    const { xml } = await service.homeListingFeed(env);
    for (const forbidden of ["Antônio de Albuquerque", "Albuquerque", "1234 apto", "apto 501", "-19.9381234", "-43.9354321", "98888-7777", "corretor@imob", "39053344705", "31977776666", "Joana", "Particular Souza", "teste.local"]) {
      assert.ok(!xml.includes(forbidden), `não pode ter "${forbidden}" no feed`);
    }
    const item = listingsOf(xml).find((i) => String(i.home_listing_id) === ids.property)!;
    const components = Object.fromEntries(
      (item.address as { component: { "#text": string; "@_name": string }[] }).component.map((c) => [c["@_name"], c["#text"]]),
    );
    assert.deepEqual(components, { addr1: "Savassi", city: "Belo Horizonte", region: "Minas Gerais", country: "BR" });
    assert.equal(item.neighborhood, "Savassi");
    // Ponto aproximado (o mesmo que o mapa do site já mostra), nunca o exato.
    const lat = Number(item.latitude);
    const lng = Number(item.longitude);
    assert.ok(Number.isFinite(lat) && Number.isFinite(lng));
    assert.notEqual(lat, -19.9381234);
    assert.ok(Math.abs(lat - -19.9381234) < 0.01 && Math.abs(lng - -43.9354321) < 0.01, "perto do bairro");
  });

  test("imóveis: campos home listing da Meta (venda por imobiliária e aluguel de particular)", async () => {
    const { xml } = await service.homeListingFeed(env);
    const items = listingsOf(xml);
    const sale = items.find((i) => String(i.home_listing_id) === ids.property)!;
    assert.equal(sale.name, `Apartamento active ${tag}`);
    assert.equal(sale.availability, "for_sale");
    assert.equal(sale.listing_type, "for_sale_by_agent");
    assert.equal(sale.price, "650000.00 BRL");
    assert.equal(String(sale.num_beds), "3");
    assert.equal(String(sale.num_baths), "2");
    assert.equal(String(sale.area_size), "92.5");
    assert.equal(sale.area_unit, "sq_m");
    assert.equal(sale.property_type, "apartment");
    assert.equal(sale.url, `https://novoseminovo.com.br/anuncio/${ids.property}?utm_source=meta&utm_medium=catalog&utm_campaign=catalogo`);
    assert.equal((sale.image as { url: string }[])[0]!.url, `https://api.novoseminovo.com.br/uploads/${tag}-0.jpg`);
    assert.match(String(sale.description), /3 quartos/);
    const rent = items.find((i) => String(i.home_listing_id) === ids.rent)!;
    assert.equal(rent.availability, "for_rent");
    assert.equal(rent.listing_type, "for_rent_by_owner");
    assert.equal(rent.price, "2500.00 BRL");
  });

  test("teto de itens e cache: o serviço respeita o limite e guarda o resultado por um tempo", async () => {
    const cached = new CatalogFeedsService(prisma);
    cached.cacheMs = 60_000;
    const first = await cached.vehicleFeed(env);
    const second = await cached.vehicleFeed(env);
    assert.equal(first, second, "segunda chamada dentro do prazo reaproveita o feed");
    const limited = new CatalogFeedsService(prisma);
    limited.cacheMs = 0;
    limited.maxItems = 1;
    assert.equal(listingsOf((await limited.vehicleFeed(env)).xml).length, 1);
  });
});

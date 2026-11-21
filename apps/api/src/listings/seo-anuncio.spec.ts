import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { GoneException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ListingsService } from "./listings.service";
import { toListingDetail } from "./listings.mapper";

// Auditoria de SEO (21/11/2026), itens 11 e 12: dados estruturados do
// anúncio (marca, modelo, ano, km; imóvel com bairro e cidade, nunca o
// endereço), anúncio vendido/pausado/expirado responde 410 com a categoria e
// a cidade (o site redireciona para a busca) e o sitemap das lojas leva a
// data da última alteração.

const base = {
  id: "l1",
  title: "Corolla XEi 2020",
  description: "Carro revisado",
  price: 94500,
  status: "active",
  city: "Belo Horizonte",
  state: "MG",
  neighborhood: "Savassi",
  latitude: -19.93,
  longitude: -43.93,
  publishedAt: null,
  highlightedUntil: null,
  tierRank: 0,
  planTier: "free",
  partnerId: null,
  partner: null,
  ownerUserId: "u1",
  owner: { name: "Maria Silva", phone: null, createdAt: new Date() },
  showPhone: false,
  financingEnabled: true,
  videoUrl: null,
  photos: [],
  vehicleDetails: null,
  propertyDetails: null,
};

const vehicleDetails = {
  brand: { name: "Toyota" },
  model: { name: "Corolla" },
  version: "XEi 2.0",
  yearManufacture: 2019,
  yearModel: 2020,
  transmission: "automatic",
  fuelType: "flex",
  mileage: 42000,
  color: "Prata",
  condition: "used",
  bodyType: "sedan",
  engine: null,
  steering: null,
  doors: 4,
  features: [],
  conditions: [],
  fipeCode: null,
  fipePrice: null,
};

const propertyDetails = {
  propertyType: "apartment",
  purpose: "rent",
  areaM2: 68,
  totalAreaM2: null,
  bedrooms: 2,
  suites: null,
  bathrooms: 1,
  parkingSpots: 1,
  floor: null,
  condoFee: null,
  iptu: null,
  features: [],
  streetAddress: "Rua Secreta, 123, apto 401",
};

describe("toListingDetail: campos estruturados para o Google (seo)", () => {
  test("veículo: marca, modelo, versão, anos, km, câmbio, combustível, carroceria, cor e condição", () => {
    const d = toListingDetail({ ...base, type: "vehicle", vehicleDetails } as never, "not_eligible");
    assert.deepEqual(d.seo, {
      city: "Belo Horizonte",
      state: "MG",
      neighborhood: "Savassi",
      vehicle: {
        brand: "Toyota",
        model: "Corolla",
        version: "XEi 2.0",
        yearManufacture: 2019,
        yearModel: 2020,
        mileageKm: 42000,
        transmission: "automatic",
        fuelType: "flex",
        bodyType: "sedan",
        color: "Prata",
        condition: "used",
        doors: 4,
      },
    });
  });

  test("imóvel: tipo, finalidade, quartos, banheiros e área — sem rua, número nem coordenada", () => {
    const d = toListingDetail({ ...base, type: "property", propertyDetails } as never, "not_eligible");
    assert.deepEqual(d.seo, {
      city: "Belo Horizonte",
      state: "MG",
      neighborhood: "Savassi",
      property: { propertyType: "apartment", purpose: "rent", bedrooms: 2, bathrooms: 1, areaM2: 68 },
    });
    const json = JSON.stringify(d.seo);
    assert.doesNotMatch(json, /Rua Secreta|123|401|-19\.93|-43\.93/);
  });

  test("sem bairro: o campo some (não vira null nem texto vazio)", () => {
    const d = toListingDetail({ ...base, neighborhood: null, type: "property", propertyDetails } as never, "not_eligible");
    assert.equal("neighborhood" in d.seo!, false);
  });
});

const withDb = Boolean(process.env.DATABASE_URL);

describe("Anúncio que saiu do ar e sitemap das lojas (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const unused = {} as never;
  const listings = new ListingsService(prisma, unused, unused, unused, unused, unused, unused, unused);
  const tag = `seo-${Date.now()}`;
  const ids = { owner: "", partner: "", byStatus: {} as Record<string, string> };

  before(async () => {
    ids.owner = (await prisma.user.create({ data: { name: "Dono SEO", email: `dono-${tag}@teste.local` } })).id;
    ids.partner = (
      await prisma.partner.create({
        data: { ownerUserId: ids.owner, type: "dealership", legalName: `Loja ${tag}`, document: `doc-${tag}`, slug: `loja-${tag}`, city: "Contagem", state: "MG" },
      })
    ).id;
    for (const status of ["active", "sold", "paused", "expired", "pending_review", "rejected"] as const) {
      ids.byStatus[status] = (
        await prisma.listing.create({
          data: {
            type: "vehicle",
            ownerUserId: ids.owner,
            partnerId: status === "active" ? ids.partner : null,
            title: `Gol ${status}`,
            description: "Carro de teste do SEO.",
            price: 50000,
            city: "Belo Horizonte",
            state: "MG",
            status,
          },
        })
      ).id;
    }
  });

  after(async () => {
    await prisma.listing.deleteMany({ where: { id: { in: Object.values(ids.byStatus) } } });
    await prisma.partner.deleteMany({ where: { id: ids.partner } });
    await prisma.user.deleteMany({ where: { id: ids.owner } });
    await prisma.$disconnect();
  });

  for (const status of ["sold", "paused", "expired"]) {
    test(`${status}: visitante recebe 410 com tipo, UF e cidade (para redirecionar à busca)`, async () => {
      await assert.rejects(listings.getDetail(ids.byStatus[status]!), (err: unknown) => {
        assert.ok(err instanceof GoneException, `esperava 410, veio ${String(err)}`);
        const body = err.getResponse() as Record<string, unknown>;
        assert.equal(body.statusCode, 410);
        assert.equal(body.assetType, "vehicle");
        assert.equal(body.state, "MG");
        assert.equal(body.city, "Belo Horizonte");
        assert.equal(body.status, status);
        // Nada além do necessário para montar a busca.
        assert.equal(JSON.stringify(body).includes("Gol"), false);
        return true;
      });
    });
  }

  for (const status of ["pending_review", "rejected"]) {
    test(`${status}: nunca foi público, continua 404 (não confirma que o id existe)`, async () => {
      await assert.rejects(listings.getDetail(ids.byStatus[status]!), NotFoundException);
    });
  }

  test("dono continua vendo o próprio anúncio vendido", async () => {
    const d = await listings.getDetail(ids.byStatus.sold!, { id: ids.owner, role: "user" as never });
    assert.equal(d.status, "sold");
  });

  test("sitemap: loja com anúncio ativo traz a data da última alteração dos anúncios", async () => {
    const { storefronts } = await listings.sitemapEntries();
    const loja = storefronts.find((s) => s.slug === `loja-${tag}`);
    assert.ok(loja, "loja com anúncio ativo deveria estar no sitemap");
    const active = await prisma.listing.findUniqueOrThrow({ where: { id: ids.byStatus.active! } });
    assert.equal(loja.updatedAt, active.updatedAt.toISOString());
  });
});

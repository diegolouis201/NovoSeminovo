import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { ListingDetail, PartnerStorefront } from "@novoseminovo/shared-types";
import { listingJsonLd, serializeJsonLd, storefrontJsonLd } from "./json-ld";

// Auditoria de SEO (21/11/2026), item 12: dados estruturados do anúncio
// (Car + Offer; imóvel Offer + Apartment/House com bairro e cidade, nunca o
// endereço) e da loja (AutoDealer / RealEstateAgent).

const SITE = "https://novoseminovo.com.br";
const media = (url: string) => (url.startsWith("http") ? url : `https://api.exemplo${url}`);

function listing(over: Partial<ListingDetail>): ListingDetail {
  return {
    id: "abc123",
    assetType: "vehicle",
    title: "Toyota Corolla XEi 2020",
    priceLabel: "R$ 94.500,00",
    location: "Savassi, Belo Horizonte - MG",
    description: "Carro revisado, único dono.",
    specs: [],
    financing: { price: "R$ 94.500,00", priceValue: 94500, downPayment: "", installments: "", rate: "" },
    ownerUserId: "u1",
    status: "active",
    sellerHasWhatsapp: false,
    reviewStatus: "not_eligible",
    photos: [{ id: "p1", url: "/uploads/a.jpg" }, { id: "p2", url: "https://cdn.exemplo/b.jpg" }],
    financingEnabled: true,
    planTier: "free",
    isPartnerListing: false,
    seo: {
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
    },
    ...over,
  } as ListingDetail;
}

describe("listingJsonLd: carro", () => {
  const ld = listingJsonLd(listing({}), SITE, media) as Record<string, any>;

  test("Car com marca, modelo, ano, km e condição", () => {
    assert.equal(ld["@context"], "https://schema.org");
    assert.equal(ld["@type"], "Car");
    assert.equal(ld.name, "Toyota Corolla XEi 2020");
    assert.deepEqual(ld.brand, { "@type": "Brand", name: "Toyota" });
    assert.equal(ld.model, "Corolla");
    assert.equal(ld.vehicleModelDate, "2020");
    assert.equal(ld.productionDate, "2019");
    assert.deepEqual(ld.mileageFromOdometer, { "@type": "QuantitativeValue", value: 42000, unitCode: "KMT" });
    assert.equal(ld.vehicleTransmission, "Automático");
    assert.equal(ld.fuelType, "Flex");
    assert.equal(ld.bodyType, "Sedã");
    assert.equal(ld.color, "Prata");
    assert.equal(ld.numberOfDoors, 4);
    assert.equal(ld.itemCondition, "https://schema.org/UsedCondition");
    assert.equal(ld.url, `${SITE}/anuncio/abc123`);
    assert.deepEqual(ld.image, ["https://api.exemplo/uploads/a.jpg", "https://cdn.exemplo/b.jpg"]);
  });

  test("Offer com preço numérico em BRL, disponível, e lugar só com cidade/UF", () => {
    assert.equal(ld.offers["@type"], "Offer");
    assert.equal(ld.offers.price, 94500);
    assert.equal(ld.offers.priceCurrency, "BRL");
    assert.equal(ld.offers.availability, "https://schema.org/InStock");
    assert.equal(ld.offers.url, `${SITE}/anuncio/abc123`);
    assert.deepEqual(ld.offers.availableAtOrFrom.address, {
      "@type": "PostalAddress",
      addressLocality: "Belo Horizonte",
      addressRegion: "MG",
      addressCountry: "BR",
    });
  });

  test("particular: sem vendedor na marcação; loja: AutoDealer com link da vitrine", () => {
    assert.equal(ld.offers.seller, undefined);
    const loja = listingJsonLd(
      listing({
        partnerSlug: "auto-bh",
        seller: { kind: "partner", name: "Auto BH", verified: true, reviewCount: 0, activeListings: 3, since: "2026-01-01" },
      }),
      SITE,
      media,
    ) as Record<string, any>;
    assert.deepEqual(loja.offers.seller, { "@type": "AutoDealer", name: "Auto BH", url: `${SITE}/lojas/auto-bh` });
  });

  test("carro 0 km: NewCondition", () => {
    const novo = listing({});
    novo.seo!.vehicle!.condition = "new";
    assert.equal((listingJsonLd(novo, SITE, media) as any).itemCondition, "https://schema.org/NewCondition");
  });
});

describe("listingJsonLd: imóvel", () => {
  const imovel = (purpose: "sale" | "rent", propertyType: any = "apartment") =>
    listing({
      assetType: "property",
      title: "Apartamento 2 quartos na Savassi",
      seo: { city: "Belo Horizonte", state: "MG", neighborhood: "Savassi", property: { propertyType, purpose, bedrooms: 2, bathrooms: 1, areaM2: 68 } },
      financing: { price: "R$ 2.500,00", priceValue: 2500, downPayment: "", installments: "", rate: "" },
    });

  test("venda: Offer de venda com Apartment, bairro e cidade", () => {
    const ld = listingJsonLd(imovel("sale"), SITE, media) as Record<string, any>;
    assert.equal(ld["@type"], "Offer");
    assert.equal(ld.price, 2500);
    assert.equal(ld.priceCurrency, "BRL");
    assert.equal(ld.businessFunction, "http://purl.org/goodrelations/v1#Sell");
    assert.equal(ld.itemOffered["@type"], "Apartment");
    assert.equal(ld.itemOffered.numberOfBedrooms, 2);
    assert.equal(ld.itemOffered.numberOfBathroomsTotal, 1);
    assert.deepEqual(ld.itemOffered.floorSize, { "@type": "QuantitativeValue", value: 68, unitCode: "MTK" });
    assert.deepEqual(ld.itemOffered.address, { "@type": "PostalAddress", addressLocality: "Belo Horizonte", addressRegion: "MG", addressCountry: "BR" });
    assert.deepEqual(ld.itemOffered.containedInPlace, { "@type": "Place", name: "Savassi, Belo Horizonte - MG" });
    assert.equal(JSON.stringify(ld).includes("streetAddress"), false);
    assert.equal(JSON.stringify(ld).includes("geo"), false);
  });

  test("aluguel: LeaseOut com preço por mês", () => {
    const ld = listingJsonLd(imovel("rent"), SITE, media) as Record<string, any>;
    assert.equal(ld.businessFunction, "http://purl.org/goodrelations/v1#LeaseOut");
    assert.deepEqual(ld.priceSpecification, { "@type": "UnitPriceSpecification", price: 2500, priceCurrency: "BRL", unitCode: "MON" });
  });

  test("casa vira House; terreno e comercial viram Place sem quartos", () => {
    assert.equal((listingJsonLd(imovel("sale", "condo_house"), SITE, media) as any).itemOffered["@type"], "House");
    const terreno = (listingJsonLd(imovel("sale", "land"), SITE, media) as any).itemOffered;
    assert.equal(terreno["@type"], "Place");
    assert.equal(terreno.numberOfBedrooms, undefined);
  });

  test("imobiliária: RealEstateAgent", () => {
    const comLoja = imovel("sale");
    comLoja.partnerSlug = "imob-bh";
    comLoja.seller = { kind: "partner", name: "Imob BH", verified: false, reviewCount: 0, activeListings: 1, since: "2026-01-01" };
    assert.equal((listingJsonLd(comLoja, SITE, media) as any).seller["@type"], "RealEstateAgent");
  });
});

describe("listingJsonLd: fora do ar ou sem dados", () => {
  test("anúncio não ativo (dono vendo o vendido) não gera marcação", () => {
    assert.equal(listingJsonLd(listing({ status: "sold" }), SITE, media), undefined);
  });
  test("sem campos estruturados (API antiga) não gera marcação", () => {
    assert.equal(listingJsonLd(listing({ seo: undefined }), SITE, media), undefined);
  });
});

describe("storefrontJsonLd", () => {
  const base: PartnerStorefront = {
    legalName: "Auto BH",
    type: "dealership",
    description: "Seminovos com garantia.",
    address: "Av. Amazonas, 100 - Centro, Belo Horizonte - MG",
    city: "Belo Horizonte",
    state: "MG",
    logoUrl: "/uploads/logo.png",
    verified: true,
    listings: [
      { id: "l1", assetType: "vehicle", title: "Gol 2019", priceLabel: "R$ 50.000,00", location: "BH", price: 50000 },
      { id: "l2", assetType: "vehicle", title: "Onix 2021", priceLabel: "R$ 70.000,00", location: "BH", price: 70000 },
    ],
    highlights: [],
    reviews: [],
  };

  test("loja de veículos: AutoDealer com cidade e os anúncios", () => {
    const ld = storefrontJsonLd(base, "auto-bh", SITE, media) as Record<string, any>;
    assert.equal(ld["@type"], "AutoDealer");
    assert.equal(ld.name, "Auto BH");
    assert.equal(ld.url, `${SITE}/lojas/auto-bh`);
    assert.equal(ld.logo, "https://api.exemplo/uploads/logo.png");
    assert.deepEqual(ld.address, { "@type": "PostalAddress", addressLocality: "Belo Horizonte", addressRegion: "MG", addressCountry: "BR" });
    assert.equal(ld.hasOfferCatalog["@type"], "OfferCatalog");
    assert.equal(ld.hasOfferCatalog.numberOfItems, 2);
    assert.deepEqual(ld.hasOfferCatalog.itemListElement[0], {
      "@type": "Offer",
      name: "Gol 2019",
      url: `${SITE}/anuncio/l1`,
      price: 50000,
      priceCurrency: "BRL",
    });
  });

  test("imobiliária, corretor e construtora: RealEstateAgent", () => {
    for (const type of ["real_estate_agency", "broker", "builder"] as const) {
      assert.equal((storefrontJsonLd({ ...base, type }, "x", SITE, media) as any)["@type"], "RealEstateAgent");
    }
  });

  test("sem cidade: sem endereço (nada inventado)", () => {
    const ld = storefrontJsonLd({ ...base, city: undefined, state: undefined }, "auto-bh", SITE, media) as Record<string, any>;
    assert.equal(ld.address, undefined);
  });
});

describe("serializeJsonLd: texto do anunciante não fecha o <script>", () => {
  test("< vira \\u003c", () => {
    const ld = listingJsonLd(listing({ title: "Gol </script><script>alert(1)</script>" }), SITE, media);
    const out = serializeJsonLd(ld);
    assert.equal(out.includes("<"), false);
    assert.equal(out.includes("</script>"), false);
    assert.equal(JSON.parse(out).name, "Gol </script><script>alert(1)</script>");
  });
});

// Dados estruturados (schema.org) do anúncio e da vitrine da loja — auditoria
// de SEO 21/11/2026, item 12. Funções puras (testadas em json-ld.test.ts).
//
// - Carro: Car com Offer (preço numérico em BRL, disponível), marca, modelo,
//   ano, km, câmbio, combustível, carroceria.
// - Imóvel: Offer (venda ou aluguel por mês) com Apartment/House/Place, bairro
//   e cidade. Nunca rua, número ou coordenada: a API nem manda isso.
// - Loja: AutoDealer (loja de veículos) ou RealEstateAgent, com cidade e os
//   anúncios no ar.
// Tudo sai por serializeJsonLd ("<" escapado: texto do anunciante não fecha o
// <script>).
import { VEHICLE_BODY_TYPE_OPTIONS, type ListingDetail, type PartnerStorefront } from "@novoseminovo/shared-types";

type Resolve = (url: string) => string;
type Json = Record<string, unknown>;

export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

const TRANSMISSION: Record<string, string> = { manual: "Manual", automatic: "Automático" };
const FUEL: Record<string, string> = {
  flex: "Flex",
  gasoline: "Gasolina",
  ethanol: "Etanol",
  diesel: "Diesel",
  electric: "Elétrico",
  hybrid: "Híbrido",
};
const BODY_TYPE: Record<string, string> = Object.fromEntries(VEHICLE_BODY_TYPE_OPTIONS.map((option) => [option.value, option.label]));

// Apartment/House são "Accommodation" (aceitam quartos e área); o resto é um
// lugar sem quartos (terreno, sala comercial, galpão…).
const PROPERTY_SCHEMA_TYPE: Record<string, "Apartment" | "House" | "Place"> = {
  apartment: "Apartment",
  penthouse: "Apartment",
  studio: "Apartment",
  house: "House",
  condo_house: "House",
};

const MAX_DESCRIPTION = 1000;
const MAX_IMAGES = 10;

function postalAddress(city: string, state: string): Json {
  return { "@type": "PostalAddress", addressLocality: city, addressRegion: state, addressCountry: "BR" };
}

function sellerOf(listing: ListingDetail, siteUrl: string): Json | undefined {
  // Particular: nenhum dado pessoal na marcação.
  if (listing.seller?.kind !== "partner" || !listing.partnerSlug) return undefined;
  return {
    "@type": listing.assetType === "vehicle" ? "AutoDealer" : "RealEstateAgent",
    name: listing.seller.name,
    url: `${siteUrl}/lojas/${encodeURIComponent(listing.partnerSlug)}`,
  };
}

function withoutEmpty(data: Json): Json {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

/** Marcação do anúncio público (ativo). Fora do ar ou sem dados: nada. */
export function listingJsonLd(listing: ListingDetail, siteUrl: string, resolveMedia: Resolve): Json | undefined {
  const seo = listing.seo;
  if (listing.status !== "active" || !seo) return undefined;
  const url = `${siteUrl}/anuncio/${encodeURIComponent(listing.id)}`;
  const price = listing.financing.priceValue;
  const image = listing.photos.slice(0, MAX_IMAGES).map((photo) => resolveMedia(photo.url));
  const description = listing.description.replace(/\s+/g, " ").trim().slice(0, MAX_DESCRIPTION);
  const seller = sellerOf(listing, siteUrl);

  if (listing.assetType === "vehicle" && seo.vehicle) {
    const v = seo.vehicle;
    const condition = v.condition === "new" ? "https://schema.org/NewCondition" : "https://schema.org/UsedCondition";
    return withoutEmpty({
      "@context": "https://schema.org",
      "@type": "Car",
      name: listing.title,
      description,
      url,
      image: image.length ? image : undefined,
      brand: { "@type": "Brand", name: v.brand },
      model: v.model,
      vehicleConfiguration: v.version,
      vehicleModelDate: String(v.yearModel),
      productionDate: String(v.yearManufacture),
      mileageFromOdometer: { "@type": "QuantitativeValue", value: v.mileageKm, unitCode: "KMT" },
      vehicleTransmission: TRANSMISSION[v.transmission],
      fuelType: FUEL[v.fuelType],
      bodyType: v.bodyType ? BODY_TYPE[v.bodyType] : undefined,
      color: v.color,
      numberOfDoors: v.doors,
      itemCondition: condition,
      offers: withoutEmpty({
        "@type": "Offer",
        url,
        price,
        priceCurrency: "BRL",
        availability: "https://schema.org/InStock",
        itemCondition: condition,
        availableAtOrFrom: { "@type": "Place", address: postalAddress(seo.city, seo.state) },
        seller,
      }),
    });
  }

  if (listing.assetType === "property" && seo.property) {
    const p = seo.property;
    const type = PROPERTY_SCHEMA_TYPE[p.propertyType] ?? "Place";
    const accommodation = type !== "Place";
    const rent = p.purpose === "rent";
    return withoutEmpty({
      "@context": "https://schema.org",
      "@type": "Offer",
      name: listing.title,
      description,
      url,
      image: image.length ? image : undefined,
      price,
      priceCurrency: "BRL",
      priceSpecification: rent ? { "@type": "UnitPriceSpecification", price, priceCurrency: "BRL", unitCode: "MON" } : undefined,
      businessFunction: rent ? "http://purl.org/goodrelations/v1#LeaseOut" : "http://purl.org/goodrelations/v1#Sell",
      availability: "https://schema.org/InStock",
      seller,
      itemOffered: withoutEmpty({
        "@type": type,
        name: listing.title,
        numberOfBedrooms: accommodation ? p.bedrooms : undefined,
        numberOfBathroomsTotal: accommodation ? p.bathrooms : undefined,
        floorSize: p.areaM2 ? { "@type": "QuantitativeValue", value: p.areaM2, unitCode: "MTK" } : undefined,
        address: postalAddress(seo.city, seo.state),
        containedInPlace: seo.neighborhood ? { "@type": "Place", name: `${seo.neighborhood}, ${seo.city} - ${seo.state}` } : undefined,
      }),
    });
  }
  return undefined;
}

const MAX_CATALOG = 50;

/** Marcação da vitrine (/lojas/[slug]). */
export function storefrontJsonLd(storefront: PartnerStorefront, slug: string, siteUrl: string, resolveMedia: Resolve): Json {
  const url = `${siteUrl}/lojas/${encodeURIComponent(slug)}`;
  const offers = storefront.listings.slice(0, MAX_CATALOG).map((listing) =>
    withoutEmpty({
      "@type": "Offer",
      name: listing.title,
      url: `${siteUrl}/anuncio/${encodeURIComponent(listing.id)}`,
      price: listing.price,
      priceCurrency: listing.price !== undefined ? "BRL" : undefined,
    }),
  );
  return withoutEmpty({
    "@context": "https://schema.org",
    "@type": storefront.type === "dealership" ? "AutoDealer" : "RealEstateAgent",
    "@id": `${url}#empresa`,
    name: storefront.legalName,
    url,
    logo: storefront.logoUrl ? resolveMedia(storefront.logoUrl) : undefined,
    image: storefront.logoUrl ? resolveMedia(storefront.logoUrl) : undefined,
    description: storefront.description?.replace(/\s+/g, " ").trim().slice(0, MAX_DESCRIPTION),
    address: storefront.city && storefront.state ? postalAddress(storefront.city, storefront.state) : undefined,
    hasOfferCatalog: offers.length
      ? { "@type": "OfferCatalog", name: `Anúncios de ${storefront.legalName}`, numberOfItems: storefront.listings.length, itemListElement: offers }
      : undefined,
  });
}

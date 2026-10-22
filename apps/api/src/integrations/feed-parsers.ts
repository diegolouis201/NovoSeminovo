import { XMLParser } from "fast-xml-parser";
import type { IntegrationListingInput, PropertyFeature } from "@novoseminovo/shared-types";

// Um item do feed já traduzido pro formato de "Anunciar" — ou o motivo de
// não ter dado pra traduzir (vira uma linha de erro no relatório da
// sincronização, sem derrubar os outros itens).
export type ParsedFeedItem =
  | { ok: true; externalId: string; input: unknown }
  | { ok: false; externalId: string; message: string };

export class FeedFormatError extends Error {}

type XmlNode = Record<string, unknown>;

function text(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "object") return text((value as XmlNode)["#text"]);
  const result = String(value).trim();
  return result === "" ? undefined : result;
}

function attr(value: unknown, name: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  return text((value as XmlNode)[`@_${name}`]);
}

// "1.234,56", "1234.56", "R$ 500.000", "13,999.00" — CRMs exportam preço de
// jeitos diferentes. Com ponto e vírgula juntos, o que vem por último é o
// decimal. Só um deles: grupos exatos de 3 dígitos são milhar; senão é decimal.
export function parseBrazilianNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  let value = raw.replace(/[^\d.,-]/g, "");
  if (!value) return undefined;
  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    value = lastComma > lastDot ? value.replace(/\./g, "").replace(",", ".") : value.replace(/,/g, "");
  } else if (lastComma !== -1) {
    value = /^-?\d{1,3}(,\d{3})+$/.test(value) ? value.replace(/,/g, "") : value.replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(value)) {
    value = value.replace(/\./g, "");
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function int(raw: string | undefined): number | undefined {
  const value = parseBrazilianNumber(raw);
  return value === undefined ? undefined : Math.round(value);
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

type PropertyType = "house" | "apartment" | "land" | "commercial" | "penthouse" | "farm" | "warehouse" | "condo_house" | "studio" | "store" | "garage";

// "Residential / Apartment", "Commercial / Industrial", "Residential / Sobrado"…
// — a lista oficial do VRSync tem dezenas de valores; agrupa por palavra-chave
// nos 7 tipos que o NovoSeminovo usa.
export function mapVrsyncPropertyType(raw: string | undefined): PropertyType | undefined {
  if (!raw) return undefined;
  const value = normalize(raw);
  if (/penthouse|cobertura/.test(value)) return "penthouse";
  if (/land|lot\b|terreno|lote/.test(value)) return "land";
  if (/farm|ranch|sitio|chacara|fazenda|agricultural/.test(value)) return "farm";
  if (/industrial|warehouse|galpao|deposito/.test(value)) return "warehouse";
  if (/kitnet|studio|loft/.test(value)) return "studio";
  if (/apartment|flat|apartamento/.test(value)) return "apartment";
  if (/parking|garage|garagem|box/.test(value)) return "garage";
  if (/retail|loja|store/.test(value)) return "store";
  if (/commercial|office|business|retail|loja|consultorio|edificio|sala|building|hotel/.test(value)) return "commercial";
  if (/condo|village|condominio/.test(value)) return "condo_house";
  if (/home|house|sobrado|casa/.test(value)) return "house";
  return undefined;
}

const FEATURE_KEYWORDS: [PropertyFeature, RegExp][] = [
  ["pool", /pool|piscina/],
  ["balcony", /balcony|varanda|sacada/],
  ["barbecue", /bbq|barbecue|churrasqueira/],
  ["elevator", /elevator|elevador/],
  ["gourmet_area", /gourmet/],
  ["garden", /garden|jardim/],
  ["furnished", /furnished|mobiliado/],
  ["concierge", /concierge|doorman|porteiro|portaria/],
];

function mapFeatures(raw: string[]): PropertyFeature[] {
  const found = new Set<PropertyFeature>();
  for (const feature of raw.map(normalize)) {
    for (const [key, pattern] of FEATURE_KEYWORDS) if (pattern.test(feature)) found.add(key);
  }
  return [...found];
}

const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  house: "Casa",
  apartment: "Apartamento",
  land: "Terreno",
  commercial: "Imóvel comercial",
  penthouse: "Cobertura",
  farm: "Sítio/Fazenda",
  warehouse: "Galpão",
  condo_house: "Casa em condomínio",
  studio: "Kitnet/Studio",
  store: "Loja",
  garage: "Garagem",
};

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

// Bloqueia DOCTYPE com entidades: feed de CRM nunca precisa disso, e é o
// vetor clássico de "bomba de expansão" de XML.
function assertSafeXml(xml: string): void {
  if (/<!ENTITY/i.test(xml)) throw new FeedFormatError("O feed contém declarações de entidade XML, que não são aceitas.");
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  removeNSPrefix: true,
  isArray: (name) => ["Listing", "Item", "Feature"].includes(name),
});

export function parseVrsync(xml: string): ParsedFeedItem[] {
  assertSafeXml(xml);
  let document: XmlNode;
  try {
    document = xmlParser.parse(xml) as XmlNode;
  } catch (error) {
    throw new FeedFormatError(`O arquivo não é um XML válido: ${error instanceof Error ? error.message : error}`);
  }
  const root = document.ListingDataFeed as XmlNode | undefined;
  if (!root) {
    throw new FeedFormatError(
      'O link não é um feed no padrão VRSync (ZAP/VivaReal) — não encontrei a tag <ListingDataFeed>. Confira se escolheu o formato certo.',
    );
  }
  const listings = asArray((root.Listings as XmlNode | undefined)?.Listing as XmlNode[] | XmlNode | undefined);

  return listings.map((listing, index): ParsedFeedItem => {
    const externalId = text(listing.ListingID) ?? `sem-codigo-${index + 1}`;
    try {
      const details = (listing.Details ?? {}) as XmlNode;
      const location = (listing.Location ?? {}) as XmlNode;

      const propertyType = mapVrsyncPropertyType(text(details.PropertyType));
      if (!propertyType) throw new Error(`Tipo de imóvel não reconhecido: "${text(details.PropertyType) ?? "vazio"}"`);

      const transaction = normalize(text(listing.TransactionType) ?? "for sale");
      const salePrice = parseBrazilianNumber(text(details.ListPrice));
      const rentPrice = parseBrazilianNumber(text(details.RentalPrice));
      // "Sale/Rent" vira anúncio de venda (o NovoSeminovo tem um preço por
      // anúncio); só aluguel quando o CRM diz que é só aluguel.
      const purpose: "sale" | "rent" = transaction.includes("sale") || !rentPrice ? "sale" : "rent";
      const price = purpose === "sale" ? salePrice : rentPrice;
      if (!price || price <= 0) throw new Error(purpose === "sale" ? "Sem preço de venda (ListPrice)" : "Sem valor de aluguel (RentalPrice)");

      const areaM2 = parseBrazilianNumber(text(details.LivingArea)) ?? parseBrazilianNumber(text(details.LotArea));
      if (!areaM2 || areaM2 <= 0) throw new Error("Sem área (LivingArea/LotArea)");
      const lotArea = parseBrazilianNumber(text(details.LotArea));

      const city = text(location.City);
      const state = (attr(location.State, "abbreviation") ?? text(location.State) ?? "").toUpperCase();
      if (!city) throw new Error("Sem cidade (Location/City)");
      if (state.length !== 2) throw new Error("Sem sigla do estado (Location/State abbreviation)");
      const neighborhood = text(location.Neighborhood);

      const bedrooms = int(text(details.Bedrooms));
      const typeLabel = PROPERTY_TYPE_LABEL[propertyType];
      const title =
        text(listing.Title) ??
        `${typeLabel}${bedrooms ? ` ${bedrooms} quarto${bedrooms > 1 ? "s" : ""}` : ""}${neighborhood ? ` — ${neighborhood}` : ` em ${city}`}`;

      let description = text(details.Description) ?? "";
      // Descrição vazia/curtinha no CRM não pode barrar o anúncio — o
      // formulário exige 20 caracteres, então completa com os dados do imóvel.
      if (description.length < 20) {
        description = [description, `${typeLabel} com ${areaM2} m²${neighborhood ? ` em ${neighborhood}` : ""}, ${city}/${state}.`]
          .filter(Boolean)
          .join(" ");
      }

      const media = asArray((listing.Media as XmlNode | undefined)?.Item as XmlNode[] | XmlNode | undefined)
        .filter((item) => (attr(item, "medium") ?? "image") === "image")
        .map((item) => ({ url: text(item), primary: attr(item, "primary") === "true" }))
        .filter((item): item is { url: string; primary: boolean } => Boolean(item.url && /^https?:\/\//i.test(item.url)));
      media.sort((a, b) => Number(b.primary) - Number(a.primary));

      const featureNames = asArray((details.Features as XmlNode | undefined)?.Feature as unknown[] | unknown).flatMap((f) => {
        const value = text(f);
        return value ? [value] : [];
      });

      const streetAddress = text(location.Address);
      const addressNumber = text(location.StreetNumber);

      const input = {
        assetType: "property" as const,
        externalId,
        title: title.slice(0, 120),
        description: description.slice(0, 5000),
        price,
        city,
        state,
        neighborhood,
        propertyType,
        purpose,
        bedrooms,
        suites: int(text(details.Suites)),
        bathrooms: int(text(details.Bathrooms)),
        parkingSpots: int(text(details.Garage)),
        floor: int(text(details.Floor)),
        areaM2,
        totalAreaM2: lotArea && lotArea !== areaM2 ? lotArea : undefined,
        condoFee: parseBrazilianNumber(text(details.PropertyAdministrationFee)),
        // VRSync manda IPTU anual (YearlyTax); o NovoSeminovo mostra mensal.
        iptu: (() => {
          const yearly = parseBrazilianNumber(text(details.YearlyTax));
          return yearly ? Math.round((yearly / 12) * 100) / 100 : parseBrazilianNumber(text(details.MonthlyTax));
        })(),
        features: mapFeatures(featureNames),
        // Muitos CRMs ocultam o endereço exato no feed (displayAddress) —
        // o bairro + cidade é o mínimo que dá pra mostrar.
        streetAddress:
          streetAddress && streetAddress.length >= 5
            ? `${streetAddress}${addressNumber ? `, ${addressNumber}` : ""}`
            : `${neighborhood ? `${neighborhood}, ` : ""}${city}`,
        photos: media.slice(0, 40).map((item) => item.url),
      };
      return { ok: true, externalId, input };
    } catch (error) {
      return { ok: false, externalId, message: error instanceof Error ? error.message : String(error) };
    }
  });
}

// Formato próprio: { "listings": [ { externalId, assetType, ...campos de
// Anunciar, photos: [...] } ] } — a validação de cada item fica com o
// mesmo schema da API de integração (ver IntegrationsService).
export function parseNovoSeminovoJson(raw: string): ParsedFeedItem[] {
  let document: unknown;
  try {
    document = JSON.parse(raw);
  } catch {
    throw new FeedFormatError("O link não devolveu um JSON válido. Confira se escolheu o formato certo.");
  }
  const listings = Array.isArray(document) ? document : (document as { listings?: unknown })?.listings;
  if (!Array.isArray(listings)) {
    throw new FeedFormatError('O JSON precisa ter uma lista "listings" com os anúncios.');
  }
  return listings.map((item, index): ParsedFeedItem => {
    const externalId =
      item && typeof item === "object" && typeof (item as { externalId?: unknown }).externalId === "string"
        ? (item as { externalId: string }).externalId
        : `item-${index + 1}`;
    return { ok: true, externalId, input: item };
  });
}

export type { IntegrationListingInput };

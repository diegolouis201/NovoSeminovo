import type { FuelType, PartnerType, PropertyType, Purpose, Transmission } from "@novoseminovo/db";
import { findContactInfo, scrubContactInline, stripContactInfo } from "../common/contact-filter";
import { approximatePoint } from "../listings/listings.mapper";

// Feeds de catálogo da Meta (Facebook/Instagram/Marketplace por anúncios de
// catálogo), 23/11/2026, pedido do Diego. Funções puras: recebem só os campos
// públicos do anúncio (o service nunca carrega telefone, e-mail, CPF, nome do
// dono nem a rua do imóvel) e montam o XML.
//
// Formatos (documentação da Meta para catálogos):
// - Veículos ("vehicles", Automotive inventory ads): <listings><listing> com
//   vehicle_id, title, description, url, make, model, year, mileage{value,unit},
//   image[]{url}, body_style, transmission, fuel_type, exterior_color,
//   state_of_vehicle, price "X BRL", address{city,region,country}, dealer_name.
//   O nosso leitor de catálogos (integrations/vehicle-catalog-parser.ts) lê
//   este mesmo formato — o teste faz a ida e volta.
// - Imóveis ("home listings"): home_listing_id, name, availability, price,
//   address{addr1,city,region,country}, latitude/longitude, neighborhood,
//   image[], url, num_beds, num_baths, area_size/area_unit, property_type,
//   listing_type.

export const FEED_UTM = "utm_source=meta&utm_medium=catalog&utm_campaign=catalogo";
export const MAX_FEED_IMAGES = 20;
const DEFAULT_SITE = "https://novoseminovo.com.br";

export type FeedEnv = { WEB_ORIGIN?: string; PUBLIC_API_URL?: string };

// Caracteres de controle (menos tab e quebra de linha) são inválidos em XML
// 1.0 e derrubariam o feed inteiro na Meta.
// eslint-disable-next-line no-control-regex
const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function escapeXml(value: string): string {
  return value
    .replace(XML_INVALID, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function metaPrice(value: number): string {
  return `${value.toFixed(2)} BRL`;
}

function trimSlash(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function feedListingUrl(id: string, env: FeedEnv): string {
  const site = trimSlash(env.WEB_ORIGIN || DEFAULT_SITE);
  return `${site}/anuncio/${encodeURIComponent(id)}?${FEED_UTM}`;
}

// A Meta baixa a foto pelo link: precisa ser absoluta e http(s). Foto do
// nosso disco ("/uploads/…") ganha o endereço público da API; sem ele, não
// tem como a Meta chegar nela e a foto fica de fora. Usa a original (JPEG, até
// 2560 px, já tratada no envio): as cópias menores são WebP, formato que a
// especificação de imagens do catálogo da Meta não lista (JPG/PNG).
export function feedPhotoUrl(url: string, env: FeedEnv): string | undefined {
  const value = url.trim();
  if (/^https?:\/\//i.test(value)) return value;
  // Caminho relativo só se for arquivo que a API serve (/uploads/<nome>).
  if (/^\/uploads\/[\w.-]+$/.test(value) && !value.includes("..")) {
    const api = trimSlash(env.PUBLIC_API_URL ?? "");
    return /^https?:\/\//i.test(api) ? `${api}${value}` : undefined;
  }
  return undefined;
}

// CPF escrito no texto ("123.456.789-09" ou 11 dígitos seguidos).
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;

export function hasCpf(text: string): boolean {
  return new RegExp(CPF.source).test(text);
}

// Mesma limpeza do site para texto vindo de fora (contact-filter): numa
// linha com telefone, e-mail, link ou @, sai só o trecho do contato
// (descrição de uma linha só não some inteira); se ainda sobrar contato, a
// linha sai. CPF solto também sai.
export function scrubFeedText(text: string): string {
  const lines = text.split(/\n/).map((line) => (findContactInfo(line) ? scrubContactInline(line) : line));
  return stripContactInfo(lines.join("\n")).replace(CPF, "").replace(/[ \t]{2,}/g, " ").trim();
}

export function scrubFeedTitle(text: string): string {
  return scrubContactInline(text).replace(CPF, "").replace(/\s{2,}/g, " ").trim();
}

const STATE_NAMES: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal",
  ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul",
  MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
  RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima",
  SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};

export function stateName(uf: string): string {
  return STATE_NAMES[uf.trim().toUpperCase()] ?? uf.trim();
}

// ---------- montagem do XML ----------

function el(name: string, value: string | number | undefined | null, indent = "    "): string {
  if (value === undefined || value === null) return "";
  const text = typeof value === "number" ? (Number.isFinite(value) ? String(value) : "") : value.trim();
  return text === "" ? "" : `${indent}<${name}>${escapeXml(text)}</${name}>\n`;
}

function images(urls: string[]): string {
  return urls.map((url) => `    <image>\n      <url>${escapeXml(url)}</url>\n    </image>\n`).join("");
}

function address(components: [string, string | undefined][]): string {
  const inner = components
    .filter(([, value]) => value && value.trim())
    .map(([name, value]) => `      <component name="${escapeXml(name)}">${escapeXml(value!.trim())}</component>\n`)
    .join("");
  return `    <address format="simple">\n${inner}    </address>\n`;
}

function document(title: string, selfUrl: string | undefined, listings: string[]): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n<listings>\n  <title>${escapeXml(title)}</title>\n` +
    (selfUrl ? `  <link rel="self" href="${escapeXml(selfUrl)}"/>\n` : "") +
    listings.join("") +
    "</listings>\n"
  );
}

function selfLink(path: string, env: FeedEnv): string | undefined {
  const api = trimSlash(env.PUBLIC_API_URL ?? "");
  return /^https?:\/\//i.test(api) ? `${api}${path}` : undefined;
}

// ---------- veículos ----------

export type FeedVehicle = {
  id: string;
  title: string;
  description: string;
  price: number;
  city: string;
  state: string;
  photoUrls: string[];
  brand: string;
  model: string;
  version?: string | null;
  yearModel: number;
  mileage: number;
  transmission: Transmission;
  fuelType: FuelType;
  color: string;
  condition: "new" | "used";
  bodyType?: string | null;
  partner?: { type: PartnerType; legalName: string } | null;
};

const BODY_STYLE: Record<string, string> = {
  hatch: "HATCHBACK",
  sedan: "SEDAN",
  suv: "SUV",
  pickup: "PICKUP",
  minivan: "MINIVAN",
  wagon: "WAGON",
  coupe: "COUPE",
  convertible: "CONVERTIBLE",
  van: "VAN",
};

// Valores da Meta: DIESEL, ELECTRIC, FLEX, GASOLINE, HYBRID, PETROL,
// PLUGIN_HYBRID, OTHER. Etanol puro não tem valor próprio: vai como OTHER.
const FUEL: Record<FuelType, string> = {
  flex: "FLEX",
  gasoline: "GASOLINE",
  ethanol: "OTHER",
  diesel: "DIESEL",
  electric: "ELECTRIC",
  hybrid: "HYBRID",
};

// Nome da loja só quando é loja de veículos e a razão social não tem CPF
// (MEI: "JOAO DA SILVA 12345678900" é nome de pessoa física + CPF).
export function dealerName(partner: FeedVehicle["partner"]): string | undefined {
  if (!partner || partner.type !== "dealership") return undefined;
  const name = partner.legalName.trim();
  if (!name || hasCpf(name)) return undefined;
  return name.slice(0, 100);
}

export function vehicleListingXml(v: FeedVehicle, env: FeedEnv): string {
  const fallbackTitle = [v.brand, v.model, v.version, v.yearModel].filter(Boolean).join(" ");
  const title = (scrubFeedTitle(v.title) || fallbackTitle).slice(0, 150);
  const mileageText = `${Math.round(v.mileage).toLocaleString("pt-BR")} km`;
  let description = scrubFeedText(v.description);
  if (description.length < 20) description = [description, `${fallbackTitle}, ${mileageText}.`].filter(Boolean).join(" ");
  return (
    "  <listing>\n" +
    el("vehicle_id", v.id) +
    el("title", title) +
    el("description", description.slice(0, 5000)) +
    el("url", feedListingUrl(v.id, env)) +
    el("make", v.brand) +
    el("model", v.model) +
    el("trim", v.version ?? undefined) +
    el("year", v.yearModel) +
    `    <mileage>\n      <value>${Math.max(0, Math.round(v.mileage))}</value>\n      <unit>KM</unit>\n    </mileage>\n` +
    images(v.photoUrls) +
    el("body_style", (v.bodyType && BODY_STYLE[v.bodyType]) || "OTHER") +
    el("transmission", v.transmission === "automatic" ? "AUTOMATIC" : "MANUAL") +
    el("fuel_type", FUEL[v.fuelType] ?? "OTHER") +
    el("exterior_color", v.color) +
    el("state_of_vehicle", v.condition === "new" ? "NEW" : "USED") +
    el("price", metaPrice(v.price)) +
    el("availability", "AVAILABLE") +
    address([
      ["city", v.city],
      ["region", stateName(v.state)],
      ["country", "BR"],
    ]) +
    el("dealer_name", dealerName(v.partner)) +
    "  </listing>\n"
  );
}

export function vehicleFeedXml(vehicles: FeedVehicle[], env: FeedEnv): string {
  return document("NovoSeminovo - Veículos", selfLink("/feeds/meta/veiculos.xml", env), vehicles.map((v) => vehicleListingXml(v, env)));
}

// ---------- imóveis ----------

export type FeedHome = {
  id: string;
  title: string;
  description: string;
  price: number;
  city: string;
  state: string;
  neighborhood?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  photoUrls: string[];
  propertyType: PropertyType;
  purpose: Purpose;
  bedrooms?: number | null;
  bathrooms?: number | null;
  areaM2: number;
  partner?: { type: PartnerType } | null;
};

// Valores da Meta para property_type: apartment, condo, house, land,
// manufactured, other, townhouse. "condo" na Meta é a unidade de condomínio
// americana (não "casa em condomínio") — casa em condomínio vai como house.
const PROPERTY_TYPE: Record<PropertyType, string> = {
  apartment: "apartment",
  penthouse: "apartment",
  studio: "apartment",
  house: "house",
  condo_house: "house",
  land: "land",
  farm: "other",
  commercial: "other",
  warehouse: "other",
  store: "other",
  garage: "other",
};

export function metaPropertyType(type: PropertyType): string {
  return PROPERTY_TYPE[type] ?? "other";
}

// Valores da Meta para listing_type: for_rent_by_agent, for_rent_by_owner,
// for_sale_by_agent, for_sale_by_owner, foreclosed, new_construction,
// new_listing. Imobiliária/corretor = agente; construtora vendendo =
// lançamento (new_construction); particular e empresa que não é do ramo =
// dono.
export function metaListingType(purpose: Purpose, partnerType: PartnerType | undefined): string {
  const agent = partnerType === "real_estate_agency" || partnerType === "broker" || partnerType === "builder";
  if (purpose === "rent") return agent ? "for_rent_by_agent" : "for_rent_by_owner";
  if (partnerType === "builder") return "new_construction";
  return agent ? "for_sale_by_agent" : "for_sale_by_owner";
}

export function homeListingXml(h: FeedHome, env: FeedEnv): string {
  // Ponto aproximado (~60–150 m), o mesmo que o mapa do site já mostra a
  // qualquer visitante; a coordenada exata nunca sai da API.
  const point = h.latitude != null && h.longitude != null ? approximatePoint(h.id, h.latitude, h.longitude) : undefined;
  const neighborhood = h.neighborhood?.trim() || undefined;
  const title = (scrubFeedTitle(h.title) || "Imóvel").slice(0, 150);
  return (
    "  <listing>\n" +
    el("home_listing_id", h.id) +
    el("name", title) +
    el("description", scrubFeedText(h.description).slice(0, 5000)) +
    el("availability", h.purpose === "rent" ? "for_rent" : "for_sale") +
    el("listing_type", metaListingType(h.purpose, h.partner?.type)) +
    el("property_type", metaPropertyType(h.propertyType)) +
    el("price", metaPrice(h.price)) +
    el("url", feedListingUrl(h.id, env)) +
    // addr1 é obrigatório na Meta; vai o bairro (nunca rua e número). Sem
    // bairro, a cidade.
    address([
      ["addr1", neighborhood ?? h.city],
      ["city", h.city],
      ["region", stateName(h.state)],
      ["country", "BR"],
    ]) +
    el("neighborhood", neighborhood) +
    (point ? el("latitude", point.lat) + el("longitude", point.lng) : "") +
    images(h.photoUrls) +
    el("num_beds", h.bedrooms ?? undefined) +
    el("num_baths", h.bathrooms ?? undefined) +
    el("area_size", h.areaM2 > 0 ? h.areaM2 : undefined) +
    (h.areaM2 > 0 ? el("area_unit", "sq_m") : "") +
    "  </listing>\n"
  );
}

export function homeListingFeedXml(homes: FeedHome[], env: FeedEnv): string {
  return document("NovoSeminovo - Imóveis", selfLink("/feeds/meta/imoveis.xml", env), homes.map((h) => homeListingXml(h, env)));
}

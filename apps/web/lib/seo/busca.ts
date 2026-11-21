// Título, descrição, canonical e robots de /busca (auditoria de SEO,
// 21/11/2026, item 4). Função pura (testada em busca.test.ts).
//
// Regra de segurança: nada que vem da URL vai cru para o título, a descrição
// ou o canonical. Cada filtro é conferido contra uma lista fixa e o texto que
// sai é sempre o rótulo da lista (a cidade, o nome oficial do IBGE da UF).
//
// Canonical = versão limpa do filtro: só os parâmetros de CANONICAL_ORDER,
// nessa ordem. Ordenação, página, rastreio (utm_*, gclid…), busca livre (q),
// faixas de preço/ano/km e opcionais ficam de fora — apontam para a página do
// filtro principal.
import { VEHICLE_BODY_TYPE_OPTIONS } from "@novoseminovo/shared-types";
import { BRAND_LOGOS } from "../brand-logos";
import { BRAZIL_STATES } from "../brazil-states";

export type BuscaParams = Record<string, string | string[] | undefined>;

export type BuscaSeo = {
  /** Sem " | NovoSeminovo": o template do layout põe. */
  title: string;
  description: string;
  canonical: string;
};

const CANONICAL_ORDER = ["assetType", "purpose", "propertyType", "bodyType", "brand", "state", "city"] as const;
type CleanKey = (typeof CANONICAL_ORDER)[number];

// Plural para o título ("SUVs à venda…"). Lista fixa = carrocerias da busca.
const BODY_TYPE_PLURAL: Record<string, string> = {
  hatch: "Carros hatch",
  sedan: "Sedãs",
  suv: "SUVs",
  pickup: "Picapes",
  minivan: "Minivans",
  wagon: "Peruas e SWs",
  coupe: "Cupês",
  convertible: "Conversíveis",
  van: "Vans e utilitários",
};
const BODY_TYPES = new Set<string>(VEHICLE_BODY_TYPE_OPTIONS.map((option) => option.value));

// Mesmos tipos do enum PropertyType (filtro da busca de imóveis).
export const PROPERTY_TYPE_PLURAL: Record<string, string> = {
  house: "Casas",
  apartment: "Apartamentos",
  land: "Terrenos",
  commercial: "Imóveis comerciais",
  condo_house: "Casas em condomínio",
  penthouse: "Coberturas",
  studio: "Kitnets e studios",
  store: "Lojas",
  garage: "Garagens",
  farm: "Imóveis rurais",
  warehouse: "Galpões",
};

// "em Minas Gerais", "no Rio de Janeiro", "na Bahia".
const STATE_PREPOSITION: Record<string, "em" | "no" | "na"> = {
  AC: "no", AP: "no", AM: "no", CE: "no", DF: "no", ES: "no", MA: "no", MT: "no", MS: "no",
  PA: "no", PR: "no", PI: "no", RJ: "no", RN: "no", RS: "no", TO: "no", BA: "na", PB: "na",
};

// Texto da URL é limitado antes de qualquer comparação.
const MAX_PARAM = 120;

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed && trimmed.length <= MAX_PARAM ? trimmed : undefined;
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function brandName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const wanted = normalize(value);
  return BRAND_LOGOS.find((brand) => normalize(brand.name) === wanted || brand.aliases?.includes(wanted))?.name;
}

/** Filtros reconhecidos, já com o valor oficial (ordem fixa). */
export function cleanBuscaFilters(params: BuscaParams, cities?: readonly string[]): Partial<Record<CleanKey, string>> {
  const clean: Partial<Record<CleanKey, string>> = {};
  const assetType = first(params.assetType);
  if (assetType === "vehicle" || assetType === "property") clean.assetType = assetType;

  if (clean.assetType === "property") {
    const purpose = first(params.purpose);
    if (purpose === "sale" || purpose === "rent") clean.purpose = purpose;
    const propertyType = first(params.propertyType);
    if (propertyType && propertyType in PROPERTY_TYPE_PLURAL) clean.propertyType = propertyType;
  }
  if (clean.assetType === "vehicle") {
    const bodyType = first(params.bodyType);
    if (bodyType && BODY_TYPES.has(bodyType)) clean.bodyType = bodyType;
    const brand = brandName(first(params.brand));
    if (brand) clean.brand = brand;
  }

  const uf = first(params.state)?.toUpperCase();
  if (uf && BRAZIL_STATES.some((state) => state.uf === uf)) {
    clean.state = uf;
    const city = first(params.city);
    const official = city && cities?.find((name) => normalize(name) === normalize(city));
    if (official) clean.city = official;
  }
  return clean;
}

function canonicalOf(clean: Partial<Record<CleanKey, string>>): string {
  const query = new URLSearchParams();
  for (const key of CANONICAL_ORDER) {
    const value = clean[key];
    if (value) query.set(key, value);
  }
  const text = query.toString();
  return text ? `/busca?${text}` : "/busca";
}

function nounOf(clean: Partial<Record<CleanKey, string>>): string {
  if (clean.assetType === "vehicle") {
    const base = clean.bodyType ? BODY_TYPE_PLURAL[clean.bodyType] ?? "Carros" : "Carros";
    return clean.brand ? `${base} ${clean.brand}` : base;
  }
  if (clean.assetType === "property") return clean.propertyType ? PROPERTY_TYPE_PLURAL[clean.propertyType]! : "Imóveis";
  return "Carros e imóveis";
}

function purposeOf(clean: Partial<Record<CleanKey, string>>): string {
  if (clean.assetType !== "property") return "à venda";
  if (clean.purpose === "rent") return "para alugar";
  if (clean.purpose === "sale") return "à venda";
  return "à venda e para alugar";
}

function placeOf(clean: Partial<Record<CleanKey, string>>): string {
  if (clean.state && clean.city) return `em ${clean.city} (${clean.state})`;
  if (clean.state) {
    const name = BRAZIL_STATES.find((state) => state.uf === clean.state)!.name;
    return `${STATE_PREPOSITION[clean.state] ?? "em"} ${name}`;
  }
  return "em todo o Brasil";
}

export function buscaSeo(params: BuscaParams, options: { cities?: readonly string[] } = {}): BuscaSeo {
  const clean = cleanBuscaFilters(params, options.cities);
  const title = `${nounOf(clean)} ${purposeOf(clean)} ${placeOf(clean)}`;
  const rentOnly = clean.assetType === "property" && clean.purpose === "rent";
  const extra =
    clean.assetType === "property"
      ? rentOnly
        ? "Veja no mapa e fale com o anunciante pelo chat."
        : "Veja no mapa, fale com o anunciante e simule o financiamento no anúncio."
      : "Fale com o anunciante e simule o financiamento no próprio anúncio.";
  return { title, description: `${title} no NovoSeminovo. ${extra}`, canonical: canonicalOf(clean) };
}

/** Busca sem anúncio não entra no Google (mas os links dela continuam valendo). */
export function buscaRobots(total: number): { index: false; follow: true } | undefined {
  return total === 0 ? { index: false, follow: true } : undefined;
}

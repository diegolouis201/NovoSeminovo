import { XMLParser } from "fast-xml-parser";
import { FeedFormatError, parseBrazilianNumber, type ParsedFeedItem } from "./feed-parsers";

// Catálogo de veículos no padrão do Meta (Facebook/Instagram — "Automotive
// inventory ads"), que é o link de feed de estoque que os sistemas de loja
// de veículos mais costumam gerar. O Google Vehicle Ads usa quase os mesmos
// campos com outros nomes (id, brand, link, image_link…) — os dois são
// aceitos. Vem em XML (<listings><listing>…) ou CSV/TSV (cabeçalho com
// "vehicle_id", "mileage.value", "image[0].url"…).

export type VehicleFeedDefaults = { city?: string; state?: string };

const STATE_BY_NAME: Record<string, string> = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE", "distrito federal": "DF",
  "espirito santo": "ES", goias: "GO", maranhao: "MA", "mato grosso": "MT", "mato grosso do sul": "MS",
  "minas gerais": "MG", para: "PA", paraiba: "PB", parana: "PR", pernambuco: "PE", piaui: "PI",
  "rio de janeiro": "RJ", "rio grande do norte": "RN", "rio grande do sul": "RS", rondonia: "RO", roraima: "RR",
  "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO",
};
const UFS = new Set(Object.values(STATE_BY_NAME));

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

export function toUf(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  const upper = value.toUpperCase().replace(/^BR-/, "");
  if (UFS.has(upper)) return upper;
  return STATE_BY_NAME[normalize(value)];
}

function mapTransmission(raw: string | undefined, context: string): "manual" | "automatic" | undefined {
  const value = normalize(raw ?? "");
  if (/auto|cvt|dct|tiptronic|semi/.test(value)) return "automatic";
  if (/manual|mecanic/.test(value)) return "manual";
  // Muitos sistemas brasileiros não preenchem o campo mas escrevem no título
  // ("Corolla XEi 2.0 Aut."). Só aceita sinal explícito — nunca chuta manual.
  const text = normalize(context);
  if (/\b(aut|automatico|automatica|automatic|cvt|at)\b\.?/.test(text)) return "automatic";
  if (/\b(manual|mec)\b/.test(text)) return "manual";
  return undefined;
}

type Fuel = "flex" | "gasoline" | "ethanol" | "diesel" | "electric" | "hybrid";

function mapFuel(raw: string | undefined, context: string): Fuel | undefined {
  const check = (value: string): Fuel | undefined => {
    if (/flex|bicombustivel|alcool\/gasolina|gasolina\/alcool/.test(value)) return "flex";
    if (/hybrid|hibrido|plugin/.test(value)) return "hybrid";
    if (/electric|eletrico/.test(value)) return "electric";
    if (/diesel/.test(value)) return "diesel";
    if (/ethanol|etanol|alcool/.test(value)) return "ethanol";
    if (/gasoline|petrol|gasolina/.test(value)) return "gasoline";
    return undefined;
  };
  return check(normalize(raw ?? "")) ?? check(normalize(context));
}

function cleanPrice(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  return parseBrazilianNumber(raw.replace(/BRL|USD|R\$/gi, ""));
}

// Lê os campos de um anúncio, já achatados em "chave → valor(es)" — o
// mesmo formato sai do XML e do CSV.
type Flat = { get: (...names: string[]) => string | undefined; images: string[] };

function toItem(flat: Flat, index: number, defaults: VehicleFeedDefaults): ParsedFeedItem | undefined {
  const externalId = flat.get("vehicle_id", "id", "stock_number", "vin") ?? `sem-codigo-${index + 1}`;
  try {
    // Anúncio marcado como vendido/indisponível no feed = não está mais no
    // estoque: fica de fora (e a sincronização pausa se estava no ar).
    const availability = normalize(flat.get("availability", "status", "state_of_vehicle_availability") ?? "");
    if (/sold|vendid|out of stock|not available|indisponivel/.test(availability)) return undefined;

    const brand = flat.get("make", "brand", "marca");
    const model = flat.get("model", "modelo");
    if (!brand) throw new Error("Sem marca (make)");
    if (!model) throw new Error("Sem modelo (model)");

    const year = Number(flat.get("year", "model_year", "ano", "ano_modelo"));
    if (!Number.isInteger(year) || year < 1950 || year > 2100) throw new Error("Ano inválido ou ausente (year)");
    const yearManufacture = Number(flat.get("year_manufacture", "manufacture_year", "ano_fabricacao")) || year;

    const salePrice = cleanPrice(flat.get("sale_price"));
    const listPrice = cleanPrice(flat.get("price", "preco"));
    const price = salePrice && listPrice ? Math.min(salePrice, listPrice) : salePrice ?? listPrice;
    if (!price || price <= 0) throw new Error("Sem preço (price)");

    const version = flat.get("trim", "version", "versao");
    const title = (flat.get("title", "titulo") ?? [brand, model, version, year].filter(Boolean).join(" ")).slice(0, 120);
    const context = `${title} ${version ?? ""} ${flat.get("description") ?? ""}`;

    const transmission = mapTransmission(flat.get("transmission", "cambio"), context);
    if (!transmission) throw new Error("Câmbio não informado (transmission: Automatic/Manual)");
    const fuelType = mapFuel(flat.get("fuel_type", "fuel", "combustivel"), context);
    if (!fuelType) throw new Error("Combustível não informado (fuel_type)");

    // Quilometragem: "mileage.value" + "mileage.unit" (Meta) ou "45000 km"
    // num campo só (Google). Milha vira km.
    const mileageRaw = flat.get("mileage.value", "mileage", "km", "quilometragem") ?? "";
    let mileage = parseBrazilianNumber(mileageRaw.replace(/km|mi(les)?/gi, ""));
    const unit = normalize(flat.get("mileage.unit") ?? mileageRaw);
    if (mileage !== undefined && /\bmi/.test(unit)) mileage = mileage * 1.609;
    if (mileage === undefined) {
      const condition = normalize(flat.get("state_of_vehicle", "condition") ?? "");
      if (condition === "new" || condition === "novo") mileage = 0;
      else throw new Error("Sem quilometragem (mileage.value)");
    }

    const city = flat.get("address.city", "city", "cidade") ?? defaults.city;
    const state = toUf(flat.get("address.region", "region", "state", "estado", "uf")) ?? defaults.state;
    if (!city || !state) throw new Error("Sem cidade/estado (address.city, address.region)");

    let description = flat.get("description", "descricao") ?? "";
    if (description.length < 20) {
      description = [description, `${title}, ${Math.round(mileage).toLocaleString("pt-BR")} km, câmbio ${
        transmission === "automatic" ? "automático" : "manual"
      }.`]
        .filter(Boolean)
        .join(" ");
    }

    const doors = Number(flat.get("doors", "portas"));
    const plate = flat.get("plate", "placa")?.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

    return {
      ok: true,
      externalId,
      input: {
        assetType: "vehicle",
        externalId,
        title,
        description: description.slice(0, 5000),
        price,
        city,
        state,
        neighborhood: flat.get("address.addr2", "neighborhood", "bairro"),
        brand,
        model,
        version,
        yearManufacture: yearManufacture <= year ? yearManufacture : year,
        yearModel: year,
        mileage: Math.round(mileage),
        transmission,
        fuelType,
        color: flat.get("exterior_color", "color", "cor") ?? "Não informada",
        doors: doors >= 2 && doors <= 6 ? doors : undefined,
        plate: plate && plate.length === 7 ? plate : undefined,
        photos: [...new Set(flat.images.filter((url) => /^https?:\/\//i.test(url)))].slice(0, 40),
      },
    };
  } catch (error) {
    return { ok: false, externalId, message: error instanceof Error ? error.message : String(error) };
  }
}

// ---------- XML ----------

type XmlNode = Record<string, unknown>;

function xmlText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return xmlText(value[0]);
  if (typeof value === "object") return xmlText((value as XmlNode)["#text"]);
  const text = String(value).trim();
  return text === "" ? undefined : text;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  removeNSPrefix: true,
  isArray: (name) => ["listing", "image", "component", "item", "entry", "additional_image_link"].includes(name),
});

function flattenXml(node: XmlNode): Flat {
  const fields = new Map<string, string>();
  const images: string[] = [];
  for (const [key, value] of Object.entries(node)) {
    const name = key.toLowerCase();
    if (name === "image") {
      for (const image of value as unknown[]) {
        const url = typeof image === "object" ? xmlText((image as XmlNode).url) ?? xmlText(image) : xmlText(image);
        if (url) images.push(url);
      }
    } else if (name === "image_link" || name === "additional_image_link") {
      for (const url of (Array.isArray(value) ? value : [value]).flatMap((v) => (xmlText(v) ?? "").split(","))) {
        if (url.trim()) images.push(url.trim());
      }
    } else if (name === "mileage" && value && typeof value === "object") {
      const mileage = value as XmlNode;
      const v = xmlText(mileage.value) ?? xmlText(mileage);
      if (v) fields.set("mileage.value", v);
      const unit = xmlText(mileage.unit);
      if (unit) fields.set("mileage.unit", unit);
    } else if (name === "address" && value && typeof value === "object") {
      const address = value as XmlNode;
      for (const component of (address.component as XmlNode[] | undefined) ?? []) {
        const componentName = xmlText(component["@_name"]);
        const text = xmlText(component);
        if (componentName && text) fields.set(`address.${componentName.toLowerCase()}`, text);
      }
      for (const [sub, subValue] of Object.entries(address)) {
        const text = xmlText(subValue);
        if (!sub.startsWith("@_") && sub !== "component" && text) fields.set(`address.${sub.toLowerCase()}`, text);
      }
    } else {
      const text = xmlText(value);
      if (text) fields.set(name, text);
    }
  }
  return { get: (...names) => names.map((n) => fields.get(n)).find(Boolean), images };
}

function parseXml(xml: string, defaults: VehicleFeedDefaults): ParsedFeedItem[] {
  if (/<!ENTITY/i.test(xml)) throw new FeedFormatError("O feed contém declarações de entidade XML, que não são aceitas.");
  let document: XmlNode;
  try {
    document = xmlParser.parse(xml) as XmlNode;
  } catch (error) {
    throw new FeedFormatError(`O arquivo não é um XML válido: ${error instanceof Error ? error.message : error}`);
  }
  // Meta: <listings><listing>; Google/RSS: <rss><channel><item> ou <feed><entry>.
  const root = (document.listings ?? document.rss ?? document.feed) as XmlNode | undefined;
  const channel = (root?.channel as XmlNode | undefined) ?? root;
  const nodes = (channel?.listing ?? channel?.item ?? channel?.entry) as XmlNode[] | undefined;
  if (!root || !nodes) {
    throw new FeedFormatError(
      "O link não é um catálogo de veículos no padrão Facebook/Meta — não encontrei <listings><listing>. Confira se escolheu o formato certo.",
    );
  }
  return nodes.flatMap((node, index) => toItem(flattenXml(node), index, defaults) ?? []);
}

// ---------- CSV / TSV ----------

function parseDelimited(text: string): string[][] {
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? text.length : text.indexOf("\n"));
  const delimiter = [ "\t", ";", ","].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += char;
      continue;
    }
    if (char === '"' && field === "") inQuotes = true;
    else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

function parseCsv(text: string, defaults: VehicleFeedDefaults): ParsedFeedItem[] {
  const rows = parseDelimited(text.replace(/^﻿/, ""));
  const header = rows[0]?.map((cell) => cell.trim().toLowerCase());
  if (!header || !header.some((cell) => ["vehicle_id", "id", "make", "brand"].includes(cell))) {
    throw new FeedFormatError(
      'O link não é um catálogo de veículos no padrão Facebook/Meta — o cabeçalho não tem "vehicle_id"/"make". Confira se escolheu o formato certo.',
    );
  }
  return rows.slice(1).flatMap((cells, index) => {
    const fields = new Map<string, string>();
    const images: string[] = [];
    header.forEach((name, column) => {
      const value = cells[column]?.trim();
      if (!value) return;
      // image[0].url, image[1].url… / image_link / additional_image_link (vírgula)
      if (/^image\[\d+\]\.url$/.test(name) || name === "image_link" || name === "image") images.push(value);
      else if (name === "additional_image_link") images.push(...value.split(",").map((url) => url.trim()));
      else fields.set(name, value);
    });
    return toItem({ get: (...names) => names.map((n) => fields.get(n)).find(Boolean), images }, index, defaults) ?? [];
  });
}

export function parseVehicleCatalog(raw: string, defaults: VehicleFeedDefaults = {}): ParsedFeedItem[] {
  const text = raw.replace(/^﻿/, "").trimStart();
  return text.startsWith("<") ? parseXml(text, defaults) : parseCsv(text, defaults);
}

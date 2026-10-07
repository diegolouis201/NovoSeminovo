import type { CreateListingInput, CreateVehicleInput } from "@novoseminovo/shared-types";
import { parseCsvRecords } from "@/lib/csv";

// Aceita tanto o valor em português (mais amigável pra quem preenche a
// planilha) quanto o valor em inglês já usado no restante do site —
// qualquer um dos dois funciona.
const ASSET_TYPE_ALIASES: Record<string, "vehicle" | "property"> = {
  vehicle: "vehicle",
  carro: "vehicle",
  veiculo: "vehicle",
  property: "property",
  imovel: "property",
};

const TRANSMISSION_ALIASES: Record<string, "manual" | "automatic"> = {
  manual: "manual",
  automatic: "automatic",
  automatico: "automatic",
};

const FUEL_ALIASES: Record<string, CreateVehicleInput["fuelType"]> = {
  flex: "flex",
  gasoline: "gasoline",
  gasolina: "gasoline",
  ethanol: "ethanol",
  etanol: "ethanol",
  diesel: "diesel",
  electric: "electric",
  eletrico: "electric",
  hybrid: "hybrid",
  hibrido: "hybrid",
};

const PROPERTY_TYPE_ALIASES: Record<string, "house" | "apartment" | "land" | "commercial"> = {
  house: "house",
  casa: "house",
  apartment: "apartment",
  apartamento: "apartment",
  land: "land",
  terreno: "land",
  commercial: "commercial",
  comercial: "commercial",
};

const PURPOSE_ALIASES: Record<string, "sale" | "rent"> = {
  sale: "sale",
  venda: "sale",
  rent: "rent",
  aluguel: "rent",
};

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function requiredText(record: Record<string, string>, column: string): string | undefined {
  const value = record[column]?.trim();
  return value ? value : undefined;
}

function optionalNumber(record: Record<string, string>, column: string): number | undefined {
  const raw = record[column]?.trim();
  if (!raw) return undefined;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

export type ListingCsvRowResult =
  | { ok: true; input: CreateListingInput }
  | { ok: false; error: string };

// Uma linha por vez: erro numa linha não derruba as outras — cada CSV vira
// uma lista de resultados independentes, igual criar os anúncios um a um.
export function rowToListingInput(record: Record<string, string>): ListingCsvRowResult {
  const assetTypeRaw = normalize(record.assetType ?? record.tipo ?? "");
  const assetType = ASSET_TYPE_ALIASES[assetTypeRaw];
  if (!assetType) {
    return { ok: false, error: `Coluna "assetType"/"tipo" inválida ou vazia (use "vehicle"/"carro" ou "property"/"imovel")` };
  }

  const title = requiredText(record, "title") ?? requiredText(record, "titulo");
  if (!title || title.length < 5) return { ok: false, error: "Título obrigatório (mínimo 5 caracteres)" };

  const description = requiredText(record, "description") ?? requiredText(record, "descricao");
  if (!description || description.length < 20) {
    return { ok: false, error: "Descrição obrigatória (mínimo 20 caracteres)" };
  }

  const price = optionalNumber(record, "price") ?? optionalNumber(record, "preco");
  if (!price || price <= 0) return { ok: false, error: "Preço obrigatório e maior que zero" };

  const city = requiredText(record, "city") ?? requiredText(record, "cidade");
  if (!city) return { ok: false, error: "Cidade obrigatória" };

  const state = (requiredText(record, "state") ?? requiredText(record, "estado"))?.toUpperCase();
  if (!state || state.length !== 2) return { ok: false, error: "Estado obrigatório (sigla de 2 letras, ex.: MG)" };

  const neighborhood = requiredText(record, "neighborhood") ?? requiredText(record, "bairro");
  const core = { title, description, price, city, state, neighborhood };

  if (assetType === "vehicle") {
    const brand = requiredText(record, "brand") ?? requiredText(record, "marca");
    const model = requiredText(record, "model") ?? requiredText(record, "modelo");
    const yearManufacture = optionalNumber(record, "yearManufacture") ?? optionalNumber(record, "anoFabricacao");
    const yearModel = optionalNumber(record, "yearModel") ?? optionalNumber(record, "anoModelo");
    const mileage = optionalNumber(record, "mileage") ?? optionalNumber(record, "km");
    const transmission = TRANSMISSION_ALIASES[normalize(record.transmission ?? record.cambio ?? "")];
    const fuelType = FUEL_ALIASES[normalize(record.fuelType ?? record.combustivel ?? "")];
    const color = requiredText(record, "color") ?? requiredText(record, "cor");

    if (!brand || !model) return { ok: false, error: "Marca e modelo obrigatórios pra veículo" };
    if (!yearManufacture || !yearModel) return { ok: false, error: "Ano de fabricação e ano do modelo obrigatórios" };
    if (mileage === undefined) return { ok: false, error: "Quilometragem (km) obrigatória" };
    if (!transmission) return { ok: false, error: 'Câmbio inválido (use "manual" ou "automatico")' };
    if (!fuelType) return { ok: false, error: "Combustível inválido" };
    if (!color) return { ok: false, error: "Cor obrigatória pra veículo" };

    return {
      ok: true,
      input: {
        assetType: "vehicle",
        ...core,
        brand,
        model,
        version: requiredText(record, "version") ?? requiredText(record, "versao"),
        yearManufacture,
        yearModel,
        mileage,
        transmission,
        fuelType,
        color,
        doors: optionalNumber(record, "doors") ?? optionalNumber(record, "portas"),
      },
    };
  }

  const propertyType = PROPERTY_TYPE_ALIASES[normalize(record.propertyType ?? record.tipoImovel ?? "")];
  const purpose = PURPOSE_ALIASES[normalize(record.purpose ?? record.finalidade ?? "")];
  const areaM2 = optionalNumber(record, "areaM2") ?? optionalNumber(record, "area");
  const streetAddress = requiredText(record, "streetAddress") ?? requiredText(record, "endereco");

  if (!propertyType) return { ok: false, error: "Tipo de imóvel inválido (casa, apartamento, terreno ou comercial)" };
  if (!purpose) return { ok: false, error: 'Finalidade inválida (use "venda" ou "aluguel")' };
  if (!areaM2 || areaM2 <= 0) return { ok: false, error: "Área (m²) obrigatória e maior que zero" };
  if (!streetAddress) return { ok: false, error: "Endereço obrigatório pra imóvel" };

  return {
    ok: true,
    input: {
      assetType: "property",
      ...core,
      propertyType,
      purpose,
      bedrooms: optionalNumber(record, "bedrooms") ?? optionalNumber(record, "quartos"),
      bathrooms: optionalNumber(record, "bathrooms") ?? optionalNumber(record, "banheiros"),
      parkingSpots: optionalNumber(record, "parkingSpots") ?? optionalNumber(record, "vagas"),
      areaM2,
      condoFee: optionalNumber(record, "condoFee") ?? optionalNumber(record, "condominio"),
      iptu: optionalNumber(record, "iptu"),
      streetAddress,
    },
  };
}

export function parseListingsCsv(text: string): { row: number; result: ListingCsvRowResult }[] {
  return parseCsvRecords(text).map((record, index) => ({
    row: index + 2, // +1 por ser 1-based, +1 pela linha de cabeçalho
    result: rowToListingInput(record),
  }));
}

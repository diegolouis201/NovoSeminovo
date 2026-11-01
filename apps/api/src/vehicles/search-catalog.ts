import { vehicleBrandVariants } from "@novoseminovo/shared-types";

// Listas do filtro de marca e modelo da busca de carros: o que a FIPE tem
// mais o que já existe nos anúncios (se a FIPE cair, a busca não fica sem
// opção). Ordem alfabética, sem repetir.

function key(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

const byName = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base" });

// Marca: "VW" e "Volkswagen" são a mesma (grupos de vehicleBrandVariants);
// fica o nome que veio da FIPE.
export function mergeBrandNames(fipe: string[], fromListings: string[]): string[] {
  const chosen = new Map<string, string>();
  for (const name of [...fipe, ...fromListings].map((item) => item.trim()).filter(Boolean)) {
    const group = key(vehicleBrandVariants(name)[0] ?? name);
    if (!chosen.has(group)) chosen.set(group, name);
  }
  return [...chosen.values()].sort(byName);
}

export function mergeModelNames(fipe: string[], fromListings: string[]): string[] {
  const chosen = new Map<string, string>();
  for (const name of [...fipe, ...fromListings].map((item) => item.trim()).filter(Boolean)) {
    if (!chosen.has(key(name))) chosen.set(key(name), name);
  }
  return [...chosen.values()].sort(byName);
}

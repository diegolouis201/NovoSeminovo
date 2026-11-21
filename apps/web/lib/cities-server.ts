import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isBrazilState } from "@/lib/brazil-states";

// Lista oficial de municípios do IBGE por UF (public/dados/cidades/<UF>.json),
// lida no servidor para conferir a cidade que veio na URL (título e canonical
// de /busca). UF fora da lista fixa nunca vira caminho de arquivo.
const cache = new Map<string, readonly string[]>();

export async function citiesOfState(uf: string | undefined): Promise<readonly string[] | undefined> {
  if (!uf || !isBrazilState(uf)) return undefined;
  const key = uf.toUpperCase();
  const cached = cache.get(key);
  if (cached) return cached;
  try {
    const list = JSON.parse(await readFile(join(process.cwd(), "public/dados/cidades", `${key}.json`), "utf8")) as unknown;
    if (!Array.isArray(list)) return undefined;
    const cities = list.filter((item): item is string => typeof item === "string");
    cache.set(key, cities);
    return cities;
  } catch {
    return undefined;
  }
}

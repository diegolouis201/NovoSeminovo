import { Injectable, Logger } from "@nestjs/common";

// FIPE_API_URL só pra teste local (servidor falso); produção usa a pública.
const FIPE_BASE_URL = process.env.FIPE_API_URL ?? "https://parallelum.com.br/fipe/api/v1/carros";

type FipeBrand = { codigo: string; nome: string };
type FipeModel = { codigo: number; nome: string };
type FipeModelsResponse = { modelos: FipeModel[] };
type FipeYear = { codigo: string; nome: string };
type FipePriceResponse = { Valor: string; CodigoFipe: string };

// Cache em memória (a API roda numa instância só): a tabela FIPE muda uma vez
// por mês e a API pública (parallelum) tem limite diário de consultas — sem
// isso, cada visitante digitando no /anunciar gastaria várias consultas.
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; value: unknown }>();

async function fetchJson<T>(url: string, timeoutMs = 4000): Promise<T | undefined> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;
  const value = await fetchJsonUncached<T>(url, timeoutMs);
  if (value !== undefined) {
    if (cache.size > 2000) cache.clear();
    cache.set(url, { at: Date.now(), value });
  }
  return value;
}

async function fetchJsonUncached<T>(url: string, timeoutMs: number): Promise<T | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return undefined;
    return (await res.json()) as T;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

// Best-effort, de propósito: nunca lança, nunca bloqueia a criação do
// anúncio (ver ListingsService.create) e só preenche fipePrice/fipeCode
// quando o nome da marca e do modelo batem de forma inequívoca — um FIPE
// errado anexado ao carro errado é pior do que nenhum FIPE. Não foi possível
// testar contra a API de verdade a partir deste ambiente (rede do sandbox
// bloqueia hosts fora da lista liberada) — precisa ser validado em produção.
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// Nome do modelo "de gente" a partir do nome FIPE da versão: "ARGO DRIVE 1.0
// 6V Flex" → "Argo", "Grand Siena ATTRACTIV 1.4" → "Grand Siena",
// "T-CROSS Comfort 1.0" → "T-Cross", "HB20 Sense 1.0" → "HB20".
const TWO_WORD_PREFIXES = new Set(["grand", "new", "novo", "nova", "range", "classe", "serie", "série", "space", "santa", "cross", "land"]);
const NOT_PART_OF_NAME = /\d|^(flex|aut|mec|turbo|tsi|gasolina|diesel)/i;
function baseModelName(fipeName: string): string {
  const [first = "", second] = fipeName.trim().split(/\s+/);
  const words = second && TWO_WORD_PREFIXES.has(first.toLowerCase()) && !NOT_PART_OF_NAME.test(second) ? [first, second] : [first];
  return words.map(prettyWord).join(" ");
}

function prettyWord(word: string): string {
  if (/\d/.test(word)) return word.toUpperCase();
  return word
    .split("-")
    .map((part) => (part.length <= 2 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()))
    .join("-");
}

// "R$ 96.200,00" -> 96200
function parseFipeValue(value: string): number | undefined {
  const price = Number(value.replace(/[^\d,]/g, "").replace(",", "."));
  return Number.isFinite(price) && price > 0 ? price : undefined;
}

@Injectable()
export class FipeService {
  private readonly logger = new Logger(FipeService.name);

  // Marcas da tabela FIPE com nome "de gente" ("VW - VolksWagen" → "Volkswagen",
  // "GM - Chevrolet" → "Chevrolet") pra lista do cadastro. findBrand aceita os
  // dois jeitos, então o nome limpo continua batendo com a FIPE depois.
  async listBrands(): Promise<{ name: string }[]> {
    const brands = (await fetchJson<FipeBrand[]>(`${FIPE_BASE_URL}/marcas`)) ?? [];
    return brands
      .map((brand) => {
        const parts = brand.nome.split(" - ");
        const name = parts.length > 1 ? parts[parts.length - 1]!.trim() : brand.nome.trim();
        return { name: name === "VolksWagen" ? "Volkswagen" : name };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }

  private async findBrand(brandName: string): Promise<FipeBrand | undefined> {
    const brands = await fetchJson<FipeBrand[]>(`${FIPE_BASE_URL}/marcas`);
    const wanted = normalize(brandName);
    // "VW - VolksWagen", "GM - Chevrolet": aceita qualquer uma das partes.
    return brands?.find((b) => {
      const name = normalize(b.nome);
      return name === wanted || name.split(" - ").includes(wanted);
    });
  }

  // Modelos da marca (agrupando as versões FIPE pelo nome base) — sugestões
  // do campo "Modelo" no /anunciar depois de escolher marca e ano. Com ano,
  // tenta a rota de modelos por ano da API (combustível 1 = gasolina/flex,
  // 3 = diesel, 2 = álcool); se ela não responder, cai na lista da marca toda.
  async listModels(brandName: string, yearModel?: number): Promise<{ name: string; versions: number }[]> {
    try {
      const brand = await this.findBrand(brandName);
      if (!brand) return [];
      let versions: FipeModel[] | undefined;
      if (yearModel) {
        const perFuel = await Promise.all(
          [1, 3, 2].map((fuel) =>
            fetchJson<FipeModel[] | FipeModelsResponse>(`${FIPE_BASE_URL}/marcas/${brand.codigo}/anos/${yearModel}-${fuel}/modelos`),
          ),
        );
        if (perFuel.some((res) => res !== undefined)) {
          versions = perFuel.flatMap((res) => (Array.isArray(res) ? res : (res?.modelos ?? [])));
        }
      }
      versions ??= (await fetchJson<FipeModelsResponse>(`${FIPE_BASE_URL}/marcas/${brand.codigo}/modelos`))?.modelos ?? [];

      const groups = new Map<string, { name: string; codes: Set<number> }>();
      for (const version of versions) {
        const name = baseModelName(version.nome);
        if (!name) continue;
        const group = groups.get(normalize(name)) ?? { name, codes: new Set<number>() };
        group.codes.add(version.codigo);
        groups.set(normalize(name), group);
      }
      return [...groups.values()]
        .map((group) => ({ name: group.name, versions: group.codes.size }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    } catch (error) {
      this.logger.warn(`Modelos FIPE falharam pra ${brandName} ${yearModel ?? ""}: ${error}`);
      return [];
    }
  }

  // Versões da tabela FIPE pro modelo digitado (ex.: "Argo" → "ARGO DRIVE 1.0
  // 6V Flex", "ARGO TREKKING 1.3"...) que têm o ano-modelo informado — é a
  // lista "Escolha uma versão" do /anunciar.
  async listVersions(brandName: string, modelName: string, yearModel?: number): Promise<{ code: number; name: string }[]> {
    try {
      const brand = await this.findBrand(brandName);
      if (!brand) return [];
      const models = await fetchJson<FipeModelsResponse>(`${FIPE_BASE_URL}/marcas/${brand.codigo}/modelos`);
      const wanted = normalize(modelName);
      if (!wanted) return [];
      const matches = (models?.modelos ?? [])
        .filter((m) => {
          const name = normalize(m.nome);
          return name === wanted || name.startsWith(`${wanted} `) || name.startsWith(`${wanted}-`);
        })
        .slice(0, 60);
      if (!yearModel) return matches.map((m) => ({ code: m.codigo, name: m.nome }));

      const withYear = await Promise.all(
        matches.map(async (m) => {
          const years = await fetchJson<FipeYear[]>(`${FIPE_BASE_URL}/marcas/${brand.codigo}/modelos/${m.codigo}/anos`);
          return years?.some((y) => y.nome.startsWith(String(yearModel))) ? { code: m.codigo, name: m.nome } : undefined;
        }),
      );
      return withYear.filter((m): m is { code: number; name: string } => Boolean(m));
    } catch (error) {
      this.logger.warn(`Versões FIPE falharam pra ${brandName} ${modelName}: ${error}`);
      return [];
    }
  }

  // Preço de uma versão escolhida (código do modelo na FIPE) no ano-modelo.
  async priceForVersion(
    brandName: string,
    modelCode: number,
    yearModel: number,
  ): Promise<{ fipeCode: string; price: number; versionName?: string } | undefined> {
    try {
      const brand = await this.findBrand(brandName);
      if (!brand) return undefined;
      const years = await fetchJson<FipeYear[]>(`${FIPE_BASE_URL}/marcas/${brand.codigo}/modelos/${modelCode}/anos`);
      const year = years?.find((y) => y.nome.startsWith(String(yearModel)));
      if (!year) return undefined;
      const priceResponse = await fetchJson<FipePriceResponse & { Modelo?: string }>(
        `${FIPE_BASE_URL}/marcas/${brand.codigo}/modelos/${modelCode}/anos/${year.codigo}`,
      );
      if (!priceResponse) return undefined;
      const price = parseFipeValue(priceResponse.Valor);
      if (!price) return undefined;
      return { fipeCode: priceResponse.CodigoFipe, price, versionName: priceResponse.Modelo };
    } catch (error) {
      this.logger.warn(`Preço FIPE falhou pra ${brandName} modelo ${modelCode} ${yearModel}: ${error}`);
      return undefined;
    }
  }

  async lookupPrice(brandName: string, modelName: string, yearModel: number): Promise<{ fipeCode: string; price: number } | undefined> {
    try {
      const brand = await this.findBrand(brandName);
      if (!brand) return undefined;

      const modelsResponse = await fetchJson<FipeModelsResponse>(`${FIPE_BASE_URL}/marcas/${brand.codigo}/modelos`);
      const normalizedModelName = modelName.trim().toLowerCase();
      // Exato primeiro; "começa com" como segunda tentativa (FIPE costuma
      // sufixar versão/motorização no nome do modelo, ex.: "Corolla 2.0 XEi").
      const model =
        modelsResponse?.modelos.find((m) => m.nome.trim().toLowerCase() === normalizedModelName) ??
        modelsResponse?.modelos.find((m) => m.nome.trim().toLowerCase().startsWith(normalizedModelName));
      if (!model) return undefined;

      const years = await fetchJson<FipeYear[]>(`${FIPE_BASE_URL}/marcas/${brand.codigo}/modelos/${model.codigo}/anos`);
      const year = years?.find((y) => y.nome.startsWith(String(yearModel)));
      if (!year) return undefined;

      const priceResponse = await fetchJson<FipePriceResponse>(
        `${FIPE_BASE_URL}/marcas/${brand.codigo}/modelos/${model.codigo}/anos/${year.codigo}`,
      );
      if (!priceResponse) return undefined;

      // "R$ 96.200,00" -> 96200
      const price = Number(priceResponse.Valor.replace(/[^\d,]/g, "").replace(",", "."));
      if (!Number.isFinite(price) || price <= 0) return undefined;

      return { fipeCode: priceResponse.CodigoFipe, price };
    } catch (error) {
      this.logger.warn(`Consulta FIPE falhou pra ${brandName} ${modelName} ${yearModel}: ${error}`);
      return undefined;
    }
  }
}

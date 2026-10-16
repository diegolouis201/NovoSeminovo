import { Injectable, Logger } from "@nestjs/common";

const FIPE_BASE_URL = "https://parallelum.com.br/fipe/api/v1/carros";

type FipeBrand = { codigo: string; nome: string };
type FipeModel = { codigo: number; nome: string };
type FipeModelsResponse = { modelos: FipeModel[] };
type FipeYear = { codigo: string; nome: string };
type FipePriceResponse = { Valor: string; CodigoFipe: string };

async function fetchJson<T>(url: string, timeoutMs = 4000): Promise<T | undefined> {
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
@Injectable()
export class FipeService {
  private readonly logger = new Logger(FipeService.name);

  async lookupPrice(brandName: string, modelName: string, yearModel: number): Promise<{ fipeCode: string; price: number } | undefined> {
    try {
      const brands = await fetchJson<FipeBrand[]>(`${FIPE_BASE_URL}/marcas`);
      const brand = brands?.find((b) => b.nome.trim().toLowerCase() === brandName.trim().toLowerCase());
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

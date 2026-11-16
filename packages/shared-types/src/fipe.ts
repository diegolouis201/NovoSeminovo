// Referência FIPE ao lado do preço do anúncio de veículo (guia 1: "Preço de
// referência FIPE no anúncio, para você comparar antes de ligar"). A
// diferença é calculada sobre a FIPE; dentro de ±3% é "na média".
// Testes em apps/api/src/listings/fipe-referencia.spec.ts.

export const FIPE_MARGEM_MEDIA_PCT = 3;

export type ReferenciaFipe = {
  valor: number;
  valorLabel: string;
  // Diferença absoluta em %, uma casa decimal (0 quando "na média").
  percentual: number;
  situacao: "abaixo" | "acima" | "media";
  texto: string;
};

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const pct = (v: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(v);

export function referenciaFipe(price: number, fipePrice: number | null | undefined): ReferenciaFipe | undefined {
  if (fipePrice == null || !Number.isFinite(fipePrice) || fipePrice <= 0 || !Number.isFinite(price) || price <= 0) return undefined;
  const diferenca = Math.round(((price - fipePrice) / fipePrice) * 1000) / 10;
  const base = { valor: fipePrice, valorLabel: brl(fipePrice) };
  if (Math.abs(diferenca) <= FIPE_MARGEM_MEDIA_PCT) return { ...base, percentual: 0, situacao: "media", texto: "na média" };
  const situacao = diferenca < 0 ? "abaixo" : "acima";
  const percentual = Math.abs(diferenca);
  return { ...base, percentual, situacao, texto: `${pct(percentual)}% ${situacao}` };
}

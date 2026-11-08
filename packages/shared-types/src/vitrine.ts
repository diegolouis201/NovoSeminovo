// Vitrine do carro / do imóvel: o que vai no card (Instagram, story) e no
// cartaz para imprimir e colar no vidro ou no portão. Só dados que o
// anunciante pôs no anúncio (testes em apps/api/src/listings/vitrine.spec.ts).

type Spec = { label: string; value: string };
type AnuncioParaVitrine = {
  assetType: "vehicle" | "property";
  title: string;
  priceLabel: string;
  location: string;
  photos: { url: string }[];
  specs: Spec[];
  finalidade?: "venda" | "aluguel";
};
export type Vitrine = { selo: string; chamada: string; titulo: string; preco: string; dados: string[]; local: string; foto?: string };

const valor = (specs: Spec[], label: string) => specs.find((s) => s.label === label)?.value?.trim() || undefined;
const conta = (n: string | undefined, um: string, varios: string) => (n ? `${n} ${n === "1" ? um : varios}` : undefined);

export function vitrineDoAnuncio(a: AnuncioParaVitrine): Vitrine {
  const carro = a.assetType === "vehicle";
  const aluguel = !carro && a.finalidade === "aluguel";
  const dados = carro
    ? [valor(a.specs, "Ano"), valor(a.specs, "Quilometragem"), valor(a.specs, "Câmbio"), valor(a.specs, "Combustível")]
    : [valor(a.specs, "Tipo"), valor(a.specs, "Área"), conta(valor(a.specs, "Quartos"), "quarto", "quartos"), conta(valor(a.specs, "Vagas"), "vaga", "vagas")];
  return {
    selo: carro ? "Vitrine do carro" : "Vitrine do imóvel",
    chamada: carro ? "À VENDA" : aluguel ? "ALUGA-SE" : "VENDE-SE",
    titulo: a.title,
    preco: aluguel ? `${a.priceLabel}/mês` : a.priceLabel,
    dados: dados.filter((d): d is string => Boolean(d)),
    local: a.location,
    foto: a.photos[0]?.url,
  };
}

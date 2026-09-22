import { formatBRL, type ListingSummary } from "@novoseminovo/shared-types";

// Dados de exemplo para as primeiras telas, no mesmo formato que a futura
// API (apps/api, Etapa 3) vai devolver — trocar por fetch real é o único
// passo pendente quando o backend existir.

export type ListingDetail = ListingSummary & {
  description: string;
  specs: { label: string; value: string }[];
  financing: {
    price: string;
    downPayment: string;
    installments: string;
    rate: string;
  };
};

const LISTINGS: ListingDetail[] = [
  {
    id: "corolla-xei-2020",
    assetType: "vehicle",
    title: "Corolla XEi 2020",
    subtitle: "42.000 km · Automático · Flex",
    priceLabel: formatBRL(94500),
    location: "Santo Agostinho, Belo Horizonte - MG",
    badge: { label: "Novo", tone: "green" },
    sellerType: "individual",
    description:
      "Corolla XEi 2020, único dono, revisões em concessionária em dia. Pneus novos, sem detalhes de pintura. Vendo por motivo de troca.",
    specs: [
      { label: "Ano", value: "2020/2020" },
      { label: "Câmbio", value: "Automático" },
      { label: "Combustível", value: "Flex" },
      { label: "Quilometragem", value: "42.000 km" },
      { label: "Cor", value: "Prata" },
      { label: "FIPE", value: formatBRL(96200) + " (anúncio abaixo da FIPE)" },
    ],
    financing: {
      price: formatBRL(94500),
      downPayment: `${formatBRL(18900)} (20%)`,
      installments: "48x de " + formatBRL(1842),
      rate: "a partir de 1,39% a.m.",
    },
  },
  {
    id: "apartamento-savassi-2q",
    assetType: "property",
    title: "Apartamento 2 quartos — Savassi",
    subtitle: "68 m² · 1 vaga · Condomínio R$ 480",
    priceLabel: formatBRL(520000),
    location: "Savassi, Belo Horizonte - MG",
    badge: { label: "Loja verificada", tone: "blue" },
    sellerType: "partner",
    description:
      "Apartamento reformado, 2 quartos (1 suíte), varanda gourmet, 1 vaga de garagem. A 5 minutos a pé da Praça da Savassi.",
    specs: [
      { label: "Área", value: "68 m²" },
      { label: "Quartos", value: "2 (1 suíte)" },
      { label: "Vagas", value: "1" },
      { label: "Condomínio", value: formatBRL(480) + "/mês" },
      { label: "IPTU", value: formatBRL(95) + "/mês" },
    ],
    financing: {
      price: formatBRL(520000),
      downPayment: `${formatBRL(104000)} (20%)`,
      installments: "360x de " + formatBRL(3120),
      rate: "a partir de 10,9% a.a. + TR",
    },
  },
  {
    id: "civic-touring-2019",
    assetType: "vehicle",
    title: "Civic Touring 2019",
    subtitle: "58.000 km · Automático · Gasolina",
    priceLabel: formatBRL(112900),
    location: "Buritis, Belo Horizonte - MG",
    badge: { label: "Destaque", tone: "purple" },
    sellerType: "partner",
    description: "Civic Touring turbo, top de linha, teto solar, interior em couro.",
    specs: [
      { label: "Ano", value: "2019/2019" },
      { label: "Câmbio", value: "Automático" },
      { label: "Combustível", value: "Gasolina" },
      { label: "Quilometragem", value: "58.000 km" },
    ],
    financing: {
      price: formatBRL(112900),
      downPayment: `${formatBRL(22580)} (20%)`,
      installments: "48x de " + formatBRL(2205),
      rate: "a partir de 1,39% a.m.",
    },
  },
  {
    id: "casa-buritis-3q",
    assetType: "property",
    title: "Casa 3 quartos — Buritis",
    subtitle: "180 m² · 2 vagas · Terreno 300 m²",
    priceLabel: formatBRL(780000),
    location: "Buritis, Belo Horizonte - MG",
    sellerType: "individual",
    description: "Casa térrea com quintal, área gourmet e 2 vagas cobertas.",
    specs: [
      { label: "Área construída", value: "180 m²" },
      { label: "Quartos", value: "3 (1 suíte)" },
      { label: "Vagas", value: "2" },
    ],
    financing: {
      price: formatBRL(780000),
      downPayment: `${formatBRL(156000)} (20%)`,
      installments: "360x de " + formatBRL(4680),
      rate: "a partir de 10,9% a.a. + TR",
    },
  },
];

export function listListings(assetType?: "vehicle" | "property"): ListingDetail[] {
  if (!assetType) return LISTINGS;
  return LISTINGS.filter((listing) => listing.assetType === assetType);
}

export function getListing(id: string): ListingDetail | undefined {
  return LISTINGS.find((listing) => listing.id === id);
}

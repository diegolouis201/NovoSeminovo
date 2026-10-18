// Opções dos enums Transmission/FuelType/PropertyType (ver packages/db/prisma/schema.prisma)
// — compartilhado entre o formulário de anunciar e os filtros da busca, pra
// nunca ter dois lugares com os rótulos levemente diferentes um do outro.
export const TRANSMISSION_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "automatic", label: "Automático" },
];

export const FUEL_OPTIONS = [
  { value: "flex", label: "Flex" },
  { value: "gasoline", label: "Gasolina" },
  { value: "ethanol", label: "Etanol" },
  { value: "diesel", label: "Diesel" },
  { value: "electric", label: "Elétrico" },
  { value: "hybrid", label: "Híbrido" },
];

export const PROPERTY_TYPE_OPTIONS = [
  { value: "house", label: "Casa" },
  { value: "apartment", label: "Apartamento" },
  { value: "penthouse", label: "Cobertura" },
  { value: "land", label: "Terreno" },
  { value: "commercial", label: "Comercial (sala/loja)" },
  { value: "warehouse", label: "Galpão" },
  { value: "farm", label: "Sítio/Chácara" },
];

// Checklist de diferenciais (PropertyDetails.features) — mesmos valores de
// PropertyFeature em @novoseminovo/shared-types, só com rótulo PT-BR.
export const PROPERTY_FEATURE_OPTIONS = [
  { value: "pool", label: "Piscina" },
  { value: "balcony", label: "Varanda/Sacada" },
  { value: "barbecue", label: "Churrasqueira" },
  { value: "elevator", label: "Elevador" },
  { value: "gourmet_area", label: "Área gourmet" },
  { value: "garden", label: "Jardim" },
  { value: "furnished", label: "Mobiliado" },
  { value: "concierge", label: "Portaria 24h" },
];

// Tipos sem cômodos internos pra morar — esconde quartos/suítes/banheiros/
// andar no formulário quando um desses é selecionado (ver PropertyTypeFields).
export const PROPERTY_TYPES_WITHOUT_ROOMS = new Set(["land", "warehouse"]);
// Só apartamento e cobertura costumam ter número de andar relevante.
export const PROPERTY_TYPES_WITH_FLOOR = new Set(["apartment", "penthouse", "commercial"]);
// Terreno, sítio, casa e cobertura costumam ter área de terreno distinta da
// área construída — apartamento/sala comercial normalmente não.
export const PROPERTY_TYPES_WITH_TOTAL_AREA = new Set(["house", "land", "farm", "penthouse", "warehouse"]);
// Terreno puro e sítio normalmente não têm condomínio.
export const PROPERTY_TYPES_WITHOUT_CONDO = new Set(["land", "farm"]);

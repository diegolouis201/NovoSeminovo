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
  { value: "land", label: "Terreno" },
  { value: "commercial", label: "Comercial" },
];

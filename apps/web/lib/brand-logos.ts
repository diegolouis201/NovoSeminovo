// Logotipos das marcas de carro (public/marcas-carros/*.png — tirados do
// car-logos-dataset, MIT; as marcas são de seus donos e aparecem só pra
// identificar o filtro, como nos outros portais). Ordem aproximada de vendas
// no Brasil, como a faixa de marcas da Webmotors.
export const BRAND_LOGOS: { name: string; slug: string; aliases?: string[] }[] = [
  { name: "Chevrolet", slug: "chevrolet", aliases: ["gm", "gm - chevrolet"] },
  { name: "Volkswagen", slug: "volkswagen", aliases: ["vw", "vw - volkswagen"] },
  { name: "Fiat", slug: "fiat" },
  { name: "Toyota", slug: "toyota" },
  { name: "Hyundai", slug: "hyundai" },
  { name: "Jeep", slug: "jeep" },
  { name: "Renault", slug: "renault" },
  { name: "Honda", slug: "honda" },
  { name: "BYD", slug: "byd" },
  { name: "Nissan", slug: "nissan" },
  { name: "Ford", slug: "ford" },
  { name: "Peugeot", slug: "peugeot" },
  { name: "Citroën", slug: "citroen", aliases: ["citroen"] },
  { name: "Mitsubishi", slug: "mitsubishi" },
  { name: "Caoa Chery", slug: "chery", aliases: ["chery", "caoa chery/chery"] },
  { name: "Kia", slug: "kia", aliases: ["kia motors"] },
  { name: "BMW", slug: "bmw" },
  { name: "Mercedes-Benz", slug: "mercedes-benz", aliases: ["mercedes", "mercedes benz", "m.benz"] },
  { name: "Audi", slug: "audi" },
  { name: "Volvo", slug: "volvo" },
  { name: "Land Rover", slug: "land-rover", aliases: ["landrover"] },
  { name: "RAM", slug: "ram" },
  { name: "Suzuki", slug: "suzuki" },
  { name: "JAC", slug: "jac" },
  { name: "Porsche", slug: "porsche" },
  { name: "Mini", slug: "mini" },
];

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

// Logo de uma marca pelo nome como está no anúncio/FIPE ("VW - VolksWagen", "Citroen"…).
export function brandLogo(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const wanted = normalize(name);
  const brand = BRAND_LOGOS.find((item) => normalize(item.name) === wanted || item.aliases?.includes(wanted));
  return brand ? `/marcas-carros/${brand.slug}.png` : undefined;
}

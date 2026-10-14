import Link from "next/link";
import { Buildings, Car, House, MapTrifold, Storefront } from "@phosphor-icons/react/dist/ssr";

// "Modelos mais buscados" da Webmotors é por carroceria (SUV, Hatch...),
// que não existe no nosso schema — marca é o recorte real mais próximo que
// já temos (ver ListingsService.popularBrands). Tipo de imóvel é fixo
// (enum PropertyType), não precisa vir do banco.
const PROPERTY_TYPES: { value: string; label: string; icon: typeof House }[] = [
  { value: "house", label: "Casas", icon: House },
  { value: "apartment", label: "Apartamentos", icon: Buildings },
  { value: "commercial", label: "Comercial", icon: Storefront },
  { value: "land", label: "Terrenos", icon: MapTrifold },
];

// assetType indefinido (home geral, "/") mostra as duas famílias de chip
// juntas; "/carros" e "/imoveis" passam o próprio tipo e só veem a sua.
export function QuickCategories({ brands, assetType }: { brands: string[]; assetType?: "vehicle" | "property" }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-2xl font-semibold text-ink">Categorias rápidas</h2>
      <div className="flex flex-wrap gap-2">
        {assetType !== "property" &&
          brands.map((brand) => (
            <Link
              key={brand}
              href={`/busca?assetType=vehicle&brand=${encodeURIComponent(brand)}`}
              className="flex items-center gap-1.5 rounded-full border border-border bg-surface-raised px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-sober"
            >
              <Car size={16} weight="bold" className="text-brand-blue" />
              {brand}
            </Link>
          ))}
        {assetType !== "vehicle" &&
          PROPERTY_TYPES.map(({ value, label, icon: Icon }) => (
            <Link
              key={value}
              href={`/busca?assetType=property&propertyType=${value}`}
              className="flex items-center gap-1.5 rounded-full border border-border bg-surface-raised px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-sober"
            >
              <Icon size={16} weight="bold" className="text-brand-orange" />
              {label}
            </Link>
          ))}
      </div>
    </section>
  );
}

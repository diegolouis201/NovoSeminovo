import Link from "next/link";
import { BRAND_LOGOS } from "@/lib/brand-logos";

// Faixa de marcas com logotipo (modelo Webmotors): um toque filtra a busca de
// carros pela marca; tocar de novo na marca escolhida tira o filtro.
export function BrandLogoStrip({ selected, title = "Busque por marca" }: { selected?: string; title?: string }) {
  const active = selected?.toLowerCase();
  return (
    <section className="flex flex-col gap-3" aria-label="Marcas">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
        {active && (
          <Link href="/busca?assetType=vehicle" className="text-sm font-semibold text-brand-blue hover:underline">
            Ver todas as marcas
          </Link>
        )}
      </div>
      <ul className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2">
        {BRAND_LOGOS.map((brand) => {
          const isActive = active === brand.name.toLowerCase() || brand.aliases?.includes(active ?? "");
          return (
            <li key={brand.slug} className="snap-start">
              <Link
                href={isActive ? "/busca?assetType=vehicle" : `/busca?assetType=vehicle&brand=${encodeURIComponent(brand.name)}`}
                aria-current={isActive ? "true" : undefined}
                className={`flex h-24 w-28 flex-col items-center justify-center gap-1.5 rounded-brand border-2 bg-white px-2 py-2 transition-colors ${
                  isActive ? "border-brand-green" : "border-border hover:border-brand-blue"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/marcas-carros/${brand.slug}.png`} alt="" loading="lazy" className="h-11 w-20 object-contain" />
                <span className="text-xs font-semibold text-[#20261b]">{brand.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

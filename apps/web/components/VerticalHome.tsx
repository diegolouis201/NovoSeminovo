import Link from "next/link";
import { FeaturedPartners } from "@/components/FeaturedPartners";
import { ListingCard } from "@/components/ListingCard";
import { PromoCarousel } from "@/components/PromoCarousel";
import { QuickCategories } from "@/components/QuickCategories";
import { SolutionsGrid } from "@/components/SolutionsGrid";
import { fetchFeaturedPartners, fetchListings, fetchPopularBrands } from "@/lib/api";
import { getFavoriteContext } from "@/lib/favorites";

// Conteúdo da home (hero, carrossel, categorias, destaques, lojas, soluções)
// compartilhado entre "/" (as duas famílias juntas, pra quem chega sem
// preferência), "/carros" e "/imoveis" (cada um só com a sua) — clicar em
// "Carros"/"Imóveis" no cabeçalho leva pra a página dedicada em vez de cair
// direto na lista de resultados crua, mantendo a mesma experiência rica da
// home só que filtrada num vertical só.
const COPY = {
  vehicle: {
    headline: "Comprar e vender carro não precisa ser chato.",
    placeholder: "Corolla 2020, HB20 2021...",
    destaquesTitle: "Carros em destaque",
  },
  property: {
    headline: "Comprar e vender imóvel não precisa ser chato.",
    placeholder: "Apartamento na Savassi, casa no Buritis...",
    destaquesTitle: "Imóveis em destaque",
  },
  undefined: {
    headline: "Comprar e vender não precisa ser chato.",
    placeholder: "Corolla 2020, apartamento na Savassi...",
    destaquesTitle: "Destaques",
  },
} as const;

export async function VerticalHome({ assetType }: { assetType?: "vehicle" | "property" }) {
  const copy = COPY[assetType ?? "undefined"];

  const [destaques, { isAuthenticated, favoriteIds }, popularBrands, featuredPartners] = await Promise.all([
    fetchListings({ assetType }),
    getFavoriteContext(),
    assetType === "property" ? Promise.resolve([]) : fetchPopularBrands(),
    fetchFeaturedPartners(assetType),
  ]);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-12 px-4 pb-16">
      <section className="flex flex-col gap-4 pt-10 md:pt-14">
        <h1 className="max-w-2xl font-display text-4xl font-bold leading-tight text-ink md:text-5xl">{copy.headline}</h1>
        <p className="max-w-xl text-ink-muted">
          Busque, converse com o anunciante e já saia simulando o financiamento — tudo no mesmo lugar.
        </p>

        <form action="/busca" className="mt-4 flex max-w-xl flex-col gap-2 sm:flex-row">
          {assetType && <input type="hidden" name="assetType" value={assetType} />}
          <input
            name="q"
            placeholder={copy.placeholder}
            className="w-full rounded-brand border border-border bg-surface-raised px-4 py-3 text-sm text-ink placeholder:text-ink-muted"
          />
          <button
            type="submit"
            className="rounded-brand bg-brand-green px-6 py-3 text-sm font-bold text-on-green hover:opacity-90"
          >
            Buscar
          </button>
        </form>
      </section>

      <PromoCarousel />

      <QuickCategories brands={popularBrands} assetType={assetType} />

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-2xl font-semibold text-ink">{copy.destaquesTitle}</h2>
          <Link href={assetType ? `/busca?assetType=${assetType}` : "/busca"} className="text-sm font-semibold text-brand-blue">
            Ver todos
          </Link>
        </div>
        <div className="flex flex-wrap gap-5">
          {destaques.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              isFavorited={favoriteIds.has(listing.id)}
              isAuthenticated={isAuthenticated}
            />
          ))}
          {destaques.length === 0 && <p className="text-ink-muted">Nenhum anúncio por aqui ainda.</p>}
        </div>
      </section>

      <FeaturedPartners partners={featuredPartners} />

      <SolutionsGrid />
    </main>
  );
}

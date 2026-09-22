import Link from "next/link";
import { ListingCard } from "@/components/ListingCard";
import { listListings } from "@/lib/mock-data";

export default function HomePage() {
  const destaques = listListings();

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16">
      <section className="flex flex-col gap-4 py-12 md:py-16">
        <h1 className="max-w-2xl font-display text-4xl font-bold leading-tight text-ink md:text-5xl">
          Comprar e vender carro (ou imóvel) não precisa ser chato.
        </h1>
        <p className="max-w-xl text-ink-muted">
          Busque, converse com o anunciante e já saia simulando o financiamento — tudo no mesmo
          lugar, em carros e imóveis.
        </p>

        <form action="/busca" className="mt-4 flex max-w-xl flex-col gap-2 sm:flex-row">
          <input
            name="q"
            placeholder="Corolla 2020, apartamento na Savassi..."
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

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-2xl font-semibold text-ink">Destaques</h2>
          <Link href="/busca" className="text-sm font-semibold text-brand-blue">
            Ver todos
          </Link>
        </div>
        <div className="flex flex-wrap gap-5">
          {destaques.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      </section>
    </main>
  );
}

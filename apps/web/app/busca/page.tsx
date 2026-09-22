import { ListingCard } from "@/components/ListingCard";
import { listListings } from "@/lib/mock-data";

type SearchPageProps = {
  searchParams: { assetType?: string; q?: string };
};

export default function SearchPage({ searchParams }: SearchPageProps) {
  const assetType = searchParams.assetType === "property" ? "property" : searchParams.assetType === "vehicle" ? "vehicle" : undefined;
  const results = listListings(assetType);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-display text-2xl font-semibold text-ink">
        {assetType === "property" ? "Imóveis" : assetType === "vehicle" ? "Carros" : "Todos os anúncios"}
        <span className="ml-2 text-base font-normal text-ink-muted">({results.length} resultados)</span>
      </h1>

      <div className="mt-6 flex flex-col gap-8 md:flex-row">
        <aside className="flex w-full shrink-0 flex-col gap-4 rounded-brand border border-border bg-surface-raised p-4 md:w-64">
          <h2 className="text-sm font-bold text-ink">Filtros</h2>
          {/* Filtros reais (marca/modelo, preço, quartos, etc. — ver Etapa 1)
              entram quando a API de busca existir; por ora, placeholders. */}
          <FilterGroup label="Preço" placeholder="Mín. — Máx." />
          {assetType === "property" ? (
            <FilterGroup label="Quartos" placeholder="Qualquer" />
          ) : (
            <FilterGroup label="Ano" placeholder="Mín. — Máx." />
          )}
          <FilterGroup label="Cidade" placeholder="Belo Horizonte, MG" />
        </aside>

        <div className="flex flex-1 flex-wrap gap-5">
          {results.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
          {results.length === 0 && (
            <p className="text-ink-muted">Nenhum anúncio encontrado com esses filtros.</p>
          )}
        </div>
      </div>
    </main>
  );
}

function FilterGroup({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-semibold text-ink">{label}</span>
      <input
        placeholder={placeholder}
        className="rounded-brand border border-border bg-surface-page px-3 py-2 text-ink placeholder:text-ink-muted"
      />
    </label>
  );
}

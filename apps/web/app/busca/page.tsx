import { ListingCard } from "@/components/ListingCard";
import { fetchListings } from "@/lib/api";
import { getFavoriteContext } from "@/lib/favorites";

type SearchPageProps = {
  searchParams: {
    assetType?: string;
    q?: string;
    city?: string;
    priceMin?: string;
    priceMax?: string;
    yearMin?: string;
    yearMax?: string;
    bedroomsMin?: string;
  };
};

function toNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const assetType = searchParams.assetType === "property" ? "property" : searchParams.assetType === "vehicle" ? "vehicle" : undefined;
  const priceMin = toNumber(searchParams.priceMin);
  const priceMax = toNumber(searchParams.priceMax);
  const yearMin = toNumber(searchParams.yearMin);
  const yearMax = toNumber(searchParams.yearMax);
  const bedroomsMin = toNumber(searchParams.bedroomsMin);

  const [results, { isAuthenticated, favoriteIds }] = await Promise.all([
    fetchListings({
      assetType,
      q: searchParams.q,
      city: searchParams.city || undefined,
      priceMin,
      priceMax,
      ...(assetType === "property" ? { bedroomsMin } : { yearMin, yearMax }),
    }),
    getFavoriteContext(),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-display text-2xl font-semibold text-ink">
        {assetType === "property" ? "Imóveis" : assetType === "vehicle" ? "Carros" : "Todos os anúncios"}
        <span className="ml-2 text-base font-normal text-ink-muted">({results.length} resultados)</span>
      </h1>

      <div className="mt-6 flex flex-col gap-8 md:flex-row">
        <aside className="flex w-full shrink-0 flex-col gap-4 rounded-brand border border-border bg-surface-raised p-4 md:w-64">
          <h2 className="text-sm font-bold text-ink">Filtros</h2>
          <form action="/busca" className="flex flex-col gap-4">
            {searchParams.q && <input type="hidden" name="q" value={searchParams.q} />}
            {assetType && <input type="hidden" name="assetType" value={assetType} />}

            <RangeGroup
              label="Preço"
              minName="priceMin"
              maxName="priceMax"
              minDefault={searchParams.priceMin}
              maxDefault={searchParams.priceMax}
            />
            {assetType === "property" ? (
              <FilterGroup label="Quartos (mín.)" name="bedroomsMin" placeholder="Qualquer" defaultValue={searchParams.bedroomsMin} />
            ) : (
              <RangeGroup
                label="Ano"
                minName="yearMin"
                maxName="yearMax"
                minDefault={searchParams.yearMin}
                maxDefault={searchParams.yearMax}
              />
            )}
            <FilterGroup label="Cidade" name="city" placeholder="Belo Horizonte" defaultValue={searchParams.city} />

            <button
              type="submit"
              className="rounded-brand bg-brand-green px-4 py-2 text-sm font-bold text-on-green hover:opacity-90"
            >
              Filtrar
            </button>
          </form>
        </aside>

        <div className="flex flex-1 flex-wrap gap-5">
          {results.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              isFavorited={favoriteIds.has(listing.id)}
              isAuthenticated={isAuthenticated}
            />
          ))}
          {results.length === 0 && (
            <p className="text-ink-muted">Nenhum anúncio encontrado com esses filtros.</p>
          )}
        </div>
      </div>
    </main>
  );
}

function FilterGroup({
  label,
  name,
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  placeholder: string;
  defaultValue?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-semibold text-ink">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="rounded-brand border border-border bg-surface-page px-3 py-2 text-ink placeholder:text-ink-muted"
      />
    </label>
  );
}

function RangeGroup({
  label,
  minName,
  maxName,
  minDefault,
  maxDefault,
}: {
  label: string;
  minName: string;
  maxName: string;
  minDefault?: string;
  maxDefault?: string;
}) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="font-semibold text-ink">{label}</span>
      <div className="flex gap-2">
        <input
          name={minName}
          type="number"
          defaultValue={minDefault}
          placeholder="Mín."
          className="w-1/2 rounded-brand border border-border bg-surface-page px-3 py-2 text-ink placeholder:text-ink-muted"
        />
        <input
          name={maxName}
          type="number"
          defaultValue={maxDefault}
          placeholder="Máx."
          className="w-1/2 rounded-brand border border-border bg-surface-page px-3 py-2 text-ink placeholder:text-ink-muted"
        />
      </div>
    </div>
  );
}

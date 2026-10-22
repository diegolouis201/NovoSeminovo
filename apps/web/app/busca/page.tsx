import { ListingCard } from "@/components/ListingCard";
import { fetchListings, fetchPopularBrands } from "@/lib/api";
import { getFavoriteContext } from "@/lib/favorites";
import { saveSearchAction } from "@/lib/actions/saved-searches";
import { VEHICLE_CONDITION_OPTIONS, VEHICLE_FEATURE_OPTIONS } from "@novoseminovo/shared-types";
import { FUEL_OPTIONS, PROPERTY_TYPE_OPTIONS, TRANSMISSION_OPTIONS } from "@/lib/vehicle-options";

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
    brand?: string;
    transmission?: string;
    fuelType?: string;
    mileageMax?: string;
    propertyType?: string;
    features?: string | string[];
    conditions?: string | string[];
    noAuction?: string;
    buscaSalva?: string;
  };
};

// Filtros de condição/opcional que mais pesam na decisão — a lista completa
// fica só no formulário de anunciar, pra barra lateral não virar um muro.
const CONDITION_FILTERS = ["single_owner", "ipva_paid", "licensed", "dealer_serviced", "factory_warranty", "accepts_trade"];
const FEATURE_FILTERS = ["air_conditioning", "multimedia", "rear_camera", "parking_sensor", "leather_seats", "sunroof", "four_wheel_drive"];

function asList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : value.split(",")).filter(Boolean);
}

const PROPERTY_TYPE_LABEL: Record<string, string> = {
  house: "Casas",
  apartment: "Apartamentos",
  land: "Terrenos",
  commercial: "Comercial",
};

function toNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const assetType = searchParams.assetType === "property" ? "property" : searchParams.assetType === "vehicle" ? "vehicle" : undefined;
  const isProperty = assetType === "property";
  const priceMin = toNumber(searchParams.priceMin);
  const priceMax = toNumber(searchParams.priceMax);
  const yearMin = toNumber(searchParams.yearMin);
  const yearMax = toNumber(searchParams.yearMax);
  const bedroomsMin = toNumber(searchParams.bedroomsMin);
  const mileageMax = toNumber(searchParams.mileageMax);
  const features = asList(searchParams.features);
  const conditions = asList(searchParams.conditions);
  const noAuction = searchParams.noAuction === "1";

  const [results, { isAuthenticated, favoriteIds }, popularBrands] = await Promise.all([
    fetchListings({
      assetType,
      q: searchParams.q,
      city: searchParams.city || undefined,
      priceMin,
      priceMax,
      ...(isProperty
        ? { bedroomsMin, propertyType: searchParams.propertyType }
        : {
            yearMin,
            yearMax,
            brand: searchParams.brand,
            transmission: searchParams.transmission,
            fuelType: searchParams.fuelType,
            mileageMax,
            features: features.join(",") || undefined,
            conditions: conditions.join(",") || undefined,
            noAuction: noAuction ? ("1" as const) : undefined,
          }),
    }),
    getFavoriteContext(),
    isProperty ? Promise.resolve([]) : fetchPopularBrands(),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-display text-2xl font-semibold text-ink">
        {searchParams.brand
          ? `${searchParams.brand} — Carros`
          : PROPERTY_TYPE_LABEL[searchParams.propertyType ?? ""]
            ? `${PROPERTY_TYPE_LABEL[searchParams.propertyType ?? ""]}`
            : assetType === "property"
              ? "Imóveis"
              : assetType === "vehicle"
                ? "Carros"
                : "Todos os anúncios"}
        <span className="ml-2 text-base font-normal text-ink-muted">({results.length} resultados)</span>
      </h1>

      {searchParams.buscaSalva && (
        <p className="mt-4 rounded-brand bg-brand-green/10 px-4 py-3 text-sm font-semibold text-brand-green">
          Busca salva! Encontre ela em{" "}
          <a href="/conta/buscas-salvas" className="underline">
            Minhas buscas salvas
          </a>
          .
        </p>
      )}

      <div className="mt-6 flex flex-col gap-8 md:flex-row">
        <aside className="flex w-full shrink-0 flex-col gap-4 rounded-brand border border-border bg-surface-raised p-4 md:w-64">
          <h2 className="text-sm font-bold text-ink">Filtros</h2>
          <form action="/busca" className="flex flex-col gap-4">
            {searchParams.q && <input type="hidden" name="q" value={searchParams.q} />}
            {assetType && <input type="hidden" name="assetType" value={assetType} />}

            {isProperty ? (
              <SelectGroup
                label="Tipo de imóvel"
                name="propertyType"
                options={PROPERTY_TYPE_OPTIONS}
                defaultValue={searchParams.propertyType}
              />
            ) : (
              <SelectGroup
                label="Marca"
                name="brand"
                options={popularBrands.map((brand) => ({ value: brand, label: brand }))}
                defaultValue={searchParams.brand}
              />
            )}

            <RangeGroup
              label="Preço"
              minName="priceMin"
              maxName="priceMax"
              minDefault={searchParams.priceMin}
              maxDefault={searchParams.priceMax}
            />
            {isProperty ? (
              <FilterGroup label="Quartos (mín.)" name="bedroomsMin" placeholder="Qualquer" defaultValue={searchParams.bedroomsMin} />
            ) : (
              <>
                <RangeGroup
                  label="Ano"
                  minName="yearMin"
                  maxName="yearMax"
                  minDefault={searchParams.yearMin}
                  maxDefault={searchParams.yearMax}
                />
                <SelectGroup label="Câmbio" name="transmission" options={TRANSMISSION_OPTIONS} defaultValue={searchParams.transmission} />
                <SelectGroup label="Combustível" name="fuelType" options={FUEL_OPTIONS} defaultValue={searchParams.fuelType} />
                <FilterGroup
                  label="Km máxima"
                  name="mileageMax"
                  placeholder="Qualquer"
                  defaultValue={searchParams.mileageMax}
                  type="number"
                />
                <CheckGroup
                  label="Condições"
                  name="conditions"
                  options={VEHICLE_CONDITION_OPTIONS.filter((option) => CONDITION_FILTERS.includes(option.value))}
                  selected={conditions}
                />
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" name="noAuction" value="1" defaultChecked={noAuction} />
                  Sem passagem por leilão
                </label>
                <CheckGroup
                  label="Opcionais"
                  name="features"
                  options={VEHICLE_FEATURE_OPTIONS.filter((option) => FEATURE_FILTERS.includes(option.value))}
                  selected={features}
                />
              </>
            )}
            <FilterGroup label="Cidade" name="city" placeholder="Belo Horizonte" defaultValue={searchParams.city} />

            <button
              type="submit"
              className="rounded-brand bg-brand-green px-4 py-2 text-sm font-bold text-on-green hover:opacity-90"
            >
              Filtrar
            </button>
            {isAuthenticated && assetType && (
              <button
                type="submit"
                formAction={saveSearchAction}
                className="rounded-brand border border-border px-4 py-2 text-sm font-bold text-ink hover:bg-surface-sober"
              >
                Salvar esta busca
              </button>
            )}
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
  type = "text",
}: {
  label: string;
  name: string;
  placeholder: string;
  defaultValue?: string;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-semibold text-ink">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="rounded-brand border border-border bg-surface-page px-3 py-2 text-ink placeholder:text-ink-muted"
      />
    </label>
  );
}

function CheckGroup({
  label,
  name,
  options,
  selected,
}: {
  label: string;
  name: string;
  options: readonly { value: string; label: string }[];
  selected: string[];
}) {
  return (
    <fieldset className="flex flex-col gap-1 text-sm">
      <legend className="mb-1 font-semibold text-ink">{label}</legend>
      {options.map((option) => (
        <label key={option.value} className="flex items-center gap-2 text-ink">
          <input type="checkbox" name={name} value={option.value} defaultChecked={selected.includes(option.value)} />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

function SelectGroup({
  label,
  name,
  options,
  defaultValue,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-semibold text-ink">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        className="rounded-brand border border-border bg-surface-page px-3 py-2 text-ink"
      >
        <option value="">Qualquer</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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

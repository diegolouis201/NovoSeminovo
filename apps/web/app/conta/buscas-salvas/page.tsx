import Link from "next/link";
import { redirect } from "next/navigation";
import type { SavedSearch } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { fetchMySavedSearches } from "@/lib/api";
import { deleteSavedSearchAction, toggleSavedSearchAlertAction } from "@/lib/actions/saved-searches";

function toSearchUrl(savedSearch: SavedSearch): string {
  const query = new URLSearchParams({ assetType: savedSearch.assetType });
  for (const [key, value] of Object.entries(savedSearch.filters)) {
    if (value !== undefined) query.set(key, String(value));
  }
  return `/busca?${query.toString()}`;
}

function describeFilters(savedSearch: SavedSearch): string {
  const { filters } = savedSearch;
  const parts: string[] = [savedSearch.assetType === "property" ? "Imóveis" : "Carros"];
  if (filters.q) parts.push(`"${filters.q}"`);
  if (filters.city) parts.push(filters.city);
  if (filters.priceMin || filters.priceMax) {
    parts.push(`R$ ${filters.priceMin ?? "0"} — ${filters.priceMax ?? "sem limite"}`);
  }
  if (filters.yearMin || filters.yearMax) {
    parts.push(`Ano ${filters.yearMin ?? "—"} a ${filters.yearMax ?? "—"}`);
  }
  if (filters.bedroomsMin) parts.push(`${filters.bedroomsMin}+ quartos`);
  return parts.join(" · ");
}

export default async function SavedSearchesPage() {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const savedSearches = await fetchMySavedSearches(session.accessToken);

  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="font-display text-2xl font-semibold text-ink">Minhas buscas salvas</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Avisar por e-mail quando surgir um anúncio novo ainda não está pronto — por enquanto, salve os
        filtros e reabra a busca quando quiser.
      </p>

      {savedSearches.length === 0 ? (
        <p className="mt-6 text-ink-muted">
          Nenhuma busca salva ainda.{" "}
          <Link href="/busca" className="font-semibold text-brand-blue">
            Vá até a busca e ajuste os filtros
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {savedSearches.map((savedSearch) => (
            <SavedSearchCard key={savedSearch.id} savedSearch={savedSearch} />
          ))}
        </ul>
      )}
    </main>
  );
}

function SavedSearchCard({ savedSearch }: { savedSearch: SavedSearch }) {
  const toggleAction = toggleSavedSearchAlertAction.bind(null, savedSearch.id);
  const deleteAction = deleteSavedSearchAction.bind(null, savedSearch.id);

  return (
    <li className="flex flex-col gap-3 rounded-brand border border-border bg-surface-raised p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <Link href={toSearchUrl(savedSearch)} className="font-semibold text-ink hover:underline">
          {describeFilters(savedSearch)}
        </Link>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <form action={toggleAction}>
          <input type="hidden" name="alertEnabled" value={(!savedSearch.alertEnabled).toString()} />
          <Button type="submit" variant="ghost" className="text-xs">
            {savedSearch.alertEnabled ? "Alerta ligado" : "Alerta desligado"}
          </Button>
        </form>
        <form action={deleteAction}>
          <Button type="submit" variant="ghost" className="text-xs">
            Excluir
          </Button>
        </form>
      </div>
    </li>
  );
}

"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState, useTransition } from "react";
import { List, MapTrifold } from "@phosphor-icons/react";
import type { ListingSummary } from "@novoseminovo/shared-types";
import { ListingCard } from "@/components/ListingCard";
import { searchPropertiesInAreaAction } from "@/lib/actions/listings";
import type { SearchParams } from "@/lib/api";

// Busca de imóveis estilo QuintoAndar: lista à esquerda, mapa à direita.
// Mexeu no mapa (arrastar/zoom) → a lista passa a mostrar só o que está na
// área visível ("Buscar ao mover o mapa", ligado por padrão). No celular,
// alterna entre Lista e Mapa.

const PropertyMap = dynamic(() => import("@/components/map/PropertyMap"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center bg-surface-sober text-sm text-ink-muted">Carregando o mapa…</div>,
});

export function PropertyMapSearch({
  initialListings,
  params,
  isAuthenticated,
  favoriteIds,
}: {
  initialListings: ListingSummary[];
  params: SearchParams;
  isAuthenticated: boolean;
  favoriteIds: string[];
}) {
  const [listings, setListings] = useState(initialListings);
  const [hoveredId, setHoveredId] = useState<string>();
  const [searchOnMove, setSearchOnMove] = useState(true);
  const [inArea, setInArea] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const [pending, startTransition] = useTransition();
  const searchOnMoveRef = useRef(searchOnMove);
  searchOnMoveRef.current = searchOnMove;
  const latest = useRef(0);
  const favorites = new Set(favoriteIds);

  const onBoundsChange = useCallback(
    (bbox: string) => {
      if (!searchOnMoveRef.current) return;
      const ticket = ++latest.current;
      startTransition(async () => {
        const found = await searchPropertiesInAreaAction(params, bbox);
        if (ticket !== latest.current) return; // chegou uma busca mais nova
        setListings(found);
        setInArea(true);
      });
    },
    // params muda só com nova navegação (o componente remonta)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const located = listings.filter((listing) => listing.lat != null).length;

  return (
    <div className="mt-4">
      <div className="mb-3 flex items-center justify-between gap-3 lg:hidden">
        <span className="text-sm text-ink-muted">{listings.length} imóveis</span>
        <span className="inline-flex gap-1 rounded-full bg-surface-sober p-1 text-sm font-semibold">
          <button type="button" onClick={() => setMobileView("list")} className={`flex items-center gap-1 rounded-full px-3 py-1.5 ${mobileView === "list" ? "bg-surface-raised text-ink shadow-card" : "text-ink-muted"}`}>
            <List size={16} /> Lista
          </button>
          <button type="button" onClick={() => setMobileView("map")} className={`flex items-center gap-1 rounded-full px-3 py-1.5 ${mobileView === "map" ? "bg-surface-raised text-ink shadow-card" : "text-ink-muted"}`}>
            <MapTrifold size={16} /> Mapa
          </button>
        </span>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-6">
        <section className={`${mobileView === "map" ? "hidden" : ""} lg:block`} aria-busy={pending}>
          <p className="mb-3 hidden text-sm text-ink-muted lg:block">
            {pending ? "Atualizando…" : inArea ? `${listings.length} imóveis nesta área do mapa` : `${listings.length} imóveis encontrados`}
          </p>
          <div className={`grid grid-cols-1 justify-items-center gap-5 sm:grid-cols-2 ${pending ? "opacity-60" : ""}`}>
            {listings.map((listing) => (
              <div key={listing.id} onMouseEnter={() => setHoveredId(listing.id)} onMouseLeave={() => setHoveredId(undefined)} className="w-full max-w-[280px]">
                <ListingCard listing={listing} isFavorited={favorites.has(listing.id)} isAuthenticated={isAuthenticated} />
              </div>
            ))}
          </div>
          {listings.length === 0 && (
            <p className="text-ink-muted">{inArea ? "Nenhum imóvel nesta área — afaste o zoom ou mova o mapa." : "Nenhum imóvel encontrado com esses filtros."}</p>
          )}
        </section>

        <section className={`${mobileView === "list" ? "hidden" : ""} lg:block`}>
          <div className="relative isolate h-[70vh] overflow-hidden rounded-brand-lg border border-border lg:sticky lg:top-4 lg:h-[calc(100vh-8rem)]">
            <PropertyMap listings={listings} hoveredId={hoveredId} onBoundsChange={onBoundsChange} />
            <label className="absolute left-1/2 top-3 z-[1000] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-white px-4 py-2 text-xs font-semibold text-[#20261b] shadow-card sm:text-sm">
              <input type="checkbox" checked={searchOnMove} onChange={(event) => setSearchOnMove(event.target.checked)} />
              Buscar ao mover o mapa
            </label>
            {located < listings.length && !inArea && (
              <p className="absolute bottom-3 left-3 z-[1000] rounded-brand bg-white px-3 py-1.5 text-xs text-[#20261b] shadow-card">
                {listings.length - located} imóvel(is) ainda sem localização no mapa
              </p>
            )}
          </div>
          <p className="mt-1 text-xs text-ink-muted">Localização aproximada — o endereço exato é passado pelo anunciante.</p>
        </section>
      </div>
    </div>
  );
}

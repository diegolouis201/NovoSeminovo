"use client";

import type { ReactNode, TouchEvent } from "react";
import { useRef, useState } from "react";
import { CaretLeft, CaretRight, Car, House } from "@phosphor-icons/react/dist/ssr";
import type { Photo } from "@novoseminovo/shared-types";
import { resolveMediaUrl } from "@/lib/api";

// Carrossel da página de anúncio: antes disso a "miniatura" abaixo da foto
// principal não fazia nada (só decorativa) e não dava pra passar as fotos —
// a única imagem visível era sempre listing.photos[0]. Agora clicar numa
// miniatura, ou nas setas, troca a foto em destaque; em celular também dá
// pra arrastar o dedo (swipe) pra trocar.
export function PhotoCarousel({
  photos,
  title,
  assetType,
  favoriteSlot,
}: {
  photos: Photo[];
  title: string;
  assetType: "vehicle" | "property";
  favoriteSlot?: ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  function goTo(nextIndex: number) {
    setIndex((nextIndex + photos.length) % photos.length);
  }

  function handleTouchStart(event: TouchEvent) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(event: TouchEvent) {
    if (touchStartX.current === null) return;
    const deltaX = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(deltaX) < 40) return;
    goTo(deltaX > 0 ? index - 1 : index + 1);
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className="relative flex h-72 items-center justify-center overflow-hidden rounded-brand-lg bg-surface-sober text-6xl md:h-96"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {photos[index] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveMediaUrl(photos[index].url)}
            alt={photos[index].caption || `Foto ${index + 1} de ${title}`}
            className="h-full w-full object-cover"
          />
        ) : assetType === "property" ? (
          <House size={64} weight="duotone" className="text-ink-muted" />
        ) : (
          <Car size={64} weight="duotone" className="text-ink-muted" />
        )}

        {photos.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Foto anterior"
              onClick={() => goTo(index - 1)}
              className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink hover:bg-white"
            >
              <CaretLeft size={18} weight="bold" />
            </button>
            <button
              type="button"
              aria-label="Próxima foto"
              onClick={() => goTo(index + 1)}
              className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink hover:bg-white"
            >
              <CaretRight size={18} weight="bold" />
            </button>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-2.5 py-1 text-xs font-semibold text-white">
              {index + 1} / {photos.length}
            </div>
          </>
        )}

        {favoriteSlot && <div className="absolute right-3 top-3">{favoriteSlot}</div>}
      </div>

      {photos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {photos.map((photo, photoIndex) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setIndex(photoIndex)}
              aria-label={`Ver foto ${photoIndex + 1}`}
              aria-current={photoIndex === index}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-brand border-2 ${
                photoIndex === index ? "border-brand-green" : "border-transparent"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveMediaUrl(photo.url)}
                alt={`Foto ${photoIndex + 1} de ${title}`}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

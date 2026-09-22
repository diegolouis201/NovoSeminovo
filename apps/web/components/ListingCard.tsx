import Link from "next/link";
import type { ListingSummary } from "@novoseminovo/shared-types";
import { Badge } from "@/components/Badge";

// Mesma anatomia para Carro e Imóvel — só o conteúdo injetado muda.
// Ver components/ListingCard/README.md no design system (Etapa 4).
export function ListingCard({ listing }: { listing: ListingSummary }) {
  return (
    <Link
      href={`/anuncio/${listing.id}`}
      className="block w-full max-w-[280px] overflow-hidden rounded-brand bg-surface-raised text-ink shadow-card transition-transform hover:-translate-y-0.5"
    >
      <div className="relative flex h-40 items-center justify-center bg-surface-sober text-4xl">
        {listing.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={listing.image} alt={listing.title} className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden>{listing.assetType === "property" ? "🏠" : "🚗"}</span>
        )}
        <button
          type="button"
          aria-label="Favoritar"
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-ink"
        >
          ♡
        </button>
        {listing.badge && (
          <div className="absolute left-2 top-2">
            <Badge label={listing.badge.label} tone={listing.badge.tone} />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1 p-4">
        <h3 className="text-base font-bold">{listing.title}</h3>
        {listing.subtitle && <p className="text-sm text-ink-muted">{listing.subtitle}</p>}
        <p className="mt-1 text-xl font-extrabold [font-variant-numeric:tabular-nums]">
          {listing.priceLabel}
        </p>
        <div className="mt-2 flex items-center justify-between text-xs text-ink-muted">
          <span>{listing.location}</span>
          {listing.sellerType && (
            <span className={listing.sellerType === "partner" ? "font-bold text-brand-blue" : ""}>
              {listing.sellerType === "partner" ? "Loja verificada" : "Particular"}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

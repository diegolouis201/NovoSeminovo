import { notFound } from "next/navigation";
import { Sparkle } from "@phosphor-icons/react/dist/ssr";
import type { ListingSummary, Review } from "@novoseminovo/shared-types";
import { ListingCard } from "@/components/ListingCard";
import { fetchPartnerStorefront, resolveMediaUrl } from "@/lib/api";
import { getFavoriteContext } from "@/lib/favorites";

const PARTNER_TYPE_LABEL: Record<string, string> = {
  dealership: "Loja de veículos",
  real_estate_agency: "Imobiliária",
  broker: "Corretor(a) autônomo(a)",
};

export default async function PartnerStorefrontPage({ params }: { params: { slug: string } }) {
  const [storefront, { isAuthenticated, favoriteIds }] = await Promise.all([
    fetchPartnerStorefront(params.slug),
    getFavoriteContext(),
  ]);
  if (!storefront) notFound();

  // Destaques escolhidos pela IA (ver AiService.curateStorefrontHighlights)
  // — sempre um subconjunto de storefront.listings; tirados da lista comum
  // abaixo pra não aparecer duplicado na página.
  const highlighted = storefront.highlights
    .map((highlight) => ({
      reason: highlight.reason,
      listing: storefront.listings.find((listing) => listing.id === highlight.listingId),
    }))
    .filter((item): item is { reason: string; listing: ListingSummary } => Boolean(item.listing));
  const highlightedIds = new Set(highlighted.map((item) => item.listing.id));
  const remainingListings = storefront.listings.filter((listing) => !highlightedIds.has(listing.id));

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-col gap-4 rounded-brand-lg bg-surface-sober p-6 sm:flex-row sm:items-center">
        {storefront.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveMediaUrl(storefront.logoUrl)}
            alt={`Logo de ${storefront.legalName}`}
            className="h-20 w-20 shrink-0 rounded-brand border border-border bg-surface-raised object-cover"
          />
        )}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold text-ink">{storefront.legalName}</h1>
            {storefront.verified && (
              <span className="rounded-full bg-brand-blue px-3 py-1 text-xs font-bold text-on-blue">
                Loja verificada
              </span>
            )}
          </div>
          <p className="text-sm text-ink-muted">
            {PARTNER_TYPE_LABEL[storefront.type] ?? storefront.type}
            {storefront.averageRating !== undefined && (
              <>
                {" · "}
                <span className="font-semibold text-ink">★ {storefront.averageRating.toFixed(1)}</span>{" "}
                ({storefront.reviews.length} avaliaç{storefront.reviews.length === 1 ? "ão" : "ões"})
              </>
            )}
          </p>
          {storefront.description && <p className="mt-3 text-ink">{storefront.description}</p>}
          {storefront.address && <p className="mt-1 text-sm text-ink-muted">{storefront.address}</p>}
        </div>
      </div>

      {highlighted.length > 0 && (
        <section className="mt-8">
          <h2 className="flex items-center gap-1.5 font-display text-xl font-semibold text-ink">
            <Sparkle size={18} weight="fill" className="text-brand-green" />
            Destaques
          </h2>
          <div className="mt-4 flex flex-wrap gap-5">
            {highlighted.map(({ listing, reason }) => (
              <div key={listing.id} className="flex w-[280px] flex-col gap-1.5">
                <ListingCard listing={listing} isFavorited={favoriteIds.has(listing.id)} isAuthenticated={isAuthenticated} />
                <p className="text-center text-xs font-semibold text-brand-green">{reason}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <h2 className="mt-10 font-display text-xl font-semibold text-ink">
        Anúncios <span className="text-base font-normal text-ink-muted">({storefront.listings.length})</span>
      </h2>

      {storefront.listings.length === 0 ? (
        <p className="mt-4 text-ink-muted">Nenhum anúncio ativo no momento.</p>
      ) : remainingListings.length === 0 ? (
        <p className="mt-4 text-ink-muted">Todos os anúncios ativos já estão em destaque acima.</p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-5">
          {remainingListings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              isFavorited={favoriteIds.has(listing.id)}
              isAuthenticated={isAuthenticated}
            />
          ))}
        </div>
      )}

      <h2 className="mt-10 font-display text-xl font-semibold text-ink">
        Avaliações <span className="text-base font-normal text-ink-muted">({storefront.reviews.length})</span>
      </h2>

      {storefront.reviews.length === 0 ? (
        <p className="mt-4 text-ink-muted">Ainda sem avaliações.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {storefront.reviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </ul>
      )}
    </main>
  );
}

function ReviewCard({ review }: { review: Review }) {
  return (
    <li className="rounded-brand border border-border bg-surface-raised p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">{review.reviewerName}</p>
        <span className="text-sm font-bold text-brand-blue">{"★".repeat(review.rating)}</span>
      </div>
      {review.comment && <p className="mt-1 text-sm text-ink">{review.comment}</p>}
    </li>
  );
}

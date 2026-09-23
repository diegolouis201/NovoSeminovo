import { notFound } from "next/navigation";
import type { Review } from "@novoseminovo/shared-types";
import { ListingCard } from "@/components/ListingCard";
import { fetchPartnerStorefront } from "@/lib/api";
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

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <div className="rounded-brand-lg bg-surface-sober p-6">
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

      <h2 className="mt-8 font-display text-xl font-semibold text-ink">
        Anúncios <span className="text-base font-normal text-ink-muted">({storefront.listings.length})</span>
      </h2>

      {storefront.listings.length === 0 ? (
        <p className="mt-4 text-ink-muted">Nenhum anúncio ativo no momento.</p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-5">
          {storefront.listings.map((listing) => (
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

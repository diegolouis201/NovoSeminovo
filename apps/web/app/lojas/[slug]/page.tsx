import { notFound } from "next/navigation";
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
        <p className="text-sm text-ink-muted">{PARTNER_TYPE_LABEL[storefront.type] ?? storefront.type}</p>
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
    </main>
  );
}

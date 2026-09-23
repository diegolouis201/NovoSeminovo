import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { FavoriteButton } from "@/components/FavoriteButton";
import { FinancingCallout } from "@/components/FinancingCallout";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { fetchListing, resolveMediaUrl } from "@/lib/api";
import { getFavoriteContext } from "@/lib/favorites";
import { startConversationAction } from "@/lib/actions/conversations";

export default async function ListingDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erroConversa?: string; denunciaEnviada?: string; avaliacaoEnviada?: string };
}) {
  // Precisa vir antes do fetchListing: sem o accessToken, o dono não vê o
  // próprio anúncio pendente de moderação (a API só libera pra dono/admin).
  const session = await auth();
  const [listing, { isAuthenticated, favoriteIds }] = await Promise.all([
    fetchListing(params.id, session?.accessToken),
    getFavoriteContext(),
  ]);
  if (!listing) notFound();

  const isOwnListing = session?.user?.id === listing.ownerUserId;
  const startConversationWithListing = startConversationAction.bind(null, listing.id);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      {isOwnListing && listing.status === "pending_review" && (
        <p className="mb-6 rounded-brand bg-brand-orange/10 px-4 py-3 text-sm font-semibold text-brand-orange">
          Seu anúncio está em análise — ele só aparece na busca depois de aprovado pela moderação.
        </p>
      )}
      {isOwnListing && listing.status === "rejected" && (
        <p className="mb-6 rounded-brand bg-status-danger/10 px-4 py-3 text-sm font-semibold text-status-danger">
          Este anúncio foi recusado pela moderação e não aparece na busca.
        </p>
      )}
      {isOwnListing && listing.status === "sold" && (
        <p className="mb-6 rounded-brand bg-brand-blue/10 px-4 py-3 text-sm font-semibold text-brand-blue">
          Este anúncio foi marcado como vendido e não aparece mais na busca.
        </p>
      )}
      {searchParams.denunciaEnviada && (
        <p className="mb-6 rounded-brand bg-brand-green/10 px-4 py-3 text-sm font-semibold text-brand-green">
          Denúncia enviada. Nossa moderação vai analisar este anúncio.
        </p>
      )}
      {searchParams.avaliacaoEnviada && (
        <p className="mb-6 rounded-brand bg-brand-green/10 px-4 py-3 text-sm font-semibold text-brand-green">
          Avaliação enviada. Obrigado pelo retorno!
        </p>
      )}
      <div className="grid gap-8 md:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <div className="relative flex h-72 items-center justify-center overflow-hidden rounded-brand-lg bg-surface-sober text-6xl md:h-96">
            {listing.photos[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resolveMediaUrl(listing.photos[0].url)} alt={listing.title} className="h-full w-full object-cover" />
            ) : (
              <span aria-hidden>{listing.assetType === "property" ? "🏠" : "🚗"}</span>
            )}
            <div className="absolute right-3 top-3">
              <FavoriteButton
                listingId={listing.id}
                initialFavorited={favoriteIds.has(listing.id)}
                isAuthenticated={isAuthenticated}
              />
            </div>
          </div>
          {listing.photos.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {listing.photos.map((photo, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={photo.id}
                  src={resolveMediaUrl(photo.url)}
                  alt={`Foto ${index + 1} de ${listing.title}`}
                  className="h-16 w-16 shrink-0 rounded-brand border border-border object-cover"
                />
              ))}
            </div>
          )}
          {isOwnListing && (
            <Link
              href={`/anuncio/${listing.id}/fotos`}
              className="self-start text-sm font-semibold text-brand-blue hover:underline"
            >
              {listing.photos.length > 0 ? "Gerenciar fotos" : "Adicionar fotos"}
            </Link>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {listing.badge && <Badge label={listing.badge.label} tone={listing.badge.tone} />}
              <span className="text-sm text-ink-muted">{listing.location}</span>
            </div>
            <h1 className="font-display text-3xl font-bold text-ink">{listing.title}</h1>
            <p className="text-2xl font-extrabold [font-variant-numeric:tabular-nums]">
              {listing.priceLabel}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-brand border border-border bg-surface-raised p-4 sm:grid-cols-3">
            {listing.specs.map((spec) => (
              <div key={spec.label}>
                <dt className="text-xs text-ink-muted">{spec.label}</dt>
                <dd className="text-sm font-semibold text-ink">{spec.value}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-col gap-2">
            <h2 className="font-display text-xl font-semibold text-ink">Descrição</h2>
            <p className="text-ink">{listing.description}</p>
          </div>
        </div>

        <aside className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 rounded-brand border border-border bg-surface-raised p-4">
            {listing.sellerType === "partner" && listing.partnerSlug ? (
              <Link
                href={`/lojas/${listing.partnerSlug}`}
                className="text-sm font-semibold text-brand-blue hover:underline"
              >
                {listing.partnerVerified ? "Loja verificada" : "Loja parceira"} — ver vitrine
              </Link>
            ) : (
              <p className="text-sm font-semibold text-ink">
                {listing.sellerType === "partner" ? "Loja parceira" : "Anunciante particular"}
              </p>
            )}
            {searchParams.erroConversa && (
              <p className="rounded-brand bg-status-danger/10 px-3 py-2 text-xs text-status-danger">
                {searchParams.erroConversa}
              </p>
            )}
            {isOwnListing ? (
              <Link
                href="/conta/anuncios"
                className="rounded-brand border border-border px-4 py-3 text-center text-sm font-bold text-ink hover:bg-surface-sober"
              >
                Este é o seu anúncio
              </Link>
            ) : isAuthenticated ? (
              <form action={startConversationWithListing}>
                <Button type="submit" variant="primary" className="w-full justify-center">
                  Conversar no chat
                </Button>
              </form>
            ) : (
              <Link
                href="/entrar"
                className="rounded-brand bg-brand-green px-4 py-3 text-center text-sm font-bold text-on-green hover:opacity-90"
              >
                Entrar para conversar
              </Link>
            )}
            {!isOwnListing && listing.sellerPhone && (
              <WhatsAppButton listingId={listing.id} phone={listing.sellerPhone} listingTitle={listing.title} />
            )}
            {listing.reviewStatus === "can_review" && (
              <Link
                href={`/anuncio/${listing.id}/avaliar`}
                className="text-center text-sm font-semibold text-brand-blue hover:underline"
              >
                Avaliar anunciante
              </Link>
            )}
            {listing.reviewStatus === "already_reviewed" && (
              <p className="text-center text-sm text-ink-muted">Você já avaliou este anunciante.</p>
            )}
            {!isOwnListing && isAuthenticated && (
              <Link
                href={`/anuncio/${listing.id}/denunciar`}
                className="text-center text-xs text-ink-muted hover:underline"
              >
                Denunciar anúncio
              </Link>
            )}
          </div>

          <FinancingCallout
            listingId={listing.id}
            assetType={listing.assetType}
            price={listing.financing.price}
            priceValue={listing.financing.priceValue}
            downPayment={listing.financing.downPayment}
            installments={listing.financing.installments}
            rate={listing.financing.rate}
          />
        </aside>
      </div>
    </main>
  );
}

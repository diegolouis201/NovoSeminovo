import Link from "next/link";
import { notFound } from "next/navigation";
import { Bank, Car, House, IdentificationCard } from "@phosphor-icons/react/dist/ssr";
import { auth } from "@/auth";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { ConsorcioCallout } from "@/components/ConsorcioCallout";
import { FavoriteButton } from "@/components/FavoriteButton";
import { FinancingCallout } from "@/components/FinancingCallout";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { fetchListing, resolveMediaUrl } from "@/lib/api";
import { getFavoriteContext } from "@/lib/favorites";
import { startConversationAction } from "@/lib/actions/conversations";

// Parceria com a Loft/CrediHome pra crédito imobiliário de verdade (bancos
// reais, proposta de verdade) — diferente do FinancingCallout abaixo, que é
// só uma calculadora local sem integração bancária nenhuma. Só faz sentido
// pra imóvel: não existe parceria equivalente pra veículo ainda.
const CREDIHOME_SIMULATOR_URL = "https://simular.credihome.com.br/novoseminovo";

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
            ) : listing.assetType === "property" ? (
              <House size={64} weight="duotone" className="text-ink-muted" />
            ) : (
              <Car size={64} weight="duotone" className="text-ink-muted" />
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
          {listing.vehicleId && (
            <Link
              href={`/veiculo/${listing.vehicleId}`}
              className="inline-flex w-fit items-center gap-1.5 self-start rounded-full bg-surface-sober px-3 py-1.5 text-sm font-semibold text-brand-blue hover:underline"
            >
              <IdentificationCard size={16} weight="bold" />
              Ver histórico completo deste veículo
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

          {listing.assetType === "property" && (
            <a
              href={CREDIHOME_SIMULATOR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full max-w-sm items-center justify-center gap-2 rounded-brand border border-brand-blue px-4 py-3 text-sm font-bold text-brand-blue transition-colors hover:bg-brand-blue hover:text-on-blue"
            >
              <Bank size={18} weight="bold" />
              Simular crédito com um banco de verdade
            </a>
          )}

          <ConsorcioCallout assetType={listing.assetType} />
        </aside>
      </div>
    </main>
  );
}

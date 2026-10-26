import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { listingTier } from "@novoseminovo/shared-types";
import { cache } from "react";
import { IdentificationCard, PaintBrushHousehold } from "@phosphor-icons/react/dist/ssr";
import { auth } from "@/auth";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { ConsorcioCallout } from "@/components/ConsorcioCallout";
import { CredihomeSimulator } from "@/components/CredihomeSimulator";
import { FavoriteButton } from "@/components/FavoriteButton";
import { FinancingCallout } from "@/components/FinancingCallout";
import { PhotoCarousel } from "@/components/PhotoCarousel";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { confirmListingBoost, fetchListing, resolveMediaUrl } from "@/lib/api";
import { getFavoriteContext } from "@/lib/favorites";
import { startConversationAction } from "@/lib/actions/conversations";


// A prévia (generateMetadata) e a página pedem o mesmo anúncio na mesma
// requisição — cache() faz uma chamada só à API. Sem isso cada visita
// contaria duas visualizações no anúncio (ver ListingsService.getDetail).
const loadListing = cache(async (id: string) => {
  const session = await auth();
  return fetchListing(id, session?.accessToken);
});

// Prévia ao compartilhar o link (WhatsApp, Instagram, Facebook, Google):
// título com preço e cidade, e a foto de capa do próprio anúncio.
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const listing = await loadListing(params.id);
  if (!listing) return { title: "Anúncio não encontrado", robots: { index: false } };

  const title = `${listing.title} · ${listing.priceLabel}`;
  const summary = [listing.subtitle, listing.location].filter(Boolean).join(" · ");
  const description = `${summary}. ${listing.description}`.replace(/\s+/g, " ").slice(0, 200);
  const cover = listing.photos[0]?.url ?? listing.image;
  return {
    title,
    description,
    alternates: { canonical: `/anuncio/${listing.id}` },
    // Em análise, recusado ou vendido: a página existe (pro dono), mas não
    // deve entrar no Google.
    robots: listing.status === "active" ? undefined : { index: false, follow: false },
    openGraph: {
      type: "website",
      title,
      description,
      url: `/anuncio/${listing.id}`,
      // Sem foto, a prévia usa a imagem padrão do site (app/opengraph-image.tsx).
      images: [cover ? { url: resolveMediaUrl(cover), alt: listing.title } : { url: "/opengraph-image", width: 1200, height: 630 }],
    },
  };
}

export default async function ListingDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: {
    erroConversa?: string;
    denunciaEnviada?: string;
    avaliacaoEnviada?: string;
    publicado?: string;
    pagamento?: string;
    session_id?: string;
  };
}) {
  // Precisa vir antes do fetchListing: sem o accessToken, o dono não vê o
  // próprio anúncio pendente de moderação (a API só libera pra dono/admin).
  const session = await auth();

  // Voltou do checkout do plano do anúncio: confirma no Stripe e recarrega
  // numa URL limpa (sem session_id, pra não confirmar de novo no F5).
  if (searchParams.pagamento === "ok" && searchParams.session_id && session?.accessToken) {
    const confirmed = await confirmListingBoost(params.id, searchParams.session_id, session.accessToken);
    redirect(`/anuncio/${params.id}?pagamento=${confirmed ? "confirmado" : "pendente"}`);
  }
  const [listing, { isAuthenticated, favoriteIds }] = await Promise.all([
    loadListing(params.id),
    getFavoriteContext(),
  ]);
  if (!listing) notFound();

  const isOwnListing = session?.user?.id === listing.ownerUserId;
  const startConversationWithListing = startConversationAction.bind(null, listing.id);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      {isOwnListing && listing.status === "pending_review" && (
        <p
          className={`mb-6 rounded-brand px-4 py-3 text-sm font-semibold ${
            searchParams.publicado ? "bg-brand-green/10 text-brand-green" : "bg-brand-orange/10 text-brand-orange"
          }`}
        >
          {searchParams.publicado
            ? "Anúncio enviado! Ele passa por uma revisão rápida e aparece na busca assim que for aprovado — você recebe um aviso."
            : "Seu anúncio está em análise — ele só aparece na busca depois de aprovado pela moderação."}
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
      {(searchParams.pagamento === "confirmado" || (searchParams.pagamento === "ok" && !searchParams.session_id)) && (
        <p className="mb-6 rounded-brand bg-brand-green/10 px-4 py-3 text-sm font-semibold text-brand-green">
          Pagamento confirmado — seu anúncio agora é {listingTier(listing.planTier).name}.
        </p>
      )}
      {searchParams.pagamento === "pendente" && (
        <p className="mb-6 rounded-brand bg-brand-orange/10 px-4 py-3 text-sm font-semibold text-brand-orange">
          Ainda não recebemos a confirmação do pagamento. Recarregue em alguns segundos.
        </p>
      )}
      {searchParams.pagamento === "cancelado" && (
        <p className="mb-6 rounded-brand bg-surface-sober px-4 py-3 text-sm text-ink-muted">
          Pagamento não concluído — o anúncio segue no plano {listingTier(listing.planTier).name}.{" "}
          <Link href={`/anuncio/${listing.id}/turbinar`} className="font-semibold text-brand-blue hover:underline">
            Tentar de novo
          </Link>
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
      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <PhotoCarousel
            photos={listing.photos}
            title={listing.title}
            assetType={listing.assetType}
            favoriteSlot={
              <FavoriteButton
                listingId={listing.id}
                initialFavorited={favoriteIds.has(listing.id)}
                isAuthenticated={isAuthenticated}
              />
            }
          />
          {listing.youtubeVideoId && (
            <div className="aspect-video w-full overflow-hidden rounded-brand bg-black">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${listing.youtubeVideoId}`}
                title={`Vídeo: ${listing.title}`}
                loading="lazy"
                allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
              />
            </div>
          )}
          {isOwnListing && !listing.isPartnerListing && listing.status !== "sold" && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-brand border border-border bg-surface-raised px-4 py-3 text-sm">
              <span className="text-ink">
                Plano do anúncio: <strong>{listingTier(listing.planTier).name}</strong>
                {listing.hiddenPhotosCount
                  ? ` · ${listing.hiddenPhotosCount} foto(s) suas não aparecem neste plano`
                  : ""}
              </span>
              {listing.planTier !== "nitro" && (
                <Link href={`/anuncio/${listing.id}/turbinar`} className="rounded-brand bg-brand-green px-3 py-1.5 font-bold text-on-green">
                  Turbinar anúncio
                </Link>
              )}
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

          {/* Imóvel: um bloco só de financiamento — parcelas dos bancos pela
              Credihome e, se o cliente quiser, o pedido de proposta. Veículo:
              calculadora local (ainda sem parceiro de crédito). */}
          {listing.financingEnabled && listing.assetType === "property" && (
            <CredihomeSimulator listingId={listing.id} price={listing.financing.priceValue} />
          )}

          {listing.financingEnabled && listing.assetType === "vehicle" && (
          <FinancingCallout
            listingId={listing.id}
            assetType={listing.assetType}
            price={listing.financing.price}
            priceValue={listing.financing.priceValue}
            downPayment={listing.financing.downPayment}
            installments={listing.financing.installments}
            rate={listing.financing.rate}
          />
          )}

          {listing.assetType === "property" && (
            <Link
              href={`/anuncio/${listing.id}/arquiteto`}
              className="flex w-full max-w-sm flex-col items-center gap-0.5 rounded-brand bg-brand-purple px-4 py-3 text-center text-on-purple transition-opacity hover:opacity-90"
            >
              <span className="flex items-center gap-2 text-sm font-bold">
                <PaintBrushHousehold size={20} weight="fill" /> Arquiteto NovoSeminovo
              </span>
              <span className="text-xs opacity-90">Veja como este imóvel ficaria reformado, com lista de compras</span>
            </Link>
          )}

          <ConsorcioCallout assetType={listing.assetType} />
        </aside>
      </div>
    </main>
  );
}

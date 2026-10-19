import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DownloadSimple, InstagramLogo } from "@phosphor-icons/react/dist/ssr";
import { auth } from "@/auth";
import { PhotoGallery } from "@/components/PhotoGallery";
import { SubmitButton } from "@/components/SubmitButton";
import { fetchAiStatus, fetchListing } from "@/lib/api";
import { uploadPhotosAction } from "@/lib/actions/listings";

export default async function ListingPhotosPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erro?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/entrar");

  const [listing, { aiEnabled }] = await Promise.all([fetchListing(params.id, session.accessToken), fetchAiStatus()]);
  if (!listing) notFound();
  if (listing.ownerUserId !== session.user.id) redirect(`/anuncio/${listing.id}`);

  const uploadAction = uploadPhotosAction.bind(null, listing.id);

  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="font-display text-2xl font-semibold text-ink">Fotos do anúncio</h1>
      <p className="mt-1 text-sm text-ink-muted">{listing.title}</p>

      {searchParams.erro && (
        <p className="mt-4 rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
          {searchParams.erro}
        </p>
      )}

      <div className="mt-6">
        <PhotoGallery
          listingId={listing.id}
          initialPhotos={listing.photos}
          aiEnabled={aiEnabled}
          assetType={listing.assetType}
        />
      </div>

      <form action={uploadAction} className="mt-6 flex flex-col gap-3 rounded-brand border border-border bg-surface-raised p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-ink">
            Adicionar fotos <span className="font-normal text-ink-muted">(JPEG, PNG ou WebP, até 5MB cada, no máximo 8 por envio)</span>
          </span>
          <input
            type="file"
            name="photos"
            accept="image/jpeg,image/png,image/webp"
            multiple
            required
            className="rounded-brand border border-border bg-surface-page px-3 py-2 text-ink"
          />
        </label>
        <SubmitButton pendingLabel="Enviando...">Enviar fotos</SubmitButton>
      </form>

      {listing.photos.length > 0 && <InstagramShareSection listingId={listing.id} photoCount={listing.photos.length} />}

      <Link href={`/anuncio/${listing.id}`} className="mt-6 inline-block text-sm font-semibold text-brand-blue">
        Voltar ao anúncio
      </Link>
    </main>
  );
}

const DOWNLOAD_LINK_CLASSES =
  "inline-flex items-center gap-2 rounded-brand bg-brand-blue px-4 py-3 text-sm font-bold text-on-blue transition-opacity hover:opacity-90";

function InstagramShareSection({ listingId, photoCount }: { listingId: string; photoCount: number }) {
  return (
    <section className="mt-6 rounded-brand border border-border bg-surface-raised p-4">
      <h2 className="flex items-center gap-1.5 font-display text-lg font-semibold text-ink">
        <InstagramLogo size={20} weight="fill" className="text-brand-blue" />
        Compartilhar no Instagram
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Baixe imagens prontas com o preço, o título e a localização do anúncio pra postar no feed, no story ou em
        carrossel.
      </p>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/social/${listingId}/feed`}
            alt="Pré-visualização do post de feed"
            className="h-40 w-40 rounded-brand border border-border object-cover"
          />
          <a href={`/api/social/${listingId}/feed`} download="novoseminovo-feed.jpg" className={DOWNLOAD_LINK_CLASSES}>
            <DownloadSimple size={16} weight="bold" />
            Feed (quadrado)
          </a>
        </div>

        <div className="flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/social/${listingId}/story`}
            alt="Pré-visualização do story"
            className="h-40 w-[90px] rounded-brand border border-border object-cover"
          />
          <a href={`/api/social/${listingId}/story`} download="novoseminovo-story.jpg" className={DOWNLOAD_LINK_CLASSES}>
            <DownloadSimple size={16} weight="bold" />
            Story
          </a>
        </div>
      </div>

      {photoCount > 1 && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-ink">Carrossel ({photoCount} fotos)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {Array.from({ length: photoCount }, (_, index) => (
              <a
                key={index}
                href={`/api/social/${listingId}/carousel/${index}`}
                download={`novoseminovo-carrossel-${index + 1}.jpg`}
                className="inline-flex items-center gap-1.5 rounded-brand border border-border bg-surface-page px-3 py-2 text-xs font-semibold text-ink transition-opacity hover:opacity-80"
              >
                <DownloadSimple size={14} weight="bold" />
                Foto {index + 1}
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

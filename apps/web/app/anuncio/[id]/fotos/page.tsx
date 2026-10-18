import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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

      <Link href={`/anuncio/${listing.id}`} className="mt-6 inline-block text-sm font-semibold text-brand-blue">
        Voltar ao anúncio
      </Link>
    </main>
  );
}

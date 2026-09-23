import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { fetchListing, resolveMediaUrl } from "@/lib/api";
import { deletePhotoAction, uploadPhotosAction } from "@/lib/actions/listings";

export default async function ListingPhotosPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erro?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/entrar");

  const listing = await fetchListing(params.id, session.accessToken);
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

      {listing.photos.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {listing.photos.map((photo, index) => (
            <div key={photo.id} className="relative overflow-hidden rounded-brand border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resolveMediaUrl(photo.url)} alt={`Foto ${index + 1} de ${listing.title}`} className="aspect-square w-full object-cover" />
              {index === 0 && (
                <span className="absolute left-2 top-2 rounded-full bg-brand-green px-2 py-0.5 text-[11px] font-bold text-on-green">
                  Capa
                </span>
              )}
              <form action={deletePhotoAction.bind(null, listing.id, photo.id)} className="absolute bottom-2 right-2">
                <Button type="submit" variant="ghost" className="bg-surface-raised px-2 py-1 text-xs">
                  Excluir
                </Button>
              </form>
            </div>
          ))}
        </div>
      )}

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
        <Button type="submit">Enviar fotos</Button>
      </form>

      <Link href={`/anuncio/${listing.id}`} className="mt-6 inline-block text-sm font-semibold text-brand-blue">
        Voltar ao anúncio
      </Link>
    </main>
  );
}

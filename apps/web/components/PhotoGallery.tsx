"use client";

import { useState, useTransition } from "react";
import { Sparkle, Star } from "@phosphor-icons/react/dist/ssr";
import type { Photo } from "@novoseminovo/shared-types";
import { Button } from "@/components/Button";
import {
  deletePhotoAction,
  reclassifyPhotosAction,
  reorderPhotosAction,
  updatePhotoCaptionAction,
} from "@/lib/actions/listings";
import { resolveMediaUrl } from "@/lib/api";

// Galeria arrastar-e-soltar da página de fotos do anúncio. A ordem/legenda
// sugerida pela IA (ver ListingsService.classifyPhotos, chamado automaticamente
// depois do upload) é só o ponto de partida — tudo aqui é editável, e nada é
// salvo de verdade até a pessoa clicar em "Salvar ordem e capa".
export function PhotoGallery({
  listingId,
  initialPhotos,
  aiEnabled,
}: {
  listingId: string;
  initialPhotos: Photo[];
  aiEnabled: boolean;
}) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [coverId, setCoverId] = useState(initialPhotos[0]?.id);
  const [captions, setCaptions] = useState<Record<string, string>>(
    Object.fromEntries(initialPhotos.map((p) => [p.id, p.caption ?? ""])),
  );
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isClassifying, startClassify] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) return;
    setPhotos((current) => {
      const next = current.slice();
      const [moved] = next.splice(dragIndex, 1);
      next.splice(targetIndex, 0, moved!);
      return next;
    });
    setDragIndex(null);
    setIsDirty(true);
  }

  function handleSave() {
    setMessage(null);
    startTransition(async () => {
      const result = await reorderPhotosAction(listingId, {
        order: photos.map((p) => p.id),
        coverPhotoId: coverId,
      });
      if (result.ok) {
        setPhotos(result.photos);
        setIsDirty(false);
        setMessage("Ordem salva.");
      } else {
        setMessage(result.error);
      }
    });
  }

  function handleCaptionBlur(photoId: string) {
    const caption = captions[photoId] ?? "";
    startTransition(() => {
      updatePhotoCaptionAction(listingId, photoId, caption);
    });
  }

  function handleReclassify() {
    setMessage(null);
    startClassify(async () => {
      const updated = await reclassifyPhotosAction(listingId);
      if (updated) {
        setPhotos(updated);
        setCaptions(Object.fromEntries(updated.map((p) => [p.id, p.caption ?? ""])));
        setCoverId(updated[0]?.id);
        setIsDirty(false);
        setMessage("Fotos reorganizadas pela IA.");
      } else {
        setMessage("Não foi possível organizar as fotos automaticamente agora.");
      }
    });
  }

  if (photos.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">Arraste as fotos pra reordenar, clique na estrela pra escolher a capa.</p>
        {aiEnabled && (
          <Button type="button" variant="secondary" onClick={handleReclassify} disabled={isClassifying}>
            <Sparkle size={16} weight="fill" />
            {isClassifying ? "Organizando..." : "Reorganizar com IA"}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((photo, index) => (
          <div
            key={photo.id}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => handleDrop(index)}
            className="flex cursor-grab flex-col gap-1 overflow-hidden rounded-brand border border-border bg-surface-raised"
          >
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveMediaUrl(photo.url)}
                alt={captions[photo.id] || `Foto ${index + 1}`}
                className="aspect-square w-full object-cover"
              />
              <button
                type="button"
                onClick={() => {
                  setCoverId(photo.id);
                  setIsDirty(true);
                }}
                className={`absolute left-2 top-2 rounded-full p-1.5 ${
                  coverId === photo.id ? "bg-brand-green text-on-green" : "bg-surface-raised/90 text-ink-muted"
                }`}
                aria-label="Definir como capa"
                title="Definir como capa"
              >
                <Star size={14} weight={coverId === photo.id ? "fill" : "regular"} />
              </button>
              <form action={deletePhotoAction.bind(null, listingId, photo.id)} className="absolute bottom-2 right-2">
                <Button type="submit" variant="ghost" className="bg-surface-raised px-2 py-1 text-xs">
                  Excluir
                </Button>
              </form>
            </div>
            <input
              value={captions[photo.id] ?? ""}
              onChange={(event) => setCaptions((current) => ({ ...current, [photo.id]: event.target.value }))}
              onBlur={() => handleCaptionBlur(photo.id)}
              placeholder="Legenda (opcional)"
              className="mx-2 mb-2 rounded-brand border border-border bg-surface-page px-2 py-1 text-xs text-ink placeholder:text-ink-muted"
            />
          </div>
        ))}
      </div>

      {message && <p className="text-sm text-ink-muted">{message}</p>}

      {isDirty && (
        <Button type="button" onClick={handleSave} disabled={isPending} className="self-start">
          {isPending ? "Salvando..." : "Salvar ordem e capa"}
        </Button>
      )}
    </div>
  );
}

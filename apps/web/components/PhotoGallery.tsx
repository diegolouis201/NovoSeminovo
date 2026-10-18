"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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

// Legendas rápidas (ver uso abaixo) — ajudam a padronizar ângulos comuns sem
// a pessoa precisar digitar toda vez. Lista diferente pra veículo e imóvel,
// mas em ambos os casos é só um atalho: o campo de texto continua livre.
const VEHICLE_CAPTION_PRESETS = [
  "Frente",
  "Traseira",
  "Lateral esquerda",
  "Lateral direita",
  "Frente - parte interna",
  "Traseira - parte interna",
  "Painel",
  "Bancos",
  "Porta-malas",
  "Motor",
  "Rodas",
];
const PROPERTY_CAPTION_PRESETS = [
  "Fachada",
  "Sala",
  "Cozinha",
  "Quarto",
  "Suíte",
  "Banheiro",
  "Varanda",
  "Área gourmet",
  "Piscina",
  "Jardim",
  "Garagem",
  "Vista",
];

// Galeria arrastar-e-soltar da página de fotos do anúncio. A ordem/legenda
// sugerida pela IA (ver ListingsService.classifyPhotos, chamado automaticamente
// depois do upload) é só o ponto de partida — tudo aqui é editável, e nada é
// salvo de verdade até a pessoa clicar em "Salvar ordem e capa".
export function PhotoGallery({
  listingId,
  initialPhotos,
  aiEnabled,
  assetType,
}: {
  listingId: string;
  initialPhotos: Photo[];
  aiEnabled: boolean;
  assetType: "vehicle" | "property";
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startDelete] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const captionPresets = assetType === "vehicle" ? VEHICLE_CAPTION_PRESETS : PROPERTY_CAPTION_PRESETS;

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

  function saveCaption(photoId: string, caption: string) {
    startTransition(() => {
      updatePhotoCaptionAction(listingId, photoId, caption);
    });
  }

  function handleCaptionBlur(photoId: string) {
    saveCaption(photoId, captions[photoId] ?? "");
  }

  function handleCaptionPreset(photoId: string, preset: string) {
    setCaptions((current) => ({ ...current, [photoId]: preset }));
    saveCaption(photoId, preset);
  }

  // Server action não retorna nada pro <form> nativo saber se deu certo, por
  // isso a exclusão vira chamada direta (mesmo padrão de reorderPhotosAction
  // acima) — só assim dá pra tirar a foto do estado local (photos) assim que
  // o backend confirma, sem precisar recarregar a página.
  function handleDelete(photoId: string) {
    setMessage(null);
    setDeletingId(photoId);
    startDelete(async () => {
      const ok = await deletePhotoAction(listingId, photoId);
      setDeletingId(null);
      if (!ok) {
        setMessage("Não foi possível excluir a foto. Tente novamente.");
        return;
      }
      const remaining = photos.filter((p) => p.id !== photoId);
      setPhotos(remaining);
      setCaptions((current) => {
        const next = { ...current };
        delete next[photoId];
        return next;
      });
      if (coverId === photoId) setCoverId(remaining[0]?.id);
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

  // Upload (ver uploadPhotosAction) não espera mais a IA terminar antes de
  // voltar pra essa tela — senão o envio parecia travado, sem nenhum aviso,
  // enquanto a IA analisava as fotos (até ~1min). Em vez disso, assim que a
  // galeria carrega com fotos recém-enviadas (nenhuma com legenda ainda),
  // dispara a organização automaticamente — com o aviso "Organizando..." já
  // visível — uma vez só por carregamento de página.
  const autoClassifyTriggered = useRef(false);
  useEffect(() => {
    if (autoClassifyTriggered.current) return;
    if (!aiEnabled || photos.length === 0) return;
    if (photos.some((p) => p.caption)) return;
    autoClassifyTriggered.current = true;
    handleReclassify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleDelete(photo.id)}
                disabled={deletingId === photo.id}
                className="absolute bottom-2 right-2 bg-surface-raised px-2 py-1 text-xs"
              >
                {deletingId === photo.id ? "Excluindo..." : "Excluir"}
              </Button>
            </div>
            <select
              value=""
              onChange={(event) => {
                if (event.target.value) handleCaptionPreset(photo.id, event.target.value);
              }}
              className="mx-2 rounded-brand border border-border bg-surface-page px-2 py-1 text-xs text-ink"
            >
              <option value="">Legenda rápida...</option>
              {captionPresets.map((preset) => (
                <option key={preset} value={preset}>
                  {preset}
                </option>
              ))}
            </select>
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

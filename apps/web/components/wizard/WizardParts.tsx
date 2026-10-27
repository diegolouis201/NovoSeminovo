"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Camera, CaretLeft, CaretRight, Check, Star, Trash } from "@phosphor-icons/react";
import { LISTING_TIERS, formatBRL, listingTier, type ListingTierId } from "@novoseminovo/shared-types";

// Peças comuns dos cadastros em passo a passo (carro e imóvel): campos,
// fotos, planos do particular e o aceite dos termos.

export const MAX_PHOTOS = 20;
const PHOTO_MAX_SIDE = 1920;

export type WizardPhoto = { id: string; file: File; url: string };

export function digits(value: string): string {
  return value.replace(/\D/g, "");
}

export function formatThousands(value: string): string {
  const d = digits(value);
  return d ? Number(d).toLocaleString("pt-BR") : "";
}

export function formatPhone(value: string): string {
  const d = digits(value).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
}

export function formatCpf(value: string): string {
  const d = digits(value).slice(0, 11);
  return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function formatCep(value: string): string {
  const cep = digits(value).slice(0, 8);
  return cep.length > 5 ? `${cep.slice(0, 5)}-${cep.slice(5)}` : cep;
}

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignora
  }
}

// Reduz a foto no navegador antes de enviar (celular tira foto de 4–8 MB):
// lado maior de até 1920 px, JPEG. Também converte HEIC no Safari/iPhone,
// que sabe abrir HEIC; navegador que não sabe cai no erro e avisa.
async function compressPhoto(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("Não foi possível processar a foto.");
  const name = file.name.replace(/\.[^.]+$/, "") || "foto";
  return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
}

// Comprime e devolve as fotos novas (até completar MAX_PHOTOS) e um aviso,
// se alguma ficou de fora.
export async function preparePhotos(files: FileList | File[], current: number): Promise<{ added: WizardPhoto[]; warning?: string }> {
  const room = MAX_PHOTOS - current;
  const chosen = Array.from(files).slice(0, room);
  const added: WizardPhoto[] = [];
  let failed = 0;
  for (const file of chosen) {
    try {
      const compressed = await compressPhoto(file);
      added.push({ id: `${Date.now()}-${Math.random()}`, file: compressed, url: URL.createObjectURL(compressed) });
    } catch {
      failed += 1;
    }
  }
  if (failed) return { added, warning: `${failed} foto(s) não puderam ser abertas. Envie em JPG ou PNG.` };
  if (files.length > room) return { added, warning: `O limite é de ${MAX_PHOTOS} fotos — as excedentes ficaram de fora.` };
  return { added };
}

export function PhotoGrid({
  photos,
  onAdd,
  onMove,
  onRemove,
}: {
  photos: WizardPhoto[];
  onAdd: (files: FileList | null) => Promise<void>;
  onMove: (index: number, to: number) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((photo, index) => (
          <figure
            key={photo.id}
            draggable
            onDragStart={(event) => event.dataTransfer.setData("text/plain", String(index))}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              onMove(Number(event.dataTransfer.getData("text/plain")), index);
            }}
            className="relative overflow-hidden rounded-brand border border-border bg-surface-sober"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt={`Foto ${index + 1}`} className="aspect-[4/3] w-full object-cover" />
            {index === 0 && (
              <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-brand-green px-2 py-0.5 text-[11px] font-bold text-on-green">
                <Star size={12} weight="fill" /> Capa
              </span>
            )}
            <div className="flex items-center justify-between bg-surface-raised px-1 py-1">
              <button type="button" onClick={() => onMove(index, index - 1)} disabled={index === 0} aria-label="Mover para a esquerda" className="rounded p-1.5 text-ink disabled:opacity-30">
                <CaretLeft size={16} weight="bold" />
              </button>
              <button type="button" onClick={() => onRemove(index)} aria-label="Remover foto" className="rounded p-1.5 text-status-danger">
                <Trash size={16} weight="bold" />
              </button>
              <button type="button" onClick={() => onMove(index, index + 1)} disabled={index === photos.length - 1} aria-label="Mover para a direita" className="rounded p-1.5 text-ink disabled:opacity-30">
                <CaretRight size={16} weight="bold" />
              </button>
            </div>
          </figure>
        ))}
        {photos.length < MAX_PHOTOS && (
          <label className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1 rounded-brand border-2 border-dashed border-border bg-surface-raised text-sm font-semibold text-ink-muted hover:bg-surface-sober">
            <Camera size={28} />
            Adicionar fotos
            <input type="file" accept="image/*" multiple className="sr-only" onChange={(event) => void onAdd(event.target.files).then(() => (event.target.value = ""))} />
          </label>
        )}
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        {photos.length} de {MAX_PHOTOS} fotos · JPG, PNG, WebP ou HEIC (iPhone)
      </p>
    </>
  );
}

export function PlanPicker({
  value,
  onChange,
  photoCount,
  videoLabel,
}: {
  value: ListingTierId;
  onChange: (tier: ListingTierId) => void;
  photoCount: number;
  videoLabel: string;
}) {
  const chosen = listingTier(value);
  return (
    <>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {LISTING_TIERS.map((tier) => {
          const selected = value === tier.id;
          return (
            <button
              key={tier.id}
              type="button"
              onClick={() => onChange(tier.id)}
              aria-pressed={selected}
              className={`relative flex flex-col gap-1 rounded-brand border-2 p-4 text-left ${
                selected ? "border-brand-green bg-brand-green/10" : "border-border bg-surface-raised hover:bg-surface-sober"
              }`}
            >
              {tier.id === "nitro" && (
                <span className="absolute -top-3 left-4 rounded-full bg-brand-purple px-2 py-0.5 text-[11px] font-bold text-on-purple">Recomendado</span>
              )}
              <span className="flex items-center justify-between gap-2">
                <span className="font-display text-xl font-bold uppercase text-ink">{tier.name}</span>
                {selected && <Check size={22} weight="bold" className="text-brand-green" />}
              </span>
              <span className="text-2xl font-extrabold text-ink">{tier.price ? formatBRL(tier.price) : "R$ 0"}</span>
              <span className="text-xs text-ink-muted">{tier.price ? "pagamento único" : "sem custo"}</span>
              <ul className="mt-2 space-y-1 text-sm text-ink">
                <li>✓ {tier.position}</li>
                <li>✓ No ar até vender</li>
                <li>✓ Até {tier.photos} fotos</li>
                {tier.video && <li>✓ {videoLabel}</li>}
              </ul>
            </button>
          );
        })}
      </div>
      {photoCount > chosen.photos && (
        <p className="mt-3 rounded-brand bg-brand-orange/10 px-3 py-2 text-sm text-ink">
          Você adicionou {photoCount} fotos — o plano {chosen.name} mostra as {chosen.photos} primeiras. Dá para turbinar depois e liberar as outras.
        </p>
      )}
    </>
  );
}

export function PlanSummary({ tier }: { tier: ListingTierId }) {
  const chosen = listingTier(tier);
  return (
    <p className="mt-4 rounded-brand bg-brand-green/10 px-4 py-3 text-sm text-ink">
      <strong className="text-brand-green">Plano {chosen.name}</strong> —{" "}
      {tier === "free"
        ? "grátis até vender, com até 5 fotos."
        : `${formatBRL(chosen.price)}, pagamento único: até ${chosen.photos} fotos, vídeo e ${chosen.position.toLowerCase()}. O pagamento abre depois de publicar.`}
    </p>
  );
}

export function publishLabel(isPartner: boolean, tier: ListingTierId): string {
  if (isPartner) return "Publicar anúncio";
  if (tier === "free") return "Publicar anúncio grátis";
  return `Publicar e pagar ${formatBRL(listingTier(tier).price)}`;
}

export function TermsDialog({ onCancel, onAccept }: { onCancel: () => void; onAccept: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="termos-titulo" className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-brand-lg bg-surface-raised p-5 shadow-card">
        <h2 id="termos-titulo" className="font-display text-xl font-semibold text-ink">
          Termos e Política de Privacidade
        </h2>
        <p className="mt-2 text-sm text-ink-muted">Para publicar, confirme que leu e concorda com os documentos abaixo.</p>
        <ul className="mt-3 list-disc pl-5 text-sm">
          <li>
            <Link href="/termos" target="_blank" className="font-semibold text-brand-blue underline">
              Termos de Uso
            </Link>
          </li>
          <li>
            <Link href="/privacidade" target="_blank" className="font-semibold text-brand-blue underline">
              Política de Privacidade
            </Link>
          </li>
        </ul>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-full border border-border px-4 py-2.5 text-sm font-bold text-ink">
            Voltar
          </button>
          <button type="button" onClick={onAccept} className="rounded-full bg-brand-green px-5 py-2.5 text-sm font-bold text-on-green">
            Li e aceito, publicar
          </button>
        </div>
      </div>
    </div>
  );
}

export const inputClass =
  "w-full rounded-brand border border-border bg-surface-raised px-3 py-3 text-base text-ink placeholder:text-ink-muted focus:border-brand-green focus:outline-none disabled:opacity-70";

export function Step({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <h1 className="font-display text-3xl font-bold uppercase leading-tight text-ink">{title}</h1>
      {hint && <p className="mt-2 text-sm text-ink-muted">{hint}</p>}
      <div className="mt-2 flex flex-col gap-3">{children}</div>
    </section>
  );
}

export function Intro({ icon, stage, title, children }: { icon: ReactNode; stage: string; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col">
      <div className="mx-auto mt-6 flex h-40 w-40 items-center justify-center rounded-full bg-brand-blue/10">{icon}</div>
      <span className="mt-8 self-start rounded-full bg-surface-sober px-3 py-1 text-xs font-bold text-ink">{stage}</span>
      <h1 className="mt-3 font-display text-3xl font-bold uppercase leading-tight text-ink">{title}</h1>
      <p className="mt-2 text-sm text-ink-muted">{children}</p>
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mt-2 flex flex-col gap-1">
      <span className="text-sm font-semibold text-ink">{label}</span>
      {children}
    </label>
  );
}

export function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>
      <option value="">Selecione</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function Chip({ label, selected, onToggle }: { label: string; selected: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
        selected ? "border-brand-blue bg-brand-blue text-on-blue" : "border-border bg-surface-raised text-ink"
      }`}
    >
      {selected && <Check size={14} weight="bold" />}
      {label}
    </button>
  );
}

// Botões de 0/1/2/3/4/5+ (quartos, banheiros, vagas). Clicar no escolhido desmarca.
export function CountPicker({ label, value, onChange, max = 5 }: { label: string; value: string; onChange: (value: string) => void; max?: number }) {
  return (
    <div className="mt-2 flex flex-col gap-1">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <div className="grid grid-cols-6 gap-2" role="group" aria-label={label}>
        {Array.from({ length: max + 1 }, (_, n) => String(n)).map((n) => {
          const selected = value === n;
          return (
            <button
              key={n}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(selected ? "" : n)}
              className={`rounded-brand border py-2.5 text-sm font-bold ${
                selected ? "border-brand-blue bg-brand-blue text-on-blue" : "border-border bg-surface-raised text-ink hover:bg-surface-sober"
              }`}
            >
              {Number(n) === max ? `${n}+` : n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-brand border border-border bg-surface-raised px-4 py-3 text-left"
    >
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? "bg-brand-green" : "bg-border"}`}>
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </span>
      <span>
        <span className="block font-semibold text-ink">{label}</span>
        {description && <span className="text-xs text-ink-muted">{description}</span>}
      </span>
    </button>
  );
}

// Fotos de um anúncio importado de outro site (ver /anunciar/importar): os
// links ficam no sessionStorage até o passo a passo abrir; aqui viram
// arquivos e passam pela mesma compressão das fotos escolhidas à mão.
export const IMPORT_PHOTOS_KEY = "ns-importar-fotos";

export async function takeImportedPhotos(assetType: "vehicle" | "property"): Promise<File[]> {
  let urls: string[] = [];
  try {
    const saved = sessionStorage.getItem(IMPORT_PHOTOS_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved) as { assetType: string; urls: string[] };
    sessionStorage.removeItem(IMPORT_PHOTOS_KEY);
    if (parsed.assetType !== assetType) return [];
    urls = parsed.urls.slice(0, MAX_PHOTOS);
  } catch {
    return [];
  }
  const files = await Promise.all(
    urls.map(async (url, index) => {
      try {
        const res = await fetch(`/api/importar-foto?url=${encodeURIComponent(url)}`);
        if (!res.ok) return undefined;
        const blob = await res.blob();
        return new File([blob], `importada-${index + 1}.jpg`, { type: blob.type || "image/jpeg" });
      } catch {
        return undefined;
      }
    }),
  );
  return files.filter((file): file is File => Boolean(file));
}

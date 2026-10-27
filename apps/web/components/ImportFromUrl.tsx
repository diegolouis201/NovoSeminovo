"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { CheckCircle, LinkSimple, PuzzlePiece, WarningCircle } from "@phosphor-icons/react";
import { VEHICLE_BODY_TYPE_OPTIONS, formatBRL, type ImportedListing } from "@novoseminovo/shared-types";
import { importListingFromPageAction, importListingFromTextAction, importListingFromUrlAction } from "@/lib/actions/listings";
import { dataUrlToBlob, saveImportedPhotoBlobs } from "@/lib/import-photos";
import { IMPORT_PHOTOS_KEY } from "@/components/wizard/WizardParts";

const BODY_TYPES = new Set<string>(VEHICLE_BODY_TYPE_OPTIONS.map((option) => option.value));
const FUEL_LABEL: Record<string, string> = { flex: "Flex", gasoline: "Gasolina", ethanol: "Etanol", diesel: "Diesel", electric: "Elétrico", hybrid: "Híbrido" };
const PROPERTY_TYPE_LABEL: Record<string, string> = {
  house: "Casa", apartment: "Apartamento", land: "Terreno", commercial: "Comercial", penthouse: "Cobertura", farm: "Sítio/Fazenda",
  warehouse: "Galpão", condo_house: "Casa em condomínio", studio: "Studio", store: "Loja", garage: "Garagem",
};

// O que a extensão do Chrome capturou na aba do anúncio (ver
// apps/chrome-extension): a página e as fotos já baixadas, por endereço.
type CapturedPage = {
  page: { url: string; title?: string; description?: string; structured?: string; text: string; images?: string[] };
  photos: Record<string, string>;
};

const text = (value: number | undefined) => (value === undefined ? "" : String(Math.round(value)));

// Rascunho no mesmo formato que o passo a passo guarda (VehicleListingWizard /
// PropertyListingWizard): ele abre preenchido, na primeira etapa de dados.
function saveWizardDraft(listing: ImportedListing) {
  const base = { title: listing.title, description: listing.description, price: text(listing.price), city: listing.city ?? "", state: listing.state ?? "", neighborhood: listing.neighborhood ?? "" };
  if (listing.assetType === "vehicle") {
    const v = listing.vehicle ?? {};
    const draft = {
      ...base,
      brand: v.brand ?? "",
      model: v.model ?? "",
      version: v.version ?? "",
      yearManufacture: text(v.yearManufacture ?? v.yearModel),
      yearModel: text(v.yearModel ?? v.yearManufacture),
      mileage: text(v.mileage),
      transmission: v.transmission ?? "",
      fuelType: v.fuelType ?? "",
      color: v.color ?? "",
      doors: text(v.doors),
      bodyType: v.bodyType && BODY_TYPES.has(v.bodyType) ? v.bodyType : "",
    };
    // Etapa "car" (marca, modelo e ano): logo depois da placa.
    localStorage.setItem("ns-anunciar-carro", JSON.stringify({ draft, step: 2 }));
  } else {
    const p = listing.property ?? {};
    const draft = {
      ...base,
      purpose: p.purpose ?? "sale",
      propertyType: p.propertyType ?? "",
      bedrooms: text(p.bedrooms),
      suites: text(p.suites),
      bathrooms: text(p.bathrooms),
      parkingSpots: text(p.parkingSpots),
      areaM2: text(p.areaM2),
      totalAreaM2: text(p.totalAreaM2),
      floor: text(p.floor),
      condoFee: text(p.condoFee),
      iptu: text(p.iptu),
      features: p.features ?? [],
    };
    // Etapa "intent" (venda ou aluguel).
    localStorage.setItem("ns-anunciar-imovel", JSON.stringify({ draft, step: 1 }));
  }
  sessionStorage.setItem(IMPORT_PHOTOS_KEY, JSON.stringify({ assetType: listing.assetType, urls: listing.photos }));
}

export function ImportFromUrl({ allowed }: { allowed: readonly ("vehicle" | "property")[] }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [owner, setOwner] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<ImportedListing | undefined>();
  // Plano B (site bloqueou a leitura): texto da página colado.
  const [showPaste, setShowPaste] = useState(false);
  const [pasted, setPasted] = useState("");
  const [pending, start] = useTransition();
  const [captured, setCaptured] = useState<CapturedPage | undefined>();

  // Conversa com a extensão (entrega.js): quem chegar primeiro avisa o outro.
  useEffect(() => {
    const origin = window.location.origin;
    const ready = () => window.postMessage({ source: "ns-site", type: "pronto" }, origin);
    function onMessage(event: MessageEvent) {
      if (event.source !== window || event.data?.source !== "ns-extensao") return;
      if (event.data.type === "oi") ready();
      if (event.data.type === "anuncio" && event.data.payload?.page) {
        const payload = event.data.payload as CapturedPage;
        setCaptured({ page: payload.page, photos: payload.photos ?? {} });
        setUrl(payload.page.url);
        setResult(undefined);
        setError(undefined);
      }
    }
    window.addEventListener("message", onMessage);
    ready();
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function readCaptured() {
    if (!captured) return;
    if (!owner) return setError("Confirme que o anúncio é seu.");
    setError(undefined);
    setResult(undefined);
    const downloaded = Object.keys(captured.photos);
    start(async () => {
      const response = await importListingFromPageAction({ ...captured.page, images: downloaded.length ? downloaded : captured.page.images });
      if (!response.ok) return setError(response.error);
      // A IA escolhe as fotos do anúncio; se não escolher nenhuma, ficam todas as baixadas.
      const chosen = response.value.photos.filter((photo) => captured.photos[photo]);
      const photos = chosen.length ? chosen : downloaded;
      accept({ ...response.value, photos, missing: photos.length ? response.value.missing.filter((item) => item !== "fotos") : response.value.missing });
    });
  }

  function read() {
    if (!/^https?:\/\//i.test(url.trim())) return setError("Cole o link completo do anúncio (começando com https://).");
    if (!owner) return setError("Confirme que o anúncio é seu.");
    setError(undefined);
    setResult(undefined);
    start(async () => {
      const response = await importListingFromUrlAction(url);
      if (!response.ok) {
        setShowPaste(true);
        return setError(response.error);
      }
      accept(response.value);
    });
  }

  function readPasted() {
    if (!owner) return setError("Confirme que o anúncio é seu.");
    if (pasted.trim().length < 80) return setError("Cole o texto do anúncio inteiro (selecione a página e copie).");
    setError(undefined);
    setResult(undefined);
    start(async () => {
      const response = await importListingFromTextAction(pasted, url.trim());
      if (!response.ok) return setError(response.error);
      accept(response.value);
    });
  }

  function accept(value: ImportedListing) {
    if (!allowed.includes(value.assetType)) {
      return setError(
        value.assetType === "vehicle"
          ? "Esse anúncio é de veículo, e a sua conta anuncia só imóveis."
          : "Esse anúncio é de imóvel, e a sua conta anuncia só veículos.",
      );
    }
    setShowPaste(false);
    setResult(value);
  }

  async function continueToWizard() {
    if (!result) return;
    try {
      saveWizardDraft(result);
      if (captured) {
        const dataUrls = result.photos.map((photo) => captured.photos[photo]).filter((dataUrl): dataUrl is string => Boolean(dataUrl));
        const blobs = await Promise.all(dataUrls.map(dataUrlToBlob));
        await saveImportedPhotoBlobs(blobs);
        sessionStorage.setItem(IMPORT_PHOTOS_KEY, JSON.stringify({ assetType: result.assetType, source: "idb" }));
      }
    } catch {
      return setError("Seu navegador bloqueou o rascunho (aba anônima?). Tente numa aba comum.");
    }
    router.push(`/anunciar?tipo=${result.assetType}`);
  }

  const photoSrc = (photo: string) => captured?.photos[photo] ?? `/api/importar-foto?url=${encodeURIComponent(photo)}`;
  let capturedHost = "";
  try {
    capturedHost = captured ? new URL(captured.page.url).hostname.replace(/^www\./, "") : "";
  } catch {
    // endereço inválido
  }

  const v = result?.vehicle;
  const p = result?.property;
  const facts = result
    ? result.assetType === "vehicle"
      ? [
          [v?.brand, v?.model, v?.version].filter(Boolean).join(" "),
          v?.yearModel && `${v.yearManufacture ?? v.yearModel}/${v.yearModel}`,
          v?.mileage !== undefined && `${v.mileage.toLocaleString("pt-BR")} km`,
          v?.transmission && (v.transmission === "automatic" ? "Automático" : "Manual"),
          v?.fuelType && FUEL_LABEL[v.fuelType],
        ]
      : [
          p?.propertyType && PROPERTY_TYPE_LABEL[p.propertyType],
          p?.purpose && (p.purpose === "rent" ? "Aluguel" : "Venda"),
          p?.areaM2 && `${p.areaM2.toLocaleString("pt-BR")} m²`,
          p?.bedrooms !== undefined && `${p.bedrooms} quarto(s)`,
          p?.parkingSpots !== undefined && `${p.parkingSpots} vaga(s)`,
        ]
    : [];

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-brand border border-border bg-surface-raised p-4 shadow-card">
        {captured ? (
          <div className="flex items-start gap-2 rounded-brand bg-brand-blue/10 px-3 py-2.5 text-sm text-ink">
            <PuzzlePiece size={20} weight="duotone" className="mt-px shrink-0 text-brand-blue" />
            <span>
              <strong>Recebemos o anúncio de {capturedHost}</strong> pela extensão, com {Object.keys(captured.photos).length} foto(s).
              <span className="block truncate text-xs text-ink-muted">{captured.page.title || captured.page.url}</span>
            </span>
          </div>
        ) : (
        <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
          Link do anúncio
          <span className="flex items-center gap-2 rounded-brand border border-border bg-surface-page px-3">
            <LinkSimple size={18} className="text-ink-muted" />
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              inputMode="url"
              placeholder="https://www.olx.com.br/..."
              className="min-w-0 flex-1 bg-transparent py-2.5 text-sm font-normal text-ink outline-none"
            />
          </span>
        </label>
        )}
        <label className="flex items-start gap-2 text-xs text-ink">
          <input type="checkbox" checked={owner} onChange={(event) => setOwner(event.target.checked)} className="mt-0.5" />
          <span>O anúncio é meu e tenho direito de usar as fotos e o texto dele no NovoSeminovo.</span>
        </label>
        {error && (
          <p className="flex items-start gap-1.5 rounded-brand bg-status-danger/10 px-3 py-2 text-xs text-status-danger">
            <WarningCircle size={16} className="mt-px shrink-0" /> {error}
          </p>
        )}
        {showPaste && (
          <div className="flex flex-col gap-2 rounded-brand border border-brand-blue bg-brand-blue/10 p-3">
            <p className="flex items-start gap-2 text-sm text-ink">
              <PuzzlePiece size={20} weight="duotone" className="mt-px shrink-0 text-brand-blue" />
              <span>
                <strong>Melhor caminho: a extensão do NovoSeminovo para o Chrome.</strong> Você abre o anúncio, clica no ícone e o texto e as
                fotos vêm em um clique — funciona na Webmotors e em qualquer site.
              </span>
            </p>
            <Link
              href="/extensao"
              className="rounded-brand bg-brand-blue px-4 py-2.5 text-center text-sm font-bold text-on-blue hover:opacity-90"
            >
              Instalar a extensão
            </Link>
          </div>
        )}
        {showPaste && (
          <div className="flex flex-col gap-2 rounded-brand bg-surface-sober p-3">
            <p className="text-xs text-ink">
              <strong>Ou, sem instalar nada:</strong> abra o anúncio no navegador, selecione a página inteira (Ctrl+A ou &quot;Selecionar
              tudo&quot;), copie e cole aqui. As fotos você envia no passo a passo.
            </p>
            <textarea
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              rows={6}
              placeholder="Cole aqui o texto do anúncio"
              className="rounded-brand border border-border bg-surface-page px-3 py-2 text-sm text-ink"
            />
            <button
              type="button"
              onClick={readPasted}
              disabled={pending}
              className="rounded-brand border border-brand-blue px-4 py-2.5 text-sm font-bold text-brand-blue disabled:opacity-60"
            >
              {pending ? "Lendo o texto…" : "Usar o texto colado"}
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={captured ? readCaptured : read}
          disabled={pending}
          className="rounded-brand bg-brand-blue px-4 py-3 text-sm font-bold text-on-blue disabled:opacity-60"
        >
          {pending ? "Lendo o anúncio… leva alguns segundos" : "Importar anúncio"}
        </button>
        {captured && (
          <button type="button" onClick={() => setCaptured(undefined)} className="text-xs font-semibold text-brand-blue hover:underline">
            Prefiro colar outro link
          </button>
        )}
      </div>

      {result && (
        <div className="flex flex-col gap-3 rounded-brand border border-brand-green bg-surface-raised p-4 shadow-card">
          <p className="flex items-center gap-1.5 text-sm font-bold text-brand-green">
            <CheckCircle size={18} weight="fill" /> Anúncio lido em {result.sourceHost}
          </p>
          <div>
            <p className="font-semibold text-ink">{result.title}</p>
            {result.price !== undefined && <p className="text-lg font-bold text-ink">{formatBRL(result.price)}</p>}
            <p className="text-xs text-ink-muted">{facts.filter(Boolean).join(" · ")}</p>
            {(result.city || result.state) && (
              <p className="text-xs text-ink-muted">{[result.neighborhood, result.city, result.state].filter(Boolean).join(", ")}</p>
            )}
          </div>
          {result.photos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto">
              {result.photos.slice(0, 6).map((photo) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={photo}
                  src={photoSrc(photo)}
                  alt=""
                  className="h-16 w-24 shrink-0 rounded-brand object-cover"
                />
              ))}
              {result.photos.length > 6 && <span className="self-center text-xs text-ink-muted">+{result.photos.length - 6} fotos</span>}
            </div>
          )}
          {result.missing.length > 0 && (
            <p className="rounded-brand bg-brand-orange/10 px-3 py-2 text-xs text-ink">
              <strong>Complete no próximo passo:</strong> {result.missing.join(", ")}.
            </p>
          )}
          <p className="text-xs text-ink-muted">
            Reescrevemos o texto no nosso padrão e tiramos telefones e links (o contato aqui é pelo chat e pelo WhatsApp do site). Você revisa
            cada etapa antes de publicar.
          </p>
          <button
            type="button"
            onClick={() => void continueToWizard()}
            className="rounded-brand bg-brand-green px-4 py-3 text-sm font-bold text-on-green hover:opacity-90"
          >
            Revisar e publicar
          </button>
        </div>
      )}
    </div>
  );
}

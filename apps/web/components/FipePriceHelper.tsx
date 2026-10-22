"use client";

import { useEffect, useRef, useState } from "react";
import { Lightning, Scales, Warning } from "@phosphor-icons/react";
import { formatBRL, type FipePrice, type FipeVersion } from "@novoseminovo/shared-types";
import { fipePriceAction, fipeVersionsAction } from "@/lib/actions/listings";

// Preço sugerido pela FIPE no /anunciar (estilo Webmotors): lê marca, modelo
// e ano-modelo do próprio formulário (o resto do /anunciar é não-controlado,
// mesmo esquema do PriceSuggestionHint), mostra as versões da tabela, e dá
// duas opções de preço que preenchem o campo "price". Também avisa quando o
// preço digitado foge muito da FIPE. A versão escolhida vai pra API em
// "fipeModelCode", que busca o preço de novo do lado dela (nunca confia no
// valor vindo do navegador).
const QUICK_SALE_DISCOUNT = 0.03;

function field<T extends HTMLElement>(name: string): T | null {
  return document.querySelector<T>(`[name="${name}"]`);
}

export function FipePriceHelper() {
  const [versions, setVersions] = useState<FipeVersion[]>([]);
  const [selected, setSelected] = useState<number | undefined>();
  const [fipe, setFipe] = useState<FipePrice | undefined>();
  const [loading, setLoading] = useState(false);
  const [typedPrice, setTypedPrice] = useState<number | undefined>();
  const query = useRef<{ brand: string; model: string; year: number }>();

  useEffect(() => {
    const inputs = ["brand", "model", "yearModel"].map((name) => field<HTMLInputElement>(name));
    const priceInput = field<HTMLInputElement>("price");
    if (inputs.some((input) => !input)) return;
    let timeout: ReturnType<typeof setTimeout>;
    let cancelled = false;

    function lookup() {
      clearTimeout(timeout);
      timeout = setTimeout(async () => {
        const [brand, model, year] = inputs.map((input) => input!.value.trim());
        const yearModel = Number(year);
        if (!brand || !model || !Number.isInteger(yearModel) || yearModel < 1950) {
          setVersions([]);
          setSelected(undefined);
          setFipe(undefined);
          return;
        }
        query.current = { brand, model, year: yearModel };
        setLoading(true);
        const found = await fipeVersionsAction(brand, model, yearModel).catch(() => []);
        if (cancelled) return;
        setLoading(false);
        setVersions(found);
        setFipe(undefined);
        setSelected(found.length === 1 ? found[0]!.code : undefined);
      }, 500);
    }

    const onPrice = () => setTypedPrice(Number(priceInput?.value) || undefined);
    inputs.forEach((input) => input!.addEventListener("change", lookup));
    priceInput?.addEventListener("input", onPrice);
    lookup();
    onPrice();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      inputs.forEach((input) => input!.removeEventListener("change", lookup));
      priceInput?.removeEventListener("input", onPrice);
    };
  }, []);

  useEffect(() => {
    if (!selected || !query.current) return;
    let cancelled = false;
    const { brand, year } = query.current;
    void fipePriceAction(brand, selected, year).then((result) => {
      if (cancelled) return;
      setFipe(result);
      const versionInput = field<HTMLInputElement>("version");
      const name = versions.find((version) => version.code === selected)?.name;
      if (versionInput && !versionInput.value.trim() && name) versionInput.value = name;
    });
    return () => {
      cancelled = true;
    };
  }, [selected, versions]);

  function applyPrice(value: number) {
    const priceInput = field<HTMLInputElement>("price");
    if (!priceInput) return;
    priceInput.value = String(value);
    setTypedPrice(value);
  }

  if (loading) return <p className="text-xs text-ink-muted">Consultando a tabela FIPE…</p>;
  if (versions.length === 0) return null;

  const quickSale = fipe ? Math.round((fipe.price * (1 - QUICK_SALE_DISCOUNT)) / 100) * 100 : undefined;
  const ratio = fipe && typedPrice ? typedPrice / fipe.price : undefined;

  return (
    <div className="flex flex-col gap-3 rounded-brand border border-border bg-surface-raised p-4">
      <input type="hidden" name="fipeModelCode" value={selected ?? ""} />
      {versions.length > 1 && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-ink">Versão na tabela FIPE</span>
          <select
            value={selected ?? ""}
            onChange={(event) => setSelected(Number(event.target.value) || undefined)}
            className="rounded-brand border border-border bg-surface-page px-3 py-2 text-ink"
          >
            <option value="">Escolha a versão para ver o preço FIPE</option>
            {versions.map((version) => (
              <option key={version.code} value={version.code}>
                {version.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {fipe && quickSale && (
        <>
          <p className="text-sm text-ink">
            Tabela FIPE: <strong>{formatBRL(fipe.price)}</strong>
            {fipe.versionName && <span className="text-ink-muted"> · {fipe.versionName}</span>}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => applyPrice(quickSale)}
              className={`flex items-start gap-2 rounded-brand border px-3 py-2 text-left text-sm ${
                typedPrice === quickSale ? "border-brand-blue bg-brand-blue/10" : "border-border hover:bg-surface-sober"
              }`}
            >
              <Lightning size={18} weight="fill" className="mt-0.5 shrink-0 text-brand-orange" />
              <span>
                <strong className="block text-ink">{formatBRL(quickSale)}</strong>
                <span className="text-ink-muted">Venda mais rápida, um pouco abaixo da FIPE</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => applyPrice(fipe.price)}
              className={`flex items-start gap-2 rounded-brand border px-3 py-2 text-left text-sm ${
                typedPrice === fipe.price ? "border-brand-blue bg-brand-blue/10" : "border-border hover:bg-surface-sober"
              }`}
            >
              <Scales size={18} weight="fill" className="mt-0.5 shrink-0 text-brand-blue" />
              <span>
                <strong className="block text-ink">{formatBRL(fipe.price)}</strong>
                <span className="text-ink-muted">Competitivo, igual à tabela FIPE</span>
              </span>
            </button>
          </div>
          <p className="text-xs text-ink-muted">Ou digite o seu preço no campo acima.</p>
        </>
      )}

      {ratio !== undefined && ratio < 0.8 && (
        <p className="flex gap-2 rounded-brand bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
          <Warning size={18} weight="fill" className="mt-0.5 shrink-0" />
          Seu preço está {Math.round((1 - ratio) * 100)}% abaixo da FIPE. Confira o valor — preço muito abaixo do mercado
          faz o comprador desconfiar de golpe.
        </p>
      )}
      {ratio !== undefined && ratio > 1.3 && (
        <p className="flex gap-2 rounded-brand bg-brand-orange/10 px-3 py-2 text-sm text-ink">
          <Warning size={18} weight="fill" className="mt-0.5 shrink-0 text-brand-orange" />
          Seu preço está {Math.round((ratio - 1) * 100)}% acima da FIPE — anúncios muito acima costumam demorar mais a
          vender.
        </p>
      )}
    </div>
  );
}

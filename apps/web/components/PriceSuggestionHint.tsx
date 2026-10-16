"use client";

import { useEffect, useState } from "react";
import { Lightbulb } from "@phosphor-icons/react";
import { formatBRL } from "@novoseminovo/shared-types";
import { suggestPriceAction } from "@/lib/actions/listings";

type Suggestion = { suggestedPrice: number; sampleSize: number };

// "IA" aqui é estatística simples do lado da API (ver ListingsService.suggestPrice)
// — este componente só lê os campos de marca/modelo (ou tipo/cidade) do
// próprio formulário por querySelector, porque o resto do /anunciar é todo
// não-controlado (defaultValue), sem precisar virar client component inteiro.
// Chama suggestPriceAction (Server Action) em vez de fetch direto na API:
// o navegador só fala com o próprio Next.js, nunca cruza origem com a API.
export function PriceSuggestionHint({ assetType }: { assetType: "vehicle" | "property" }) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);

  useEffect(() => {
    const fieldNames = assetType === "vehicle" ? ["brand", "model"] : ["propertyType", "city"];
    const fields = fieldNames
      .map((name) => document.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`))
      .filter((el): el is HTMLInputElement | HTMLSelectElement => Boolean(el));
    if (fields.length < fieldNames.length) return;

    let timeout: ReturnType<typeof setTimeout>;
    let cancelled = false;

    function checkSuggestion() {
      clearTimeout(timeout);
      timeout = setTimeout(async () => {
        const [first, second] = fields;
        const firstValue = first!.value.trim();
        const secondValue = second!.value.trim();
        if (!firstValue || !secondValue) {
          setSuggestion(null);
          return;
        }

        const query =
          assetType === "vehicle"
            ? { assetType, brand: firstValue, model: secondValue }
            : { assetType, propertyType: firstValue, city: secondValue };

        const result = await suggestPriceAction(query).catch(() => undefined);
        if (!cancelled) setSuggestion(result ?? null);
      }, 400);
    }

    fields.forEach((field) => field.addEventListener("change", checkSuggestion));
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      fields.forEach((field) => field.removeEventListener("change", checkSuggestion));
    };
  }, [assetType]);

  if (!suggestion) return null;

  function applySuggestion() {
    const priceField = document.querySelector<HTMLInputElement>('[name="price"]');
    if (priceField && suggestion) priceField.value = String(suggestion.suggestedPrice);
  }

  return (
    <button
      type="button"
      onClick={applySuggestion}
      className="flex items-center gap-2 self-start rounded-brand bg-brand-blue/10 px-3 py-2 text-left text-sm text-brand-blue hover:bg-brand-blue/20"
    >
      <Lightbulb size={16} weight="fill" />
      Sugestão de preço: {formatBRL(suggestion.suggestedPrice)} (baseado em {suggestion.sampleSize} anúncios
      parecidos) — toque pra usar
    </button>
  );
}

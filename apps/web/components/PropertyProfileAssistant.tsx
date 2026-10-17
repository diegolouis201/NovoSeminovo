"use client";

import { useState, useTransition } from "react";
import { Sparkle } from "@phosphor-icons/react/dist/ssr";
import { formatBRL, type PropertyPriority, type PropertyRecommendation } from "@novoseminovo/shared-types";
import { Button } from "@/components/Button";
import { FormField, SelectField } from "@/components/FormField";
import { ListingCard } from "@/components/ListingCard";
import { recommendPropertyAction } from "@/lib/actions/listings";

const PRIORITY_OPTIONS: { value: PropertyPriority; label: string }[] = [
  { value: "location", label: "Localização (abro mão de espaço pra reduzir trânsito)" },
  { value: "space", label: "Espaço/tamanho do imóvel" },
  { value: "price", label: "Menor preço possível" },
  { value: "condo_amenities", label: "Infraestrutura do condomínio" },
  { value: "low_maintenance", label: "Baixo custo de manutenção/condomínio" },
];

const INSTALLMENT_OPTIONS = [120, 180, 240, 300, 360, 420];

// Mesma lógica de VehicleProfileAssistant, pra imóvel. Ver
// ListingsService.recommendProperty (faixa de orçamento) e
// AiService.recommendProperty (escolha dos anúncios).
export function PropertyProfileAssistant() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<PropertyRecommendation | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const householdSize = formData.get("householdSize");
      const minBedrooms = formData.get("minBedrooms");
      const preferredCity = String(formData.get("preferredCity") ?? "").trim();
      const notes = String(formData.get("notes") ?? "").trim();
      const response = await recommendPropertyAction({
        monthlyIncome: Number(formData.get("monthlyIncome")),
        monthlyFixedExpenses: Number(formData.get("monthlyFixedExpenses")),
        availableDownPayment: Number(formData.get("availableDownPayment") || 0),
        installments: Number(formData.get("installments")),
        householdSize: householdSize ? Number(householdSize) : undefined,
        preferredCity: preferredCity || undefined,
        minBedrooms: minBedrooms ? Number(minBedrooms) : undefined,
        priority: formData.get("priority") as PropertyPriority,
        notes: notes || undefined,
      });
      if (response.ok) setResult(response.recommendation);
      else setError(response.error);
    });
  }

  return (
    <div className="flex flex-col gap-6 rounded-brand border border-brand-blue/30 bg-brand-blue/5 p-6">
      <div>
        <p className="flex items-center gap-1.5 text-sm font-bold text-brand-blue">
          <Sparkle size={18} weight="fill" />
          IA: qual imóvel é ideal pra mim?
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          Conta sua situação financeira — sem compromisso nenhum — e a gente sugere uma faixa de preço que
          cabe no seu bolso, com anúncios reais da plataforma que encaixam nela.
        </p>
      </div>

      <form action={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Renda mensal (R$)" name="monthlyIncome" type="number" min={0} />
        <FormField label="Gastos fixos mensais (R$)" name="monthlyFixedExpenses" type="number" min={0} />
        <FormField
          label="Entrada disponível (R$)"
          name="availableDownPayment"
          type="number"
          min={0}
          required={false}
          defaultValue={0}
        />
        <SelectField
          label="Parcelas pretendidas"
          name="installments"
          options={INSTALLMENT_OPTIONS.map((n) => ({ value: String(n), label: `${n}x` }))}
          defaultValue="360"
        />
        <FormField
          label="Pessoas que vão morar"
          name="householdSize"
          type="number"
          min={1}
          required={false}
          placeholder="Ex.: 3"
        />
        <FormField
          label="Quartos mínimos"
          name="minBedrooms"
          type="number"
          min={0}
          required={false}
          placeholder="Ex.: 2"
        />
        <FormField label="Cidade de preferência" name="preferredCity" required={false} placeholder="Ex.: Belo Horizonte" />
        <SelectField label="Prioridade" name="priority" options={PRIORITY_OPTIONS} />
        <div className="sm:col-span-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-ink">
              Observações <span className="font-normal text-ink-muted">(opcional)</span>
            </span>
            <textarea
              name="notes"
              rows={2}
              placeholder="Ex.: preciso de vaga de garagem, prefiro andar baixo..."
              className="rounded-brand border border-border bg-surface-page px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
            />
          </label>
        </div>

        <Button type="submit" disabled={isPending} className="self-start sm:col-span-2">
          {isPending ? "Analisando..." : "Quero a recomendação"}
        </Button>
      </form>

      {error && <p className="text-sm text-status-danger">{error}</p>}

      {result && (
        <div className="flex flex-col gap-4 border-t border-border pt-4">
          <p className="text-sm font-bold text-ink">
            Faixa de orçamento recomendada: {formatBRL(result.budgetRangeMin)} a {formatBRL(result.budgetRangeMax)}
          </p>
          <p className="text-sm text-ink-muted">{result.summary}</p>
          {result.recommendations.length > 0 && (
            <div className="flex flex-wrap gap-5">
              {result.recommendations.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

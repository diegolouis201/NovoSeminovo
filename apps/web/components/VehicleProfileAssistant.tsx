"use client";

import { useState, useTransition } from "react";
import { Sparkle } from "@phosphor-icons/react/dist/ssr";
import { formatBRL, type MainUse, type Priority, type VehicleRecommendation } from "@novoseminovo/shared-types";
import { Button } from "@/components/Button";
import { FormField, SelectField } from "@/components/FormField";
import { ListingCard } from "@/components/ListingCard";
import { recommendVehicleAction } from "@/lib/actions/listings";

const MAIN_USE_OPTIONS: { value: MainUse; label: string }[] = [
  { value: "commute", label: "Ir e voltar do trabalho/estudo" },
  { value: "family", label: "Uso familiar" },
  { value: "work", label: "Trabalho (carga, atender clientes)" },
  { value: "leisure", label: "Lazer / viagens" },
];

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: "economy", label: "Economia (combustível/manutenção)" },
  { value: "space", label: "Espaço interno" },
  { value: "comfort", label: "Conforto" },
  { value: "performance", label: "Desempenho" },
  { value: "reliability", label: "Confiabilidade" },
];

const INSTALLMENT_OPTIONS = [12, 24, 36, 48, 60, 72, 84];

// Formulário curto de propósito (6 campos obrigatórios) — o objetivo é a
// pessoa responder em menos de um minuto, não preencher uma anamnese
// financeira completa. Ver ListingsService.recommendVehicle (cálculo da
// faixa de orçamento) e AiService.recommendVehicle (escolha dos anúncios).
export function VehicleProfileAssistant() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<VehicleRecommendation | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const familySize = formData.get("familySize");
      const notes = String(formData.get("notes") ?? "").trim();
      const response = await recommendVehicleAction({
        monthlyIncome: Number(formData.get("monthlyIncome")),
        monthlyFixedExpenses: Number(formData.get("monthlyFixedExpenses")),
        availableDownPayment: Number(formData.get("availableDownPayment") || 0),
        installments: Number(formData.get("installments")),
        mainUse: formData.get("mainUse") as MainUse,
        familySize: familySize ? Number(familySize) : undefined,
        priority: formData.get("priority") as Priority,
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
          IA: qual carro é ideal pra mim?
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
          defaultValue="48"
        />
        <SelectField label="Uso principal" name="mainUse" options={MAIN_USE_OPTIONS} />
        <SelectField label="Prioridade" name="priority" options={PRIORITY_OPTIONS} />
        <FormField
          label="Tamanho da família"
          name="familySize"
          type="number"
          min={1}
          required={false}
          placeholder="Ex.: 4"
        />
        <div className="sm:col-span-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-ink">
              Observações <span className="font-normal text-ink-muted">(opcional)</span>
            </span>
            <textarea
              name="notes"
              rows={2}
              placeholder="Ex.: preciso de porta-malas grande, ando bastante em estrada..."
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

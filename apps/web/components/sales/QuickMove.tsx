"use client";

import { SALES_STAGES, type SalesStageId } from "@novoseminovo/shared-types";

// Seletor de etapa no card do quadro: muda e já salva. "Perdida" abre a ficha
// para escrever o motivo.
export function QuickMove({ action, stage }: { action: (formData: FormData) => void; stage: SalesStageId }) {
  return (
    <form action={action}>
      <label className="sr-only" htmlFor={`etapa-${stage}`}>
        Mudar etapa
      </label>
      <select
        name="stage"
        defaultValue={stage}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="w-full rounded-brand border border-border bg-surface-page px-2 py-1 text-xs text-ink"
      >
        {SALES_STAGES.filter((s) => s.manual).map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </form>
  );
}

import { Check } from "@phosphor-icons/react/dist/ssr";
import { VEHICLE_CONDITION_OPTIONS, VEHICLE_FEATURE_OPTIONS } from "@novoseminovo/shared-types";

// Opcionais e condições do carro como "botões" de marcar (estilo Webmotors) —
// checkbox de verdade por baixo, então funciona sem JavaScript e chega no
// formData como várias entradas "features"/"conditions".
function Chips({ name, options }: { name: string; options: readonly { value: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <label
          key={option.value}
          className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-surface-raised px-3 py-1.5 text-sm text-ink has-[:checked]:border-brand-blue has-[:checked]:bg-brand-blue has-[:checked]:text-on-blue has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-blue"
        >
          <input type="checkbox" name={name} value={option.value} className="peer sr-only" />
          <Check size={14} weight="bold" className="hidden peer-checked:block" aria-hidden />
          {option.label}
        </label>
      ))}
    </div>
  );
}

export function VehicleOptionsFields() {
  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold text-ink">Opcionais</legend>
        <p className="-mt-1 text-xs text-ink-muted">Marque o que o carro tem — aparece no anúncio e nos filtros da busca.</p>
        <Chips name="features" options={VEHICLE_FEATURE_OPTIONS} />
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold text-ink">Condições</legend>
        <p className="-mt-1 text-xs text-ink-muted">
          Seja transparente: informar financiamento em aberto ou passagem por leilão evita surpresa e desistência na hora
          de fechar.
        </p>
        <Chips name="conditions" options={VEHICLE_CONDITION_OPTIONS} />
      </fieldset>
    </>
  );
}

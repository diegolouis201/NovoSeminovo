import { ClipboardText } from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/Badge";

// Ainda sem parceiro de consórcio fechado (ver pedido do Diego) — card só
// anuncia a novidade, botão fica desabilitado até termos um link de verdade
// pra trocar por este.
const COPY: Record<"vehicle" | "property", string> = {
  vehicle:
    "Programe a troca do seu carro no prazo e parcela que fazem sentido pra você. Simulador chegando em breve.",
  property:
    "Encontre a melhor proposta pra comprar seu imóvel no prazo e parcela que fazem sentido pra você. Simulador chegando em breve.",
};

export function ConsorcioCallout({ assetType }: { assetType: "vehicle" | "property" }) {
  return (
    <div className="flex w-full max-w-sm flex-col gap-3 rounded-brand border border-border bg-surface-raised p-4">
      <div className="flex items-start gap-3">
        <ClipboardText size={40} weight="duotone" className="shrink-0 text-brand-purple" />
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-base font-bold text-ink">Consórcio fácil e sem burocracia!</h3>
            <Badge label="Novidade" tone="purple" />
          </div>
          <p className="text-sm text-ink-muted">{COPY[assetType]}</p>
        </div>
      </div>
      <span
        aria-disabled="true"
        className="cursor-not-allowed self-start rounded-full border border-border px-4 py-2 text-sm font-semibold text-ink-muted"
      >
        Em breve
      </span>
    </div>
  );
}

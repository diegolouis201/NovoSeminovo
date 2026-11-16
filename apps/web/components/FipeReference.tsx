import { referenciaFipe } from "@novoseminovo/shared-types";

// "Referência FIPE: R$ X" ao lado do preço do anúncio de veículo (promessa
// do guia 1). Sem FIPE no cadastro, não mostra nada.
export function FipeReference({ price, fipePrice }: { price: number; fipePrice?: number }) {
  const ref = referenciaFipe(price, fipePrice);
  if (!ref) return null;
  const tom =
    ref.situacao === "abaixo"
      ? "border-brand-green text-brand-green"
      : ref.situacao === "acima"
      ? "border-brand-orange text-brand-orange"
      : "border-brand-blue text-brand-blue";
  return (
    <div data-testid="referencia-fipe" className="rounded-brand border border-border bg-surface-raised px-3 py-2 text-sm">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ink">
        <span>
          Referência FIPE: <strong className="[font-variant-numeric:tabular-nums]">{ref.valorLabel}</strong>
        </span>
        <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${tom}`}>{ref.texto}</span>
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        valor de referência da tabela FIPE no cadastro do anúncio; confira o valor atual em{" "}
        <a
          href="https://veiculos.fipe.org.br/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-brand-blue underline"
        >
          veiculos.fipe.org.br
        </a>
      </p>
    </div>
  );
}

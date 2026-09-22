import { Button } from "@/components/Button";

// Único bloco deliberadamente "sério" da interface: surface-sober + radius-sober,
// paleta restrita a azul/neutros. Ver components/FinancingCallout/README.md no
// design system (Etapa 4) e a diretriz de tom no README do sistema.
export function FinancingCallout({
  price,
  downPayment,
  installments,
  rate,
}: {
  price: string;
  downPayment: string;
  installments: string;
  rate: string;
}) {
  return (
    <div className="flex w-full max-w-sm flex-col gap-3 rounded-sober bg-surface-sober p-6 text-ink">
      <p className="text-xs font-bold uppercase tracking-wide text-brand-blue">
        Simulação de financiamento
      </p>
      <p className="text-2xl font-extrabold [font-variant-numeric:tabular-nums]">{installments}</p>
      <div className="flex flex-col gap-1 border-y border-border py-3 text-sm">
        <Row k="Valor do bem" v={price} />
        <Row k="Entrada estimada" v={downPayment} />
        <Row k="Taxa estimada" v={rate} />
      </div>
      <Button variant="secondary" sober>
        Simular financiamento
      </Button>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-ink-muted">{k}</span>
      <span className="font-semibold">{v}</span>
    </div>
  );
}

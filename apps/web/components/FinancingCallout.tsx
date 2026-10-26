"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/Button";
import { simulateFinancingAction } from "@/lib/actions/financing";

// Veículo entra na lista com 0% — financiamento de carro no Brasil costuma
// ser anunciado "sem entrada"; imóvel usa o padrão de mercado de 20%.
const DOWN_PAYMENT_OPTIONS = [0, 0.1, 0.2, 0.3, 0.4, 0.5];
const DEFAULT_DOWN_PAYMENT_PCT: Record<"vehicle" | "property", number> = {
  vehicle: 0,
  property: 0.2,
};
const INSTALLMENT_OPTIONS: Record<"vehicle" | "property", number[]> = {
  vehicle: [12, 24, 36, 48, 60, 72, 84],
  // 420x (35 anos) é o teto de alguns bancos pra financiamento imobiliário —
  // além do padrão de mercado de 360x (30 anos).
  property: [120, 180, 240, 300, 360, 420],
};

// Único bloco deliberadamente "sério" da interface: surface-sober + radius-sober,
// paleta restrita a azul/neutros. Ver components/FinancingCallout/README.md no
// design system (Etapa 4) e a diretriz de tom no README do sistema.
export function FinancingCallout({
  listingId,
  assetType,
  price,
  priceValue,
  downPayment,
  installments,
  rate,
}: {
  listingId: string;
  assetType: "vehicle" | "property";
  price: string;
  priceValue: number;
  downPayment: string;
  installments: string;
  rate: string;
}) {
  const [open, setOpen] = useState(false);
  const [downPaymentPct, setDownPaymentPct] = useState(DEFAULT_DOWN_PAYMENT_PCT[assetType]);
  const installmentOptions = INSTALLMENT_OPTIONS[assetType];
  const [selectedInstallments, setSelectedInstallments] = useState(
    installmentOptions[Math.floor(installmentOptions.length / 2)]!,
  );
  const [result, setResult] = useState<{
    downPaymentLabel: string;
    installmentLabel: string;
    rateLabel: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const shown = result ?? { downPaymentLabel: downPayment, installmentLabel: installments, rateLabel: rate };

  function handleSimulate() {
    setError(null);
    startTransition(async () => {
      const simulation = await simulateFinancingAction(listingId, {
        assetPrice: priceValue,
        downPaymentPct,
        installments: selectedInstallments,
      });
      if (simulation) setResult(simulation);
      else setError("Não foi possível simular agora. Tente de novo em instantes.");
    });
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-3 rounded-sober bg-surface-sober p-6 text-ink">
      <p className="text-xs font-bold uppercase tracking-wide text-brand-blue">Estimativa de financiamento</p>
      <p className="text-2xl font-extrabold [font-variant-numeric:tabular-nums]">{shown.installmentLabel}</p>
      <div className="flex flex-col gap-1 border-y border-border py-3 text-sm">
        <Row k="Valor do bem" v={price} />
        <Row k="Entrada estimada" v={shown.downPaymentLabel} />
        <Row k="Taxa de referência" v={shown.rateLabel} />
      </div>
      {/* Deixar claro de onde vem a conta: taxa fixa de referência do site,
          não oferta de banco (a simulação com os bancos é o CredihomeSimulator). */}
      <p className="text-[11px] leading-snug text-ink-muted">
        Cálculo aproximado feito pelo NovoSeminovo com uma taxa de referência fixa (tabela Price, sem seguros
        {assetType === "property" ? ", TR" : ""} e tarifas). Não é oferta de banco: a taxa real depende da análise de crédito.
        {assetType === "property" && " Para ver as taxas dos bancos, use \"Simular crédito com um banco de verdade\" abaixo."}
      </p>

      {open ? (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
            Entrada
            <select
              className="rounded-sober border border-border bg-white px-3 py-2 text-sm text-ink"
              value={downPaymentPct}
              onChange={(event) => setDownPaymentPct(Number(event.target.value))}
            >
              {DOWN_PAYMENT_OPTIONS.map((pct) => (
                <option key={pct} value={pct}>
                  {Math.round(pct * 100)}%
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
            Parcelas
            <select
              className="rounded-sober border border-border bg-white px-3 py-2 text-sm text-ink"
              value={selectedInstallments}
              onChange={(event) => setSelectedInstallments(Number(event.target.value))}
            >
              {installmentOptions.map((n) => (
                <option key={n} value={n}>
                  {n}x
                </option>
              ))}
            </select>
          </label>
          {error && <p className="text-xs text-status-danger">{error}</p>}
          <Button variant="secondary" sober type="button" disabled={isPending} onClick={handleSimulate}>
            {isPending ? "Calculando..." : "Calcular"}
          </Button>
        </div>
      ) : (
        <Button variant="secondary" sober type="button" onClick={() => setOpen(true)}>
          Ajustar entrada e parcelas
        </Button>
      )}
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

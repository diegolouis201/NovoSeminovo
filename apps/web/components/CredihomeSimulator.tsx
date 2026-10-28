"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Bank, CheckCircle } from "@phosphor-icons/react";
import {
  CREDIHOME_PURCHASE_WINDOWS,
  CredihomeProposalInputSchema,
  CredihomeSimulateInputSchema,
  type CredihomeSimulateInput,
  type CredihomeSimulationView,
} from "@novoseminovo/shared-types";
import { requestCredihomeProposalAction, simulateCredihomeAction } from "@/lib/actions/credihome";

// Simulador da Credihome usado quando a API não responde — o mesmo link que
// a página tinha antes do simulador próprio.
const CREDIHOME_FALLBACK_URL = "https://simular.credihome.com.br/novoseminovo";

const MONTH_OPTIONS = [420, 360, 300, 240, 180, 120];

const inputClass = "w-full rounded-brand border border-border bg-surface-page px-3 py-2 text-sm text-ink";
const labelClass = "flex flex-col gap-1 text-xs font-semibold text-ink";

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Aceita "450.000", "450.000,00", "R$ 450000" — o que a pessoa digitar.
function parseMoney(raw: string): number {
  const digits = raw.replace(/[^\d.,]/g, "");
  const normalized = digits.includes(",")
    ? digits.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(digits)
      ? digits.replace(/\./g, "")
      : digits;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

function firstError(result: { success: boolean; error?: { issues: Array<{ message: string }> } }): string | undefined {
  return result.success ? undefined : result.error?.issues[0]?.message;
}

type Step = "simulate" | "results" | "proposal" | "done";

export function CredihomeSimulator({ listingId, price }: { listingId: string; price: number }) {
  const [step, setStep] = useState<Step>("simulate");
  const [error, setError] = useState<string | undefined>();
  const [unavailable, setUnavailable] = useState(false);
  const [pending, startTransition] = useTransition();
  const [simulation, setSimulation] = useState<CredihomeSimulationView | undefined>();
  const [simInput, setSimInput] = useState<CredihomeSimulateInput | undefined>();
  const [outcome, setOutcome] = useState<"sent" | "already_sent" | "saved" | undefined>();

  const header = (
    <div className="flex items-start justify-between gap-2">
      <div>
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-brand-blue">
          <Bank size={16} weight="bold" /> Simule seu financiamento
        </p>
        <p className="mt-1 text-xs text-ink-muted">Parcelas dos bancos parceiros, com a Credihome.</p>
      </div>
      {step !== "simulate" && step !== "done" && (
        <button
          type="button"
          onClick={() => {
            setStep("simulate");
            setError(undefined);
          }}
          className="shrink-0 text-xs font-semibold text-ink-muted hover:underline"
        >
          Recomeçar
        </button>
      )}
    </div>
  );

  const errorBox = error && (
    <div className="rounded-brand bg-status-danger/10 px-3 py-2 text-xs text-status-danger">
      <p>{error}</p>
      {unavailable && (
        <a href={CREDIHOME_FALLBACK_URL} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block font-bold underline">
          Simular no site da Credihome
        </a>
      )}
    </div>
  );

  return (
    <section className="flex w-full max-w-sm flex-col gap-3 rounded-brand border border-brand-blue bg-surface-raised p-4 shadow-card">
      {header}

      {step === "simulate" && (
        <form
          action={(formData) => {
            const input = {
              realtyPrice: parseMoney(String(formData.get("realtyPrice") ?? "")),
              mortgageValue: parseMoney(String(formData.get("mortgageValue") ?? "")),
              dateOfBirth: String(formData.get("dateOfBirth") ?? ""),
              months: Number(formData.get("months")),
              purchaseWindow: String(formData.get("purchaseWindow") ?? ""),
            };
            const parsed = CredihomeSimulateInputSchema.safeParse(input);
            if (!parsed.success) {
              setError(firstError(parsed));
              setUnavailable(false);
              return;
            }
            startTransition(async () => {
              const result = await simulateCredihomeAction(listingId, parsed.data);
              if (!result.ok) {
                setError(result.error);
                setUnavailable(Boolean(result.unavailable));
                return;
              }
              setError(undefined);
              setSimInput(parsed.data);
              setSimulation(result.simulation);
              setStep("results");
            });
          }}
          className="flex flex-col gap-3"
        >
          <div className="flex gap-2">
            <label className={`${labelClass} min-w-0 flex-1`}>
              Valor do imóvel
              <input
                name="realtyPrice"
                inputMode="decimal"
                defaultValue={simInput?.realtyPrice.toLocaleString("pt-BR") ?? price.toLocaleString("pt-BR")}
                className={inputClass}
              />
            </label>
            <label className={`${labelClass} min-w-0 flex-1`}>
              Valor a financiar
              <input
                name="mortgageValue"
                inputMode="decimal"
                defaultValue={(simInput?.mortgageValue ?? Math.round(price * 0.8)).toLocaleString("pt-BR")}
                className={inputClass}
              />
            </label>
          </div>
          <p className="-mt-2 text-[11px] text-ink-muted">Os bancos costumam financiar até 80% do valor do imóvel.</p>
          <div className="flex gap-2">
            <label className={`${labelClass} min-w-0 flex-1`}>
              Data de nascimento
              <input name="dateOfBirth" type="date" required defaultValue={simInput?.dateOfBirth} className={inputClass} />
            </label>
            <label className={`${labelClass} w-32 shrink-0`}>
              Prazo
              <select name="months" defaultValue={simInput?.months ?? 360} className={inputClass}>
                {MONTH_OPTIONS.map((months) => (
                  <option key={months} value={months}>
                    {months} meses
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className={labelClass}>
            Quando pretende comprar?
            <select name="purchaseWindow" required defaultValue={simInput?.purchaseWindow ?? ""} className={inputClass}>
              <option value="" disabled>
                Selecione
              </option>
              {Object.entries(CREDIHOME_PURCHASE_WINDOWS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {errorBox}
          <button
            type="submit"
            disabled={pending}
            className="rounded-brand bg-brand-blue px-4 py-3 text-sm font-bold text-on-blue disabled:opacity-50"
          >
            {pending ? "Consultando os bancos…" : "Ver parcelas"}
          </button>
          <p className="text-[11px] text-ink-muted">Nesta etapa não pedimos CPF nem contato.</p>
        </form>
      )}

      {step === "results" && simulation && simInput && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-ink-muted">
            {brl(simInput.mortgageValue)} em {simInput.months} meses · primeira parcela
          </p>
          {simulation.results.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {simulation.results.map((row, index) => (
                <li
                  key={`${row.bank}-${index}`}
                  className={`rounded-brand border px-3 py-2 ${index === 0 ? "border-brand-green bg-brand-green/5" : "border-border"}`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-bold text-ink">{row.bank}</span>
                    <span className="text-sm font-bold text-ink [font-variant-numeric:tabular-nums]">{brl(row.firstPayment)}</span>
                  </div>
                  <p className="text-[11px] text-ink-muted">
                    {[
                      row.annualRate !== undefined && `${row.annualRate.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% a.a.`,
                      row.table,
                      row.minimumIncome !== undefined && `renda mínima ${brl(row.minimumIncome)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink">Nenhum banco aprovou esses valores. Tente financiar menos ou aumentar o prazo.</p>
          )}
          {simulation.warnings.map((warning) => (
            <p key={warning} className="rounded-brand bg-brand-orange/10 px-3 py-2 text-xs text-ink">
              {warning}
            </p>
          ))}
          <p className="text-[11px] text-ink-muted">
            Taxas e parcelas informadas agora pelos bancos, por meio da Credihome. Incluem seguros obrigatórios e podem
            mudar na análise de crédito.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep("simulate")}
              className="rounded-brand border border-border px-3 py-2 text-sm font-semibold text-ink"
            >
              Mudar valores
            </button>
            <button
              type="button"
              onClick={() => {
                setError(undefined);
                setStep("proposal");
              }}
              className="flex-1 rounded-brand bg-brand-green px-3 py-2 text-sm font-bold text-on-green"
            >
              Quero esse financiamento
            </button>
          </div>
        </div>
      )}

      {step === "proposal" && simInput && (
        <form
          action={(formData) => {
            const input = {
              ...simInput,
              name: String(formData.get("name") ?? ""),
              cpf: String(formData.get("cpf") ?? ""),
              phone: String(formData.get("phone") ?? ""),
              email: String(formData.get("email") ?? "").trim(),
              useFgts: formData.get("useFgts") === "on",
              consent: formData.get("consent") === "on",
            };
            const parsed = CredihomeProposalInputSchema.safeParse(input);
            if (!parsed.success) {
              setError(firstError(parsed));
              setUnavailable(false);
              return;
            }
            startTransition(async () => {
              const result = await requestCredihomeProposalAction(listingId, { ...input, consent: true });
              if (!result.ok) {
                setError(result.error);
                setUnavailable(false);
                return;
              }
              setError(undefined);
              setOutcome(result.outcome);
              setStep("done");
            });
          }}
          className="flex flex-col gap-3"
        >
          <p className="text-xs text-ink-muted">
            Um especialista da Credihome compara os bancos e te chama com a proposta. Sem custo para você.
          </p>
          <p className="rounded-brand bg-brand-green/10 px-3 py-2 text-xs text-ink">
            <strong>Cashback:</strong> fechando o financiamento pelo NovoSeminovo, 20% da nossa comissão volta para você, por Pix.{" "}
            <Link href="/recompensas" target="_blank" className="font-semibold text-brand-blue underline">
              Como funciona
            </Link>
            <span className="mt-0.5 block text-[11px] text-ink-muted">
              Valor bruto; você recebe o líquido, depois que o banco paga a comissão. Entre na sua conta para acompanhar.
            </span>
          </p>
          <label className={labelClass}>
            Nome completo
            <input name="name" required autoComplete="name" className={inputClass} />
          </label>
          <div className="flex gap-2">
            <label className={`${labelClass} min-w-0 flex-1`}>
              CPF
              <input name="cpf" required inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" className={inputClass} />
            </label>
            <label className={`${labelClass} min-w-0 flex-1`}>
              Celular (WhatsApp)
              <input name="phone" required inputMode="tel" autoComplete="tel" placeholder="(31) 99999-9999" className={inputClass} />
            </label>
          </div>
          <label className={labelClass}>
            E-mail
            <input name="email" type="email" required autoComplete="email" className={inputClass} />
          </label>
          <label className="flex items-center gap-2 text-xs text-ink">
            <input name="useFgts" type="checkbox" /> Quero usar meu FGTS
          </label>
          <label className="flex items-start gap-2 text-xs text-ink">
            <input name="consent" type="checkbox" required className="mt-0.5" />
            <span>
              Autorizo o NovoSeminovo a enviar meus dados à Credihome (Loft) para simulação, análise de crédito e contato sobre
              a proposta. Veja a{" "}
              <Link href="/privacidade" target="_blank" className="font-semibold text-brand-blue underline">
                política de privacidade
              </Link>
              .
            </span>
          </label>
          {errorBox}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep("results")}
              className="rounded-brand border border-border px-3 py-2 text-sm font-semibold text-ink"
            >
              Voltar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-brand bg-brand-green px-3 py-2 text-sm font-bold text-on-green disabled:opacity-50"
            >
              {pending ? "Enviando…" : "Enviar para análise"}
            </button>
          </div>
        </form>
      )}

      {step === "done" && (
        <div className="flex flex-col items-center gap-2 py-2 text-center">
          <CheckCircle size={40} weight="fill" className="text-brand-green" />
          <p className="text-sm font-bold text-ink">
            {outcome === "already_sent" ? "Você já pediu uma proposta para este imóvel." : "Pedido enviado!"}
          </p>
          <p className="text-xs text-ink-muted">
            {outcome === "already_sent"
              ? "Seu pedido está em andamento. Logo um especialista fala com você."
              : "Um especialista vai te chamar no WhatsApp com a proposta dos bancos."}
          </p>
        </div>
      )}
    </section>
  );
}

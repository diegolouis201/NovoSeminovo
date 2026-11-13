"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Bank, CheckCircle } from "@phosphor-icons/react";
import {
  CONSENTIMENTO_CREDITO,
  CREDITAS_TIME_TO_PURCHASE,
  CreditasProposalInputSchema,
  TERMO_BACEN_CREDITAS,
} from "@novoseminovo/shared-types";
import { requestCreditasProposalAction } from "@/lib/actions/creditas";

// Pedido de financiamento de veículo pela Creditas (Autofin C2C), na página
// do anúncio. Só aparece com NEXT_PUBLIC_CREDITAS_FORM=1 (ver a página do
// anúncio): o termo BACEN ainda espera confirmação jurídica.

const inputClass = "w-full rounded-brand border border-border bg-surface-page px-3 py-2 text-sm text-ink";
const labelClass = "flex flex-col gap-1 text-xs font-semibold text-ink";

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Aceita "20.000", "20.000,00", "R$ 20000" — o que a pessoa digitar.
function parseMoney(raw: string): number {
  const digits = raw.replace(/[^\d.,]/g, "");
  if (!digits) return 0;
  const normalized = digits.includes(",")
    ? digits.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(digits)
      ? digits.replace(/\./g, "")
      : digits;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : Number.NaN;
}

export function CreditasSimulator({ listingId, price }: { listingId: string; price: number }) {
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<"sent" | "already_sent" | "saved" | undefined>();
  const [downValue, setDownValue] = useState(0);

  const financing = Math.max(0, price - downValue);

  return (
    <section
      data-testid="creditas-simulator"
      className="flex w-full max-w-sm flex-col gap-3 rounded-brand border border-brand-blue bg-surface-raised p-4 shadow-card"
    >
      <div>
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-brand-blue">
          <Bank size={16} weight="bold" /> Financie este veículo
        </p>
        <p className="mt-1 text-xs text-ink-muted">Proposta de crédito com a Creditas, pela IBS Capital. Sem custo para você.</p>
      </div>

      {outcome ? (
        <div className="flex flex-col items-center gap-2 py-2 text-center">
          <CheckCircle size={40} weight="fill" className="text-brand-green" />
          <p className="text-sm font-bold text-ink">
            {outcome === "already_sent" ? "Você já pediu uma proposta para este veículo." : "Pedido enviado!"}
          </p>
          <p className="text-xs text-ink-muted">
            {outcome === "already_sent"
              ? "Seu pedido está em andamento. Logo um especialista fala com você."
              : "Um especialista vai te chamar no WhatsApp com a proposta."}
          </p>
        </div>
      ) : (
        <form
          action={(formData) => {
            const input = {
              name: String(formData.get("name") ?? ""),
              cpf: String(formData.get("cpf") ?? ""),
              birthDate: String(formData.get("birthDate") ?? ""),
              phone: String(formData.get("phone") ?? ""),
              email: String(formData.get("email") ?? "").trim(),
              downValue: parseMoney(String(formData.get("downValue") ?? "")),
              timeToPurchase: String(formData.get("timeToPurchase") ?? ""),
              consent: formData.get("consent") === "on",
              bacenConsent: formData.get("bacenConsent") === "on",
            };
            const parsed = CreditasProposalInputSchema.safeParse(input);
            if (!parsed.success) {
              setError(parsed.error.issues[0]?.message);
              return;
            }
            if ((parsed.data.downValue ?? 0) >= price) {
              setError("A entrada precisa ser menor que o valor do veículo.");
              return;
            }
            startTransition(async () => {
              const result = await requestCreditasProposalAction(listingId, parsed.data);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setError(undefined);
              setOutcome(result.outcome);
            });
          }}
          className="flex flex-col gap-3"
        >
          <label className={labelClass}>
            Nome completo
            <input name="name" required maxLength={120} autoComplete="name" className={inputClass} />
          </label>
          <div className="flex gap-2">
            <label className={`${labelClass} min-w-0 flex-1`}>
              CPF
              <input name="cpf" required maxLength={20} inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" className={inputClass} />
            </label>
            <label className={`${labelClass} min-w-0 flex-1`}>
              Data de nascimento
              <input name="birthDate" type="date" required className={inputClass} />
            </label>
          </div>
          <div className="flex gap-2">
            <label className={`${labelClass} min-w-0 flex-1`}>
              Celular (WhatsApp)
              <input name="phone" required maxLength={30} inputMode="tel" autoComplete="tel" placeholder="(31) 99999-9999" className={inputClass} />
            </label>
            <label className={`${labelClass} min-w-0 flex-1`}>
              E-mail
              <input name="email" type="email" required maxLength={200} autoComplete="email" className={inputClass} />
            </label>
          </div>
          <label className={labelClass}>
            Entrada (opcional)
            <input
              name="downValue"
              inputMode="decimal"
              placeholder="R$ 0"
              onChange={(event) => {
                const value = parseMoney(event.target.value);
                setDownValue(Number.isFinite(value) ? value : 0);
              }}
              className={inputClass}
            />
          </label>
          <p className="-mt-2 text-[11px] text-ink-muted">
            Veículo {brl(price)} · valor a financiar {brl(financing)}
          </p>
          <label className={labelClass}>
            Quando pretende comprar?
            <select name="timeToPurchase" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                Selecione
              </option>
              {Object.entries(CREDITAS_TIME_TO_PURCHASE).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-start gap-2 text-xs text-ink">
            <input name="consent" type="checkbox" required className="mt-0.5" />
            <span>
              {CONSENTIMENTO_CREDITO.veiculo} Veja a{" "}
              <Link href="/privacidade" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-blue underline">
                política de privacidade
              </Link>
              .
            </span>
          </label>
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold text-ink">Autorização de consulta ao Banco Central (SCR)</p>
            <div
              data-testid="creditas-termo-bacen"
              tabIndex={0}
              className="max-h-36 overflow-y-auto rounded-brand border border-border bg-surface-page px-3 py-2 text-[11px] leading-relaxed text-ink-muted"
            >
              {TERMO_BACEN_CREDITAS.texto}
            </div>
            <label className="flex items-start gap-2 text-xs text-ink">
              <input name="bacenConsent" type="checkbox" required className="mt-0.5" />
              <span>Li e aceito a autorização de consulta acima.</span>
            </label>
          </div>

          {error && <p className="rounded-brand bg-status-danger/10 px-3 py-2 text-xs text-status-danger">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="rounded-brand bg-brand-green px-4 py-3 text-sm font-bold text-on-green disabled:opacity-50"
          >
            {pending ? "Enviando…" : "Enviar para análise"}
          </button>
          <p className="text-[11px] text-ink-muted">
            O NovoSeminovo não é instituição financeira. A aprovação depende de análise de crédito.
          </p>
        </form>
      )}
    </section>
  );
}

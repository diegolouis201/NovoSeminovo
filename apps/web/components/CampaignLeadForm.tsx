"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { CheckCircle } from "@phosphor-icons/react";
import { CAMPAIGN_BUSINESS_TYPES, CAMPAIGN_CONSENT_TEXT } from "@novoseminovo/shared-types";
import { sendCampaignLeadAction, type CampaignLeadState } from "@/lib/actions/campaign-lead";
import { BRAZIL_STATES } from "@/lib/brazil-states";
import { flushMetaEvents } from "@/lib/meta-events";

const inputClass =
  "w-full rounded-brand border border-border bg-surface-page px-4 py-3 text-base text-ink placeholder:text-ink-muted focus:border-brand-blue focus:outline-none";
const labelClass = "mb-1 block text-sm font-semibold text-ink";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="w-full rounded-brand bg-brand-green px-4 py-3.5 text-base font-bold text-on-green hover:opacity-90 disabled:opacity-60">
      {pending ? "Enviando…" : "Quero começar"}
    </button>
  );
}

// Formulário da campanha para lojas, imobiliárias e corretores. A equipe
// comercial recebe na hora e chama no WhatsApp.
export function CampaignLeadForm() {
  const [state, action] = useFormState<CampaignLeadState, FormData>(sendCampaignLeadAction, { status: "idle" });
  // Lead no pixel da Meta (só com aceite dos cookies), com o id que a API usou.
  useEffect(() => {
    if (state.status === "sent") flushMetaEvents();
  }, [state]);

  if (state.status === "sent") {
    return (
      <div className="rounded-brand-lg bg-surface-raised p-6 text-center shadow-card" role="status">
        <CheckCircle size={44} weight="fill" className="mx-auto text-brand-green" />
        <h2 className="mt-3 font-display text-2xl font-semibold text-ink">Recebemos!</h2>
        <p className="mt-2 text-sm text-ink-muted">Vamos te chamar no WhatsApp. Se quiser adiantar, já dá para criar a conta da sua empresa agora.</p>
        <Link href="/parceiro" className="mt-5 inline-block rounded-brand bg-brand-green px-5 py-3 text-sm font-bold text-on-green">
          Criar minha conta agora
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4 rounded-brand-lg bg-surface-raised p-6 shadow-card">
      <h2 className="font-display text-xl font-semibold text-ink">Fale com a gente</h2>
      <div>
        <label htmlFor="cl-name" className={labelClass}>Seu nome</label>
        <input id="cl-name" name="name" required maxLength={120} autoComplete="name" className={inputClass} />
      </div>
      <div>
        <label htmlFor="cl-company" className={labelClass}>Nome da empresa</label>
        <input id="cl-company" name="company" required maxLength={160} autoComplete="organization" className={inputClass} />
      </div>
      <div>
        <label htmlFor="cl-type" className={labelClass}>Tipo</label>
        <select id="cl-type" name="businessType" required defaultValue="" className={inputClass}>
          <option value="" disabled>Escolha</option>
          {Object.entries(CAMPAIGN_BUSINESS_TYPES).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-[1fr_6.5rem] gap-3">
        <div>
          <label htmlFor="cl-city" className={labelClass}>Cidade</label>
          <input id="cl-city" name="city" required maxLength={80} autoComplete="address-level2" className={inputClass} />
        </div>
        <div>
          <label htmlFor="cl-state" className={labelClass}>UF</label>
          <select id="cl-state" name="state" required defaultValue="" className={inputClass}>
            <option value="" disabled>UF</option>
            {BRAZIL_STATES.map((s) => (
              <option key={s.uf} value={s.uf}>{s.uf}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="cl-phone" className={labelClass}>WhatsApp com DDD</label>
        <input id="cl-phone" name="phone" type="tel" inputMode="tel" required maxLength={20} autoComplete="tel" placeholder="(00) 00000-0000" className={inputClass} />
      </div>
      <div>
        <label htmlFor="cl-email" className={labelClass}>E-mail</label>
        <input id="cl-email" name="email" type="email" required maxLength={160} autoComplete="email" className={inputClass} />
      </div>
      <div>
        <label htmlFor="cl-cnpj" className={labelClass}>CNPJ <span className="font-normal text-ink-muted">(opcional)</span></label>
        <input id="cl-cnpj" name="cnpj" inputMode="numeric" maxLength={20} className={inputClass} />
      </div>
      {/* Campo isca: escondido de pessoas; robô que preenche é ignorado. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="cl-website">Site</label>
        <input id="cl-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <label className="flex gap-3 text-sm text-ink">
        <input type="checkbox" name="consent" required className="mt-1 h-4 w-4 shrink-0" />
        <span>
          {CAMPAIGN_CONSENT_TEXT}{" "}
          Veja a{" "}
          <Link href="/privacidade" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-blue underline">
            Política de Privacidade
          </Link>
          .
        </span>
      </label>
      {state.status === "error" && (
        <p className="rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger" role="alert">
          {state.error}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}

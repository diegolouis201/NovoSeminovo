"use client";

import { useFormState, useFormStatus } from "react-dom";
import { MARKETING_INTERESTS } from "@novoseminovo/shared-types";
import { newsletterAction, type NewsletterState } from "@/lib/actions/newsletter";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-brand bg-brand-green px-4 py-2 text-sm font-semibold text-on-green hover:opacity-90 disabled:opacity-60">
      {pending ? "Enviando…" : "Quero receber"}
    </button>
  );
}

// Lista de novidades por e-mail (rodapé). Consentimento explícito: a caixa
// começa desmarcada e é obrigatória.
export function NewsletterForm() {
  const [state, action] = useFormState<NewsletterState, FormData>(newsletterAction, {});
  if (state.ok) {
    return <p className="text-sm text-ink">Pronto! Você vai receber as novidades do NovoSeminovo por e-mail. Dá para sair quando quiser.</p>;
  }
  return (
    <form action={action} className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-ink">Receba novidades por e-mail</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input name="email" type="email" required placeholder="seu@email.com" aria-label="Seu e-mail" className="min-w-0 flex-1 rounded-brand border border-border bg-surface-page px-3 py-2 text-sm text-ink placeholder:text-ink-muted" />
        <select name="interest" aria-label="Seu interesse" defaultValue="geral" className="rounded-brand border border-border bg-surface-page px-3 py-2 text-sm text-ink">
          {Object.entries(MARKETING_INTERESTS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <Submit />
      </div>
      <label className="flex items-start gap-2 text-xs text-ink-muted">
        <input type="checkbox" name="consent" value="1" required className="mt-0.5" />
        <span>Autorizo o NovoSeminovo a me enviar novidades e dicas por e-mail. Posso sair a qualquer momento pelo link no rodapé dos e-mails.</span>
      </label>
      {state.error && <p className="text-xs text-status-danger">{state.error}</p>}
    </form>
  );
}

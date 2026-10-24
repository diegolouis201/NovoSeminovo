"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { applyAffiliateAction, type AffiliateApplyState } from "@/lib/actions/affiliates";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="self-start rounded-brand bg-brand-green px-5 py-2.5 font-bold text-on-green hover:opacity-90 disabled:opacity-60">
      {pending ? "Enviando…" : label}
    </button>
  );
}

// Inscrição no programa (ou atualização dos dados: canais e chave Pix).
export function AffiliateApplyForm({
  defaults,
  submitLabel,
  showTerms = true,
}: {
  defaults?: { channels?: string; audience?: string; pixKey?: string };
  submitLabel: string;
  showTerms?: boolean;
}) {
  const [state, action] = useFormState<AffiliateApplyState, FormData>(applyAffiliateAction, {});
  const fieldClass = "rounded-brand border border-border bg-surface-page px-3 py-2 text-ink placeholder:text-ink-muted";
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && (
        <p role="alert" className="rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
          {state.error}
        </p>
      )}
      {state.ok && <p className="rounded-brand bg-surface-sober px-4 py-3 text-sm text-ink">Dados salvos.</p>}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold text-ink">Onde você divulga</span>
        <textarea
          id="aff-channels"
          name="channels"
          required
          rows={3}
          maxLength={600}
          defaultValue={defaults?.channels}
          placeholder="Ex.: Instagram @meuperfil, canal no YouTube /meucanal, grupo de corretores no WhatsApp"
          className={fieldClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold text-ink">
          Tamanho do público <span className="font-normal text-ink-muted">(opcional)</span>
        </span>
        <input id="aff-audience" name="audience" maxLength={200} defaultValue={defaults?.audience} placeholder="Ex.: 25 mil seguidores, 300 clientes na carteira" className={fieldClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold text-ink">Chave Pix para receber</span>
        <input id="aff-pix" name="pixKey" required maxLength={140} defaultValue={defaults?.pixKey} placeholder="CPF, e-mail, telefone ou chave aleatória" className={fieldClass} />
        <span className="text-xs text-ink-muted">A chave precisa estar no seu nome (o mesmo CPF da sua conta).</span>
      </label>
      {showTerms ? (
        <label className="flex items-start gap-2 text-sm text-ink">
          <input id="aff-terms" type="checkbox" name="acceptTerms" required className="mt-1" />
          <span>
            Li e aceito as{" "}
            <Link href="/afiliados#regras" target="_blank" className="font-semibold text-brand-blue underline">
              regras do programa de afiliados
            </Link>
            .
          </span>
        </label>
      ) : (
        <input type="hidden" name="acceptTerms" value="on" />
      )}
      <Submit label={submitLabel} />
    </form>
  );
}

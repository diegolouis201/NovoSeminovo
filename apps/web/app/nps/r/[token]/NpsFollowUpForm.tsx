"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { NPS_COMMENT_MAX, NPS_OBRIGADO, NPS_PERGUNTA_ACOMPANHAMENTO, NPS_PERGUNTA_CONTATO, type NpsFaixa } from "@novoseminovo/shared-types";
import { responderNpsAction } from "@/lib/actions/nps-email";

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="min-h-12 rounded-full bg-brand-green px-6 py-3 font-bold text-on-green hover:opacity-90 disabled:opacity-60">
      {pending ? "Enviando..." : "Enviar resposta"}
    </button>
  );
}

// Pergunta de acompanhamento (opcional) depois do clique na nota.
export function NpsFollowUpForm({ token, faixa, comment, wantsContact }: { token: string; faixa: NpsFaixa; comment?: string; wantsContact?: boolean }) {
  const [state, action] = useFormState(responderNpsAction, {});
  const [tamanho, setTamanho] = useState(comment?.length ?? 0);
  if (state.ok) {
    return (
      <p role="status" className="rounded-brand bg-surface-sober px-4 py-4 text-lg font-semibold text-ink">
        {NPS_OBRIGADO}
      </p>
    );
  }
  return (
    <form action={action} method="post" className="flex flex-col gap-6 text-left">
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-1">
        <label htmlFor="nps-comment" className="font-semibold text-ink">
          {NPS_PERGUNTA_ACOMPANHAMENTO[faixa]}
        </label>
        <textarea
          id="nps-comment"
          name="comment"
          rows={5}
          maxLength={NPS_COMMENT_MAX}
          defaultValue={comment}
          aria-describedby="nps-comment-ajuda"
          onInput={(e) => setTamanho(e.currentTarget.value.length)}
          className="rounded-brand border border-ink-muted bg-surface-page px-3 py-2 text-base text-ink"
        />
        <span id="nps-comment-ajuda" className="text-sm text-ink-muted">
          Opcional · {tamanho} de {NPS_COMMENT_MAX} caracteres
        </span>
      </div>
      {faixa === "detrator" ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold text-ink">{NPS_PERGUNTA_CONTATO}</legend>
          <div className="flex gap-6">
            <label className="flex min-h-12 items-center gap-2 text-ink">
              <input type="radio" name="wantsContact" value="sim" defaultChecked={wantsContact === true} className="h-5 w-5 accent-[var(--brand-blue)]" />
              Sim
            </label>
            <label className="flex min-h-12 items-center gap-2 text-ink">
              <input type="radio" name="wantsContact" value="nao" defaultChecked={wantsContact === false} className="h-5 w-5 accent-[var(--brand-blue)]" />
              Não
            </label>
          </div>
        </fieldset>
      ) : null}
      <div className="flex flex-col items-start gap-2">
        <Enviar />
        {state.erro ? (
          <p role="alert" className="text-sm font-semibold text-status-danger">
            {state.erro}
          </p>
        ) : null}
      </div>
    </form>
  );
}

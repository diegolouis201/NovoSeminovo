"use client";

import { useFormState, useFormStatus } from "react-dom";
import { emailTesteNps } from "@/lib/nps-actions";

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button className="btn" disabled={pending}>
      {pending ? "Enviando..." : "Enviar e-mail de teste para mim"}
    </button>
  );
}

// E-mail de teste com o modelo real (link de teste: a nota não conta no NPS)
// e prévia num iframe sem scripts (sandbox vazio).
export function NpsTeste() {
  const [state, action] = useFormState(emailTesteNps, {});
  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap items-center gap-3">
        <Botao />
        {state.erro ? <span role="alert" className="text-sm font-semibold text-danger">{state.erro}</span> : null}
      </form>
      {state.ok ? <p role="status" className="text-sm font-semibold text-green">{state.ok}</p> : null}
      {state.html ? (
        <div>
          <p className="mb-2 text-sm text-muted">Assunto: <b className="text-navy">{state.assunto}</b></p>
          <iframe title="Prévia do e-mail" sandbox="" srcDoc={state.html} className="h-[760px] w-full rounded-lg border border-line bg-white" />
        </div>
      ) : null}
    </div>
  );
}

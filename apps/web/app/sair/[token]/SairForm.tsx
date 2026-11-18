"use client";

import { useFormState, useFormStatus } from "react-dom";
import { sairDaProspeccaoAction } from "@/lib/actions/prospeccao-sair";

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-full bg-brand-green px-6 py-3 font-bold text-on-green disabled:opacity-60">
      {pending ? "Saindo..." : "Não quero receber mais e-mails"}
    </button>
  );
}

export function SairForm({ token }: { token: string }) {
  const [state, action] = useFormState(sairDaProspeccaoAction, {});
  if (state.ok) {
    return (
      <p role="status" className="text-lg font-semibold text-ink">
        Pronto. Você não vai mais receber e-mails de prospecção do NovoSeminovo neste endereço.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <Botao />
      {state.erro ? <p role="alert" className="text-sm font-semibold text-status-danger">{state.erro}</p> : null}
    </form>
  );
}

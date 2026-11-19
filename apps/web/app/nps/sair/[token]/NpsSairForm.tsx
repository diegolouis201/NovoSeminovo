"use client";

import { useFormState, useFormStatus } from "react-dom";
import { sairDoNpsAction } from "@/lib/actions/nps-email";

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="min-h-12 rounded-full bg-brand-green px-6 py-3 font-bold text-on-green disabled:opacity-60">
      {pending ? "Saindo..." : "Não quero mais receber esta pesquisa"}
    </button>
  );
}

export function NpsSairForm({ token }: { token: string }) {
  const [state, action] = useFormState(sairDoNpsAction, {});
  if (state.ok) {
    return (
      <p role="status" className="text-lg font-semibold text-ink">
        Pronto. Você não vai mais receber a pesquisa de satisfação do NovoSeminovo por e-mail.
      </p>
    );
  }
  return (
    <form action={action} method="post" className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <Botao />
      {state.erro ? (
        <p role="alert" className="text-sm font-semibold text-status-danger">
          {state.erro}
        </p>
      ) : null}
    </form>
  );
}

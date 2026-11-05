"use client";

import { useFormState, useFormStatus } from "react-dom";
import { entrar } from "@/lib/actions";

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button className="w-full rounded-xl bg-orange py-3 font-semibold text-white transition hover:brightness-110 disabled:opacity-60" disabled={pending}>
      {pending ? "Entrando..." : "Entrar"}
    </button>
  );
}

export function EntrarForm() {
  const [state, action] = useFormState(entrar, {});
  return (
    <form action={action} className="mt-8 space-y-4 text-left">
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/70" htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" required maxLength={200} autoComplete="username" className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-3 text-white outline-none focus:border-orange" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/70" htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" required maxLength={200} autoComplete="current-password" className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-3 text-white outline-none focus:border-orange" />
      </div>
      {state.erro ? <p role="alert" className="text-sm text-orange">{state.erro}</p> : null}
      <Botao />
    </form>
  );
}

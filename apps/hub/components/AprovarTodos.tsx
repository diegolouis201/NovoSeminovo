"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { aprovarTodosConteudos } from "@/lib/actions";

function Botao({ total }: { total: number }) {
  const { pending } = useFormStatus();
  return <button className="btn-primary" disabled={pending}>{pending ? "Aprovando..." : `Sim, aprovar os ${total}`}</button>;
}

// Aprova de uma vez tudo que está na fila e já tem data e hora.
export function AprovarTodos({ total }: { total: number }) {
  const [state, action] = useFormState(aprovarTodosConteudos, {});
  const [confirmar, setConfirmar] = useState(false);
  if (state.ok) return <p className="rounded-xl bg-green/10 p-3 text-sm font-semibold text-green">{state.ok}</p>;
  if (!total) return null;
  return confirmar ? (
    <form action={action} className="flex flex-wrap items-center gap-2 rounded-xl bg-cream p-3 text-sm">
      <span>Aprovar os {total} conteúdos com data, cada um na data e hora marcadas?</span>
      <Botao total={total} />
      <button type="button" className="btn" onClick={() => setConfirmar(false)}>Cancelar</button>
      {state.erro ? <span className="text-danger">{state.erro}</span> : null}
    </form>
  ) : (
    <button type="button" className="btn-primary" onClick={() => setConfirmar(true)}>Aprovar todos ({total})</button>
  );
}

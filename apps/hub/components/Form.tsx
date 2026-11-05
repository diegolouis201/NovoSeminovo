"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { Resultado } from "@/lib/actions";

function Enviar({ texto }: { texto: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" disabled={pending}>
      {pending ? "Salvando..." : texto}
    </button>
  );
}

// Formulário com mensagem de ok/erro; limpa os campos depois de salvar
// (menos quando "manter" — ex.: marcações e meta, que mostram o valor salvo).
export function Form({ action, botao, children, manter = false, className = "space-y-3" }: { action: (s: Resultado, f: FormData) => Promise<Resultado>; botao: string; children: React.ReactNode; manter?: boolean; className?: string }) {
  const [state, run] = useFormState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && !manter) ref.current?.reset();
  }, [state, manter]);
  return (
    <form ref={ref} action={run} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Enviar texto={botao} />
        {state.ok ? <span className="text-sm font-semibold text-green">{state.ok}</span> : null}
        {state.erro ? <span role="alert" className="text-sm font-semibold text-danger">{state.erro}</span> : null}
      </div>
    </form>
  );
}

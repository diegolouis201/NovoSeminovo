"use client";

import { useFormState, useFormStatus } from "react-dom";
import { inscreverSequencia } from "@/lib/actions";

function Enviar() {
  const { pending } = useFormStatus();
  return <button className="btn-primary" disabled={pending}>{pending ? "Inscrevendo..." : "Inscrever empresas"}</button>;
}

// Inscreve todas as empresas de uma etiqueta (só quem tem e-mail, não saiu,
// não é parceira, está em "A abordar" e não está em outra sequência ativa).
export function InscreverForm({ id, etiquetas, inicial }: { id: string; etiquetas: { etiqueta: string; total: number }[]; inicial?: string }) {
  const [state, run] = useFormState(inscreverSequencia, {});
  return (
    <form action={run} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div>
        <label className="label" htmlFor="etiqueta-inscrever">Etiqueta da campanha</label>
        <select id="etiqueta-inscrever" name="etiqueta" required defaultValue={inicial ?? ""} className="input">
          <option value="" disabled>Escolha a etiqueta</option>
          {etiquetas.map((e) => (
            <option key={e.etiqueta} value={e.etiqueta}>{e.etiqueta} ({e.total})</option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Enviar />
        <span role="status" className="text-sm font-semibold text-green">{state.ok}</span>
        {state.erro ? <span role="alert" className="text-sm font-semibold text-danger">{state.erro}</span> : null}
      </div>
      {state.detalhe ? <p className="text-xs text-muted">{state.detalhe}</p> : null}
    </form>
  );
}

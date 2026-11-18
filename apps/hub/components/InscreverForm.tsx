"use client";

import { useFormState, useFormStatus } from "react-dom";
import { inscreverSequencia } from "@/lib/actions";

function Enviar() {
  const { pending } = useFormStatus();
  return <button className="btn-primary" disabled={pending}>{pending ? "Inscrevendo..." : "Inscrever empresas"}</button>;
}

const TIPOS = [
  ["", "Todos os tipos"],
  ["vehicle", "Lojas de veículos"],
  ["property", "Imobiliárias"],
  ["broker", "Corretores de imóveis"],
  ["other", "Outros"],
] as const;

// Inscreve as empresas de uma etiqueta e/ou de um tipo (só quem tem e-mail,
// não saiu, não é parceira, está em "A abordar", não está em outra sequência
// ativa e cujo e-mail nunca falou com outra caixa).
export function InscreverForm({ id, etiquetas, inicial }: { id: string; etiquetas: { etiqueta: string; total: number }[]; inicial?: string }) {
  const [state, run] = useFormState(inscreverSequencia, {});
  return (
    <form action={run} className="space-y-3" aria-labelledby="inscrever-titulo">
      <p id="inscrever-titulo" className="sr-only">Inscrever empresas</p>
      <input type="hidden" name="id" value={id} />
      <div>
        <label className="label" htmlFor="etiqueta-inscrever">Etiqueta da campanha</label>
        <select id="etiqueta-inscrever" name="etiqueta" defaultValue={inicial ?? ""} className="input" aria-describedby="inscrever-ajuda">
          <option value="">Todas as etiquetas</option>
          {etiquetas.map((e) => (
            <option key={e.etiqueta} value={e.etiqueta}>{e.etiqueta} ({e.total})</option>
          ))}
        </select>
      </div>
      <fieldset>
        <legend className="label">Tipo de empresa</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {TIPOS.map(([v, rotulo]) => (
            <span key={v} className="flex items-center gap-2">
              <input type="radio" id={`tipo-${v || "todos"}`} name="segmento" value={v} defaultChecked={v === ""} className="accent-blue" />
              <label htmlFor={`tipo-${v || "todos"}`}>{rotulo}</label>
            </span>
          ))}
        </div>
      </fieldset>
      <p id="inscrever-ajuda" className="text-xs text-muted">Escolha a etiqueta, o tipo ou os dois. Uma empresa nunca fica em duas sequências ativas.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Enviar />
        <span role="status" className="text-sm font-semibold text-green">{state.ok}</span>
        {state.erro ? <span role="alert" className="text-sm font-semibold text-danger">{state.erro}</span> : null}
      </div>
      {state.detalhe ? <p className="text-xs text-muted">{state.detalhe}</p> : null}
    </form>
  );
}

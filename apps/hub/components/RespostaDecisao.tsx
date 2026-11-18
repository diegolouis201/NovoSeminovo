"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { decidirResposta, rejeitarResposta } from "@/lib/actions";

function Botao({ texto, classe = "btn-primary", name, value, disabled }: { texto: string; classe?: string; name?: string; value?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={classe} disabled={pending || disabled} name={name} value={value}>
      {pending ? "Enviando..." : texto}
    </button>
  );
}

// Aprovar (sai o rascunho da IA), editar e enviar (sai o texto do dono) ou
// rejeitar com um motivo opcional (vira orientação para os próximos).
export function RespostaDecisao({ id, texto, semRascunho }: { id: string; texto: string; semRascunho: boolean }) {
  const [dec, decidir] = useFormState(decidirResposta, {});
  const [rej, rejeitar] = useFormState(rejeitarResposta, {});
  const [valor, setValor] = useState(texto);
  const [rejeitando, setRejeitando] = useState(false);
  const editado = valor.trim() !== texto.trim();
  const fim = dec.ok ?? rej.ok;
  if (fim) return <p role="status" className="rounded-xl bg-green/10 p-3 text-sm font-semibold text-green">{fim}</p>;
  return (
    <div className="space-y-3">
      <form action={decidir} className="space-y-2" aria-labelledby={`r-${id}-titulo`}>
        <input type="hidden" name="id" value={id} />
        <label className="label" htmlFor={`r-${id}-texto`} id={`r-${id}-titulo`}>
          {semRascunho ? "Escreva a resposta (a assistente não responde este caso sozinha)" : "Resposta (pode editar antes de enviar)"}
        </label>
        <textarea id={`r-${id}-texto`} name="texto" rows={8} maxLength={3000} value={valor} onChange={(e) => setValor(e.target.value)} className="input font-[inherit]" aria-describedby={`r-${id}-ajuda`} required={semRascunho} />
        <p id={`r-${id}-ajuda`} className="text-xs text-muted">O rodapé com o link de saída entra sozinho. Sai seg a sex, das 9h às 18h, dentro do limite do dia.</p>
        <div className="flex flex-wrap gap-2">
          {!semRascunho ? <Botao texto="Aprovar e enviar" name="acao" value="aprovar" disabled={editado} /> : null}
          <Botao texto="Editar e enviar" classe={semRascunho ? "btn-primary" : "btn"} name="acao" value="editar" disabled={!semRascunho && !editado} />
          <button type="button" className="btn" aria-expanded={rejeitando} aria-controls={`r-${id}-rejeitar`} onClick={() => setRejeitando((v) => !v)}>
            Rejeitar
          </button>
        </div>
        {editado && !semRascunho ? <p className="text-xs text-muted">Você mudou o texto: use “Editar e enviar”.</p> : null}
        {dec.erro ? <p role="alert" className="text-sm font-semibold text-danger">{dec.erro}</p> : null}
      </form>
      <form id={`r-${id}-rejeitar`} hidden={!rejeitando} action={rejeitar} className="space-y-2 rounded-xl bg-cream p-3">
        <input type="hidden" name="id" value={id} />
        <label className="label" htmlFor={`r-${id}-motivo`}>Por que rejeitar? (opcional, ensina a assistente)</label>
        <input id={`r-${id}-motivo`} name="motivo" maxLength={500} className="input" />
        <Botao texto="Rejeitar sem enviar" classe="btn" />
        {rej.erro ? <p role="alert" className="text-sm font-semibold text-danger">{rej.erro}</p> : null}
      </form>
    </div>
  );
}

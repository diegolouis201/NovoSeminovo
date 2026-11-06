"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { MKT_REDES } from "@novoseminovo/shared-types";
import { aprovarConteudo, marcarPublicadoManual, pedirAjuste } from "@/lib/actions";

const nome = (r: string) => MKT_REDES[r as keyof typeof MKT_REDES] ?? r;

function Botao({ texto, classe = "btn-primary", name, value }: { texto: string; classe?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={classe} disabled={pending} name={name} value={value}>
      {pending ? "..." : texto}
    </button>
  );
}

// Aprovar (com data e hora, ou publicar agora) ou pedir ajuste ao Claude.
export function Decisao({ id, sugestao, automatico, manual }: { id: string; sugestao?: string; automatico: string[]; manual: string[] }) {
  const [aprov, aprovar] = useFormState(aprovarConteudo, {});
  const [aj, ajustar] = useFormState(pedirAjuste, {});
  const [modo, setModo] = useState<"" | "ajuste">("");
  const fim = aprov.ok || aj.ok;
  if (fim) return <p className="rounded-xl bg-green/10 p-3 text-sm font-semibold text-green">{aprov.ok ?? aj.ok}</p>;
  return (
    <div className="space-y-3">
      {modo === "ajuste" ? (
        <form action={ajustar} className="space-y-2">
          <input type="hidden" name="id" value={id} />
          <textarea name="feedback" required maxLength={2000} rows={3} className="input" placeholder="O que precisa mudar? (ex.: trocar a foto, legenda mais curta, marcar a @ da loja)" />
          <div className="flex gap-2">
            <Botao texto="Enviar pedido de ajuste" />
            <button type="button" className="btn" onClick={() => setModo("")}>Voltar</button>
          </div>
          {aj.erro ? <p className="text-sm text-danger">{aj.erro}</p> : null}
        </form>
      ) : (
        <form action={aprovar} className="space-y-2">
          <input type="hidden" name="id" value={id} />
          <label className="label" htmlFor={`q-${id}`}>Publicar em (horário de Brasília)</label>
          <input id={`q-${id}`} type="datetime-local" name="quando" defaultValue={sugestao} className="input" />
          <p className="text-xs text-muted">
            {automatico.length ? `O Hub publica sozinho no ${automatico.map(nome).join(" e ")}. ` : ""}
            {manual.length ? `Publicar à mão: ${manual.map(nome).join(", ")} (depois marque o link aqui).` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <Botao texto="Aprovar e agendar" />
            {automatico.length ? <Botao texto="Aprovar e publicar agora" classe="btn" name="agora" value="1" /> : null}
            <button type="button" className="btn" onClick={() => setModo("ajuste")}>Pedir ajuste</button>
          </div>
          {aprov.erro ? <p className="text-sm text-danger">{aprov.erro}</p> : null}
        </form>
      )}
    </div>
  );
}

// Já aprovado, ainda não publicado: puxar de volta para ajuste.
export function RecolherParaAjuste({ id }: { id: string }) {
  const [aj, ajustar] = useFormState(pedirAjuste, {});
  const [aberto, setAberto] = useState(false);
  if (aj.ok) return <p className="rounded-xl bg-green/10 p-3 text-sm font-semibold text-green">{aj.ok}</p>;
  return aberto ? (
    <form action={ajustar} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <textarea name="feedback" required maxLength={2000} rows={3} className="input" placeholder="O que precisa mudar antes de ir ao ar?" />
      <div className="flex gap-2">
        <Botao texto="Tirar da agenda e pedir ajuste" />
        <button type="button" className="btn" onClick={() => setAberto(false)}>Voltar</button>
      </div>
      {aj.erro ? <p className="text-sm text-danger">{aj.erro}</p> : null}
    </form>
  ) : (
    <button type="button" className="btn" onClick={() => setAberto(true)}>Pedir ajuste antes de publicar</button>
  );
}

export function MarcarPublicado({ id, redes }: { id: string; redes: string[] }) {
  const [state, action] = useFormState(marcarPublicadoManual, {});
  if (!redes.length) return null;
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
      <input type="hidden" name="id" value={id} />
      <select name="rede" className="input" aria-label="Rede">
        {redes.map((r) => <option key={r} value={r}>{nome(r)}</option>)}
      </select>
      <input name="link" type="url" required maxLength={500} className="input" placeholder="https://... (link do post publicado)" aria-label="Link" />
      <Botao texto="Marcar publicado" />
      {state.erro ? <p className="text-sm text-danger sm:col-span-3">{state.erro}</p> : null}
      {state.ok ? <p className="text-sm text-green sm:col-span-3">{state.ok}</p> : null}
    </form>
  );
}

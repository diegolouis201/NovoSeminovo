"use client";

import { useState } from "react";
import { Form } from "@/components/Form";
import { salvarEstrategia } from "@/lib/actions";
import type { Estrategia } from "@/lib/mkt";

const CAMPOS: [keyof Estrategia, string][] = [["objetivo", "Objetivo"], ["publico", "Público"], ["frequencia", "Frequência"], ["formatos", "Formatos"], ["horario", "Horário"], ["tom", "Tom"], ["notas", "Notas"]];

export function EstrategiaCard({ e, nome, sigla, cor, posts, publicados }: { e: Estrategia; nome: string; sigla: string; cor: string; posts: number; publicados: number }) {
  const [editar, setEditar] = useState(false);
  return (
    <article className="card flex flex-col gap-3">
      <header className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-lg font-display font-semibold text-white" style={{ background: cor }}>{sigla}</span>
        <h2 className="h2 flex-1">{nome}</h2>
        <span className={`pill ${e.status === "ativa" ? "bg-green/15 text-green" : "bg-line text-muted"}`}>{e.status || "planejada"}</span>
      </header>
      {editar ? (
        <Form action={salvarEstrategia} botao="Salvar estratégia" manter>
          <input type="hidden" name="plataforma" value={e.plataforma} />
          <select name="status" defaultValue={e.status || "planejada"} className="input" aria-label="Situação">
            <option value="ativa">ativa</option>
            <option value="planejada">planejada</option>
            <option value="pausada">pausada</option>
          </select>
          {CAMPOS.map(([k, l]) => (
            <div key={k}>
              <label className="label" htmlFor={`${e.plataforma}-${k}`}>{l}</label>
              <textarea id={`${e.plataforma}-${k}`} name={k} defaultValue={(e[k] as string) ?? ""} rows={2} maxLength={4000} className="input" />
            </div>
          ))}
        </Form>
      ) : (
        <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
          {CAMPOS.map(([k, l]) => (
            <div key={k} className="contents">
              <dt className="font-semibold text-muted">{l}</dt>
              <dd className="min-w-0 whitespace-pre-wrap">{(e[k] as string) || "—"}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-4 border-t border-line pt-3 text-sm">
        <span><b>{posts}</b> posts</span>
        <span><b>{publicados}</b> publicados</span>
        <button type="button" className="btn ml-auto" onClick={() => setEditar(!editar)}>{editar ? "Fechar" : "Editar estratégia"}</button>
      </div>
    </article>
  );
}

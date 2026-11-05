"use client";

import { useFormState, useFormStatus } from "react-dom";
import { baixarLancamento, editarCategoria, importarArquivo, type ResultadoImportacao } from "@/lib/actions";

type Op = { id: string; nome: string };

function Botao({ texto, classe = "btn" }: { texto: string; classe?: string }) {
  const { pending } = useFormStatus();
  return <button className={classe} disabled={pending}>{pending ? "..." : texto}</button>;
}

// Baixa (marca como pago/recebido) direto na linha da tabela.
export function Baixar({ id, contas, hoje, padrao }: { id: string; contas: Op[]; hoje: string; padrao?: string }) {
  const [state, action] = useFormState(baixarLancamento, {});
  if (state.ok) return <span className="text-xs font-semibold text-green">Baixado</span>;
  return (
    <details className="group">
      <summary className="btn cursor-pointer list-none py-1 text-xs group-open:hidden">Baixar</summary>
    <form action={action} className="flex flex-wrap items-center gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="date" name="pagoEm" defaultValue={hoje} className="input w-36 py-1 text-xs" aria-label="Data do pagamento" />
      <select name="conta" defaultValue={padrao ?? contas[0]?.id} className="input w-32 py-1 text-xs" aria-label="Conta">
        {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
      <Botao texto="Confirmar" />
      {state.erro ? <span className="w-full text-xs text-danger">{state.erro}</span> : null}
    </form>
    </details>
  );
}

// Trocar a categoria de um lançamento (ex.: o que veio do OFX como "Outras despesas").
export function TrocarCategoria({ id, atual, categorias }: { id: string; atual: string; categorias: { codigo: string; nome: string }[] }) {
  return (
    <form action={editarCategoria}>
      <input type="hidden" name="id" value={id} />
      <select name="categoria" defaultValue={atual} onChange={(e) => e.currentTarget.form?.requestSubmit()} className="w-full max-w-[13rem] rounded-lg border border-transparent bg-transparent py-1 text-xs hover:border-line" aria-label="Categoria">
        {categorias.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.nome}</option>)}
      </select>
    </form>
  );
}

export function Importar({ contas }: { contas: Op[] }) {
  const [state, action] = useFormState<ResultadoImportacao, FormData>(importarArquivo, {});
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="label" htmlFor="arquivo">Arquivo (.ofx do banco ou planilha .csv)</label>
        <input id="arquivo" name="arquivo" type="file" accept=".ofx,.csv,.txt" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="conta">Conta</label>
        <select id="conta" name="conta" className="input" defaultValue={contas[0]?.id}>
          {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <p className="mt-1 text-xs text-muted">No OFX é a conta do extrato. Na planilha, é a conta usada nas linhas já pagas.</p>
      </div>
      <Botao texto="Importar" classe="btn-primary" />
      {state.erro ? <p role="alert" className="text-sm font-semibold text-danger">{state.erro}</p> : null}
      {state.ok ? (
        <div className="rounded-xl bg-green/10 p-3 text-sm">
          <p className="font-semibold text-green">{state.ok}</p>
          <p>{state.lancamentos} lançamento(s) novo(s){state.transferencias ? `, ${state.transferencias} repasse(s) do Stripe como transferência` : ""}{state.repetidos ? `, ${state.repetidos} já importado(s) antes (ignorados)` : ""}.</p>
          {state.erros?.length ? <ul className="mt-2 list-disc pl-5 text-xs text-danger">{state.erros.map((e) => <li key={e}>{e}</li>)}</ul> : null}
        </div>
      ) : null}
    </form>
  );
}

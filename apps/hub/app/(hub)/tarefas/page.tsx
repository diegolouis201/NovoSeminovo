import { HUB_TASK_KINDS } from "@novoseminovo/shared-types";
import { Form } from "@/components/Form";
import { ListaTarefas } from "@/components/Tarefas";
import { Cabecalho, Secao } from "@/components/ui";
import { novaTarefa } from "@/lib/actions";
import { calc, datasDoSetor, feed, hoje, marcacoes, me, tarefas } from "@/lib/crm";
import { data } from "@/lib/format";

export const metadata = { title: "Tarefas e agenda" };

type Evento = { data: string; tipo: string; titulo: string; empresa?: string; detalhe?: string };

export default async function Tarefas() {
  const [access, abertas, feitas, f, m] = await Promise.all([me(), tarefas("abertas"), tarefas("concluidas"), feed(), marcacoes()]);
  const h = hoje();
  const fimHoje = new Date(`${h.toISOString().slice(0, 10)}T23:59:59-03:00`).toISOString();
  const em7 = new Date(new Date(fimHoje).getTime() + 7 * 86_400_000).toISOString();
  const deHoje = abertas.filter((t) => t.dueAt <= fimHoje);
  const proximas = abertas.filter((t) => t.dueAt > fimHoje && t.dueAt <= em7);
  const depois = abertas.filter((t) => t.dueAt > em7);
  const agenda: Evento[] = calc.agenda(f, m, datasDoSetor(), h, 30);
  const pode = access.permissions.includes("crm.editar");
  return (
    <>
      <Cabecalho titulo="Tarefas e agenda" subtitulo="Tarefas da equipe e o que vem nos próximos dias: contatos marcados, aniversários, fim do período grátis e datas do setor." />
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Secao titulo={`Hoje e vencidas (${deHoje.length})`}>
            <ListaTarefas itens={deHoje} podeEditar={pode} vazio="Nada pendente para hoje." />
          </Secao>
          <Secao titulo={`Próximos 7 dias (${proximas.length})`}>
            <ListaTarefas itens={proximas} podeEditar={pode} vazio="Nenhuma tarefa nos próximos 7 dias." />
          </Secao>
          {depois.length ? (
            <Secao titulo={`Mais adiante (${depois.length})`}>
              <ListaTarefas itens={depois} podeEditar={pode} />
            </Secao>
          ) : null}
          <Secao titulo="Concluídas recentemente">
            <ListaTarefas itens={feitas.slice(0, 15)} podeEditar={false} vazio="Nenhuma tarefa concluída ainda." />
          </Secao>
        </div>
        <div className="space-y-6">
          {pode ? (
            <section className="card" id="nova">
              <h2 className="h2 mb-3">Nova tarefa</h2>
              <p className="mb-3 text-sm text-muted">Para ligar a tarefa a uma empresa, crie pela ficha dela.</p>
              <Form action={novaTarefa} botao="Criar tarefa">
                <input name="titulo" required maxLength={200} className="input" placeholder="O que precisa ser feito?" />
                <div className="grid grid-cols-[1fr_6rem] gap-2">
                  <input type="date" name="dia" required min={h.toISOString().slice(0, 10)} className="input" aria-label="Dia" />
                  <input type="time" name="hora" defaultValue="09:00" className="input" aria-label="Hora" />
                </div>
                <select name="tipo" defaultValue="tarefa" className="input" aria-label="Tipo">
                  {Object.entries(HUB_TASK_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <textarea name="obs" maxLength={2000} rows={2} className="input" placeholder="Observação (opcional)" />
              </Form>
            </section>
          ) : null}
          <Secao titulo="Agenda dos próximos 30 dias">
            {agenda.length ? (
              <ul className="divide-y divide-line">
                {agenda.map((ev, i) => (
                  <li key={i} className="py-2 text-sm">
                    <p className="text-xs font-semibold text-blue">{data(ev.data)} · {ev.tipo}</p>
                    <p>{ev.titulo}</p>
                    {ev.detalhe ? <p className="text-xs text-muted">{ev.detalhe}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-sm text-muted">Nada nos próximos 30 dias.</p>
            )}
          </Secao>
        </div>
      </div>
    </>
  );
}

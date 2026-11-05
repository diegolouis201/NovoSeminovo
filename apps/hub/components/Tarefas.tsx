import Link from "next/link";
import { CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { HUB_TASK_KINDS, type HubTask } from "@novoseminovo/shared-types";
import { concluirTarefa } from "@/lib/actions";
import { dataHora } from "@/lib/format";

export function ListaTarefas({ itens, podeEditar, vazio = "Nada pendente." }: { itens: HubTask[]; podeEditar: boolean; vazio?: string }) {
  if (!itens.length) return <p className="py-6 text-center text-sm text-muted">{vazio}</p>;
  const agora = new Date().toISOString();
  return (
    <ul className="divide-y divide-line">
      {itens.map((t) => (
        <li key={t.id} className="flex items-start gap-3 py-3">
          {podeEditar && !t.concluidaEm ? (
            <form action={concluirTarefa}>
              <input type="hidden" name="id" value={t.id} />
              <button title="Concluir" aria-label={`Concluir ${t.title}`} className="mt-0.5 text-muted hover:text-green">
                <CheckCircle size={22} />
              </button>
            </form>
          ) : (
            <CheckCircle size={22} weight={t.concluidaEm ? "fill" : "regular"} className={t.concluidaEm ? "mt-0.5 text-green" : "mt-0.5 text-line"} />
          )}
          <div className="min-w-0 flex-1">
            <p className={`font-semibold ${t.concluidaEm ? "text-muted line-through" : "text-navy"}`}>
              {HUB_TASK_KINDS[t.kind]}: {t.title}
            </p>
            <p className={`text-xs ${!t.concluidaEm && t.dueAt < agora ? "font-semibold text-danger" : "text-muted"}`}>
              {dataHora(t.dueAt)}
              {t.empresa ? (
                <>
                  {" · "}
                  <Link className="link" href={`/empresas/${t.empresa.id}`}>
                    {t.empresa.nome}
                  </Link>
                </>
              ) : null}
              {t.responsavel ? ` · ${t.responsavel}` : null}
            </p>
            {t.notes ? <p className="mt-1 text-sm text-muted">{t.notes}</p> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

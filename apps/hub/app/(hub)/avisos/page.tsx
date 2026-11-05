import Link from "next/link";
import { Cabecalho, Nivel, Vazio } from "@/components/ui";
import { calc, datasDoSetor, feed, hoje, marcacoes } from "@/lib/crm";

export const metadata = { title: "Avisos do dia" };

type Aviso = { nivel: string; tipo: string; texto: string; empresa?: string; cardId?: string; empresaId?: string; importante?: boolean; ordem?: { area: string; titulo: string } };
const TITULO = { urgente: "Urgente", oportunidade: "Oportunidades", acompanhar: "Acompanhar" } as const;

export default async function Avisos() {
  const [f, m] = await Promise.all([feed(), marcacoes()]);
  const alertas: Aviso[] = calc.buildAlerts(f, m, datasDoSetor(), hoje());
  return (
    <>
      <Cabecalho titulo="Avisos do dia" subtitulo="Os mesmos avisos inteligentes do CRM, ao vivo: pagamentos, período grátis, NPS, leads parados, aniversários e datas do setor." />
      <div className="space-y-6">
        {(["urgente", "oportunidade", "acompanhar"] as const).map((nivel) => {
          const lista = alertas.filter((a) => a.nivel === nivel);
          return (
            <section key={nivel} className="card">
              <h2 className="h2 mb-3">{TITULO[nivel]} ({lista.length})</h2>
              {lista.length ? (
                <ul className="divide-y divide-line">
                  {lista.map((a, i) => (
                    <li key={i} className="flex flex-wrap items-start justify-between gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">
                          <Nivel nivel={a.nivel} /> {a.importante ? "⭐ " : ""}
                          {a.texto}
                        </p>
                        {a.ordem ? <p className="mt-1 text-xs text-muted">Sugestão ({a.ordem.area}): {a.ordem.titulo}</p> : null}
                      </div>
                      {a.cardId || a.empresaId ? <Link className="btn shrink-0" href={`/empresas/${a.cardId ?? a.empresaId}`}>Abrir ficha</Link> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <Vazio titulo="Nada por aqui" />
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

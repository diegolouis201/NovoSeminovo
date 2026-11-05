import Link from "next/link";
import { MKT_REDES } from "@novoseminovo/shared-types";
import { Cabecalho } from "@/components/ui";
import { COR_STATUS, exigirMarketing, mkt } from "@/lib/mkt";
import { nomeMes } from "@/lib/format";

export const metadata = { title: "Calendário de conteúdo" };
const SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const mover = (mes: string, n: number) => {
  const [a = 2026, m = 1] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7);
};

export default async function Calendario({ searchParams }: { searchParams: { mes?: string } }) {
  await exigirMarketing();
  const atual = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 7);
  const mes = /^\d{4}-\d{2}$/.test(searchParams.mes ?? "") ? searchParams.mes! : atual;
  const cal = await mkt.calendario(mes);
  const hojeDia = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  return (
    <>
      <Cabecalho
        titulo="Calendário de conteúdo"
        subtitulo={`${nomeMes(mes)} · horário de Brasília`}
        acao={
          <div className="flex gap-2">
            <Link className="btn" href={`?mes=${mover(mes, -1)}`}>← {nomeMes(mover(mes, -1)).split(" ")[0]}</Link>
            <Link className="btn" href={`?mes=${atual}`}>Hoje</Link>
            <Link className="btn" href={`?mes=${mover(mes, 1)}`}>{nomeMes(mover(mes, 1)).split(" ")[0]} →</Link>
          </div>
        }
      />
      <div className="card overflow-x-auto p-0">
        <div className="grid min-w-[900px] grid-cols-7 border-b border-line text-center text-xs font-semibold uppercase text-muted">
          {SEMANA.map((d) => <div key={d} className="py-2">{d}</div>)}
        </div>
        {cal.semanas.map((sem, i) => (
          <div key={i} className="grid min-w-[900px] grid-cols-7 border-b border-line last:border-0">
            {sem.map((d) => (
              <div key={d.dia} className={`min-h-28 border-r border-line p-1.5 last:border-0 ${d.doMes ? "" : "bg-cream/60"} ${d.dia === hojeDia ? "ring-2 ring-inset ring-orange" : ""}`}>
                <p className={`text-right text-xs ${d.doMes ? "text-navy" : "text-muted"}`}>{Number(d.dia.slice(8))}</p>
                <div className="space-y-1">
                  {d.itens.map((c) => (
                    <Link key={c.id} href={`/marketing/conteudos/${c.id}`} className={`block truncate rounded-md px-1.5 py-1 text-[11px] font-semibold ${COR_STATUS[c.status] ?? "bg-line"}`} title={c.titulo}>
                      {c.dataPlanejada ? new Date(c.dataPlanejada).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) : ""} {c.titulo}
                      <span className="block truncate font-normal opacity-80">{c.redes.map((r) => MKT_REDES[r as keyof typeof MKT_REDES] ?? r).join(" · ")}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      {cal.semData.length ? (
        <div className="card mt-4">
          <h2 className="h2 mb-2">Sem data ({cal.semData.length})</h2>
          <ul className="text-sm">{cal.semData.map((c) => <li key={c.id}><Link className="link" href={`/marketing/conteudos/${c.id}`}>{c.titulo}</Link></li>)}</ul>
        </div>
      ) : null}
      <p className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
        <span className="pill bg-orange/15 text-danger">Aguardando aprovação</span>
        <span className="pill bg-blue/10 text-blue">Aprovado</span>
        <span className="pill bg-green/15 text-green">Publicado</span>
        <span className="pill bg-orange/15 text-orange">Em ajuste</span>
      </p>
    </>
  );
}

import Link from "next/link";
import { BarraRegua } from "@/components/Barra";
import { Cabecalho, Kpi } from "@/components/ui";
import { calc, feed, hoje, marcacoes } from "@/lib/crm";
import { data } from "@/lib/format";
import { INTERACTION_KINDS } from "@novoseminovo/shared-types";

export const metadata = { title: "Régua de relacionamento" };

type R = { empresaId: string; cardId?: string; nome: string; vendedor?: string; plano?: string; ciclo: number; ultimo?: string; ultimoTipo?: string; vence: string; dias: number; progresso: number; situacao: string };

export default async function Regua({ searchParams }: { searchParams: { situacao?: string; vendedor?: string } }) {
  const [f, m] = await Promise.all([feed(), marcacoes()]);
  const todas: R[] = calc.regua(f, hoje(), m);
  const vendedores = [...new Set(todas.map((r) => r.vendedor).filter(Boolean))].sort() as string[];
  const lista = todas.filter((r) => !searchParams.situacao || r.situacao === searchParams.situacao).filter((r) => !searchParams.vendedor || r.vendedor === searchParams.vendedor);
  const conta = (s: string) => todas.filter((r) => r.situacao === s).length;
  return (
    <>
      <Cabecalho titulo="Régua de relacionamento" subtitulo="Assinantes: contato a cada 30 dias. Período grátis: a cada 15. Conta da última ligação, WhatsApp, e-mail ou reunião registrada." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi valor={conta("atrasado")} rotulo="Com contato atrasado" tom="danger" href="?situacao=atrasado" />
        <Kpi valor={conta("vencendo")} rotulo="Vencendo em até 7 dias" tom="orange" href="?situacao=vencendo" />
        <Kpi valor={conta("em_dia")} rotulo="Em dia" tom="green" href="?situacao=em_dia" />
        <Kpi valor={todas.length} rotulo="Empresas na régua" href="/regua" />
      </div>
      <form className="mt-6 flex flex-wrap gap-2">
        <select name="situacao" defaultValue={searchParams.situacao ?? ""} className="input w-auto">
          <option value="">Todas as situações</option>
          <option value="atrasado">Atrasado</option>
          <option value="vencendo">Vencendo</option>
          <option value="em_dia">Em dia</option>
        </select>
        <select name="vendedor" defaultValue={searchParams.vendedor ?? ""} className="input w-auto">
          <option value="">Todos os vendedores</option>
          {vendedores.map((v) => <option key={v}>{v}</option>)}
        </select>
        <button className="btn">Filtrar</button>
      </form>
      <div className="card mt-4 overflow-x-auto p-0">
        <table className="tabela min-w-[760px]">
          <thead><tr><th>Empresa</th><th className="w-1/3">Ciclo</th><th>Último contato</th><th>Vence</th><th></th></tr></thead>
          <tbody>
            {lista.map((r) => (
              <tr key={r.empresaId}>
                <td>
                  <Link className="link" href={`/empresas/${r.cardId ?? r.empresaId}`}>{r.nome}</Link>
                  <p className="text-xs text-muted">{[r.plano ?? "Período grátis", r.vendedor].filter(Boolean).join(" · ")}</p>
                </td>
                <td>
                  <BarraRegua progresso={r.progresso} situacao={r.situacao} />
                  <p className={`mt-1 text-xs font-semibold ${r.situacao === "atrasado" ? "text-danger" : r.situacao === "vencendo" ? "text-orange" : "text-green"}`}>
                    {r.dias < 0 ? `${-r.dias} dias de atraso` : `faltam ${r.dias} dias`} · a cada {r.ciclo} dias
                  </p>
                </td>
                <td className="text-sm">{r.ultimo ? `${data(r.ultimo)} · ${INTERACTION_KINDS[r.ultimoTipo as keyof typeof INTERACTION_KINDS] ?? ""}` : <span className="text-muted">Sem registro</span>}</td>
                <td className="text-sm">{data(r.vence)}</td>
                <td><Link className="btn" href={`/empresas/${r.cardId ?? r.empresaId}`}>Registrar contato</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!lista.length ? <p className="p-6 text-center text-sm text-muted">Nenhuma empresa nesta situação.</p> : null}
      </div>
    </>
  );
}

import { Cabecalho, Kpi, Secao } from "@/components/ui";
import { exigirFinanceiro, fin } from "@/lib/fin";
import { brl, nomeMes } from "@/lib/format";

export const metadata = { title: "Fluxo de caixa" };

export default async function FluxoCaixa({ searchParams }: { searchParams: { meses?: string } }) {
  await exigirFinanceiro();
  const meses = Math.min(24, Math.max(1, Number(searchParams.meses) || 6));
  const f = await fin.fluxo(meses);
  const max = Math.max(1, ...f.meses.map((m) => Math.abs(m.saldoFinal)));
  return (
    <>
      <Cabecalho
        titulo="Fluxo de caixa"
        subtitulo="Saldo de hoje mais o que vence em aberto (a receber − a pagar), mês a mês. Vencido em aberto conta no mês atual."
        acao={
          <form className="flex gap-2">
            <select name="meses" defaultValue={meses} className="input w-auto">
              {[3, 6, 12, 24].map((n) => <option key={n} value={n}>{n} meses</option>)}
            </select>
            <button className="btn">Ver</button>
          </form>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi valor={brl(f.saldoHoje)} rotulo="Saldo em caixa hoje" />
        <Kpi valor={brl(f.proximos30.aReceber)} rotulo="A receber nos próximos 30 dias" tom="green" />
        <Kpi valor={brl(f.proximos30.aPagar)} rotulo="A pagar nos próximos 30 dias" />
        <Kpi valor={brl(f.meses.at(-1)?.saldoFinal)} rotulo={`Saldo projetado em ${nomeMes(f.meses.at(-1)?.mes ?? "")}`} tom={(f.meses.at(-1)?.saldoFinal ?? 0) < 0 ? "danger" : "navy"} />
      </div>
      <Secao titulo="Saldo projetado" className="mt-6">
        <div className="flex h-48 items-end gap-3">
          {f.meses.map((m) => (
            <div key={m.mes} className="flex flex-1 flex-col items-center gap-1" title={`${nomeMes(m.mes)}: ${brl(m.saldoFinal)}`}>
              <span className={`text-xs font-semibold ${m.saldoFinal < 0 ? "text-danger" : "text-navy"}`}>{brl(m.saldoFinal).replace(",00", "")}</span>
              <div className={`w-full max-w-16 rounded-t ${m.saldoFinal < 0 ? "bg-orange" : "bg-blue"}`} style={{ height: `${(Math.abs(m.saldoFinal) / max) * 140}px` }} />
              <span className="text-[10px] uppercase text-muted">{nomeMes(m.mes).slice(0, 3)}</span>
            </div>
          ))}
        </div>
      </Secao>
      <div className="card mt-6 overflow-x-auto p-0">
        <table className="tabela min-w-[760px]">
          <thead><tr><th>Mês</th><th className="text-right">Entrou (realizado)</th><th className="text-right">Saiu (realizado)</th><th className="text-right">A receber</th><th className="text-right">A pagar</th><th className="text-right">Saldo no fim do mês</th></tr></thead>
          <tbody>
            {f.meses.map((m, i) => (
              <tr key={m.mes}>
                <td className="font-semibold capitalize">{nomeMes(m.mes)}{i === 0 ? " (em andamento)" : ""}</td>
                <td className="text-right text-green">{brl(m.entradasRealizadas)}</td>
                <td className="text-right">{brl(m.saidasRealizadas)}</td>
                <td className="text-right text-green">{brl(m.entradasPrevistas)}</td>
                <td className="text-right">{brl(m.saidasPrevistas)}</td>
                <td className={`text-right font-semibold ${m.saldoFinal < 0 ? "text-danger" : ""}`}>{brl(m.saldoFinal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">As mensalidades futuras do Stripe só entram quando são pagas. Para prever, lance a receita esperada como “a receber”, ou use o MRR do Dashboard de vendas.</p>
    </>
  );
}

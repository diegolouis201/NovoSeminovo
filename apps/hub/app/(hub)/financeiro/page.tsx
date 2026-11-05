import Link from "next/link";
import { Cabecalho, Kpi, Secao } from "@/components/ui";
import { exigirFinanceiro, fin, pct, variacao } from "@/lib/fin";
import { brl, brlCurto, data, nomeMes } from "@/lib/format";

export const metadata = { title: "Painel de indicadores" };

function Var({ atual, anterior }: { atual: number; anterior: number }) {
  const v = variacao(atual, anterior);
  if (v === undefined) return <span className="text-muted">sem base no ano anterior</span>;
  return (
    <span>
      <span className={`pill ${v >= 0 ? "bg-green/15 text-green" : "bg-orange/15 text-danger"}`}>{v >= 0 ? "▲" : "▼"} {pct(Math.abs(v))}</span> vs. {brlCurto(anterior)}
    </span>
  );
}

export default async function Painel({ searchParams }: { searchParams: { ano?: string } }) {
  await exigirFinanceiro();
  const p = await fin.painel(Number(searchParams.ano) || undefined);
  const a = p.acumulado;
  const max = Math.max(1, ...p.porMes.flatMap((m) => [m.receitaBruta, m.anterior, Math.abs(m.ebitda)]));
  const nomeCat = new Map(p.categorias.map((c) => [c.codigo, c.nome]));
  const atencao = p.atencao.vencidosReceber.quantidade + p.atencao.vencidosPagar.quantidade;
  return (
    <>
      <Cabecalho
        titulo="Painel de indicadores"
        subtitulo={`Acumulado de ${p.ano} até agora, por competência, comparado com o mesmo período de ${p.ano - 1}. Faturamento = planos (Stripe) + receitas lançadas.`}
        acao={
          <form className="flex gap-2">
            <select name="ano" defaultValue={p.ano} className="input w-auto">
              {[p.ano - 1, p.ano, p.ano + 1].map((y) => <option key={y}>{y}</option>)}
            </select>
            <button className="btn">Ver</button>
          </form>
        }
      />
      <Secao titulo="Pontos de atenção">
        {atencao ? (
          <p className="text-sm">
            <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-orange" />
            {p.atencao.vencidosReceber.quantidade + p.atencao.vencidosPagar.quantidade} lançamento(s) vencido(s) em aberto: {brl(p.atencao.vencidosReceber.valor)} a receber e {brl(p.atencao.vencidosPagar.valor)} a pagar.{" "}
            <Link className="link" href="/financeiro/lancamentos?status=vencido">Ver vencidos</Link>
          </p>
        ) : (
          <p className="text-sm text-muted">Nada vencido em aberto.</p>
        )}
        {p.equilibrio && p.equilibrio.folga < 0 ? <p className="mt-2 text-sm font-semibold text-danger">Abaixo do ponto de equilíbrio: faltam {brl(-p.equilibrio.folga)} por mês de faturamento.</p> : null}
      </Secao>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi valor={brlCurto(a.receitaBruta)} rotulo={`Receita bruta · ${p.ano}`} detalhe={<Var atual={a.receitaBruta} anterior={a.anterior.receitaBruta} />} tom="green" />
        <Kpi valor={a.receitaBruta ? pct((a.margemContribuicao / a.receitaBruta) * 100) : "—"} rotulo={`Margem de contribuição (${brlCurto(a.margemContribuicao)})`} />
        <Kpi valor={brlCurto(a.ebitda)} rotulo={`EBITDA${a.receitaBruta ? ` · margem ${pct((a.ebitda / a.receitaBruta) * 100)}` : ""}`} detalhe={<Var atual={a.ebitda} anterior={a.anterior.ebitda} />} tom={a.ebitda < 0 ? "danger" : "navy"} />
        <Kpi valor={brlCurto(a.lucroLiquido)} rotulo="Lucro líquido" detalhe={<Var atual={a.lucroLiquido} anterior={a.anterior.lucroLiquido} />} tom={a.lucroLiquido < 0 ? "danger" : "navy"} />
        <Kpi valor={brlCurto(a.retiradas)} rotulo="Retiradas dos sócios" detalhe={<Var atual={a.retiradas} anterior={a.anterior.retiradas} />} />
        <Kpi valor={brlCurto(p.saldos.total)} rotulo="Saldo em caixa hoje" detalhe={`${p.saldos.porConta.length} contas`} href="/financeiro/extrato" />
        <Kpi valor={brlCurto(p.fluxo.proximos30.aReceber - p.fluxo.proximos30.aPagar)} rotulo="Saldo dos próximos 30 dias" detalhe={`${brl(p.fluxo.proximos30.aReceber)} a receber · ${brl(p.fluxo.proximos30.aPagar)} a pagar`} href="/financeiro/fluxo" />
        <Kpi
          valor={p.equilibrio ? brlCurto(p.equilibrio.receitaNecessaria) : "—"}
          rotulo="Ponto de equilíbrio (receita/mês)"
          detalhe={p.equilibrio ? `${p.equilibrio.folga >= 0 ? "folga" : "falta"} ${brl(Math.abs(p.equilibrio.folga))}/mês · média atual ${brl(p.equilibrio.receitaMedia)}` : "precisa de meses fechados com receita"}
          tom={p.equilibrio && p.equilibrio.folga < 0 ? "danger" : "navy"}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Secao titulo="Receita bruta e EBITDA" acao={<span className="text-xs text-muted">{p.ano} mês a mês · {p.ano - 1} em tom claro</span>}>
          <div className="flex h-56 items-end gap-2">
            {p.porMes.map((m) => (
              <div key={m.mes} className="flex flex-1 flex-col items-center gap-1" title={`${nomeMes(m.mes)}: receita ${brl(m.receitaBruta)} · EBITDA ${brl(m.ebitda)} · ${p.ano - 1}: ${brl(m.anterior)}`}>
                <div className="flex h-48 w-full items-end justify-center gap-0.5">
                  <div className="w-1/3 rounded-t bg-blue/25" style={{ height: `${(m.anterior / max) * 100}%` }} />
                  <div className="w-1/3 rounded-t bg-blue" style={{ height: `${(m.receitaBruta / max) * 100}%` }} />
                  <div className={`w-1/4 rounded-t ${m.ebitda < 0 ? "bg-orange" : "bg-green"}`} style={{ height: `${(Math.abs(m.ebitda) / max) * 100}%` }} />
                </div>
                <span className="text-[10px] uppercase text-muted">{nomeMes(m.mes).slice(0, 3)}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
            <span><span className="mr-1 inline-block h-2 w-3 bg-blue/25" />Receita {p.ano - 1}</span>
            <span><span className="mr-1 inline-block h-2 w-3 bg-blue" />Receita {p.ano}</span>
            <span><span className="mr-1 inline-block h-2 w-3 bg-green" />EBITDA (laranja = negativo)</span>
          </p>
        </Secao>
        <Secao titulo="Para onde vai cada R$ 100 de receita" acao={<span className="text-xs text-muted">acumulado {p.ano}</span>}>
          {Object.keys(p.por100).length ? (
            <ul className="space-y-3">
              {Object.entries(p.por100)
                .filter(([, v]) => v > 0)
                .sort((x, y) => y[1] - x[1])
                .map(([k, v]) => (
                  <li key={k} className="text-sm">
                    <div className="flex justify-between"><span>{nomeCat.get(k) ?? k}</span><b>{brl(v)}</b></div>
                    <div className="mt-1 h-2 rounded-full bg-line"><div className="h-2 rounded-full bg-blue" style={{ width: `${Math.min(100, v)}%` }} /></div>
                  </li>
                ))}
              <li className="text-sm">
                <div className="flex justify-between"><span>Lucro líquido</span><b className={a.lucroLiquido < 0 ? "text-danger" : "text-green"}>{brl(a.receitaBruta ? (a.lucroLiquido / a.receitaBruta) * 100 : 0)}</b></div>
              </li>
            </ul>
          ) : (
            <p className="text-sm text-muted">Ainda sem receita neste ano.</p>
          )}
        </Secao>
      </div>

      <Secao titulo="Saldo por conta" className="mt-6" acao={<Link className="link text-sm" href="/financeiro/extrato">Abrir extrato</Link>}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {p.saldos.porConta.map((c) => (
            <div key={c.id} className="rounded-xl bg-cream p-3">
              <p className={`font-display text-xl font-semibold ${c.saldo < 0 ? "text-danger" : "text-navy"}`}>{brl(c.saldo)}</p>
              <p className="text-xs text-muted">{c.nome}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">Atualizado em {data(new Date().toISOString())}. Mensalidades do Stripe entram sozinhas; registre o repasse do Stripe para o banco como transferência (ou importe o extrato .ofx, que reconhece sozinho).</p>
      </Secao>
    </>
  );
}

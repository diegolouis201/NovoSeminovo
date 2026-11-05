import Link from "next/link";
import { BarraMeta } from "@/components/Barra";
import { Form } from "@/components/Form";
import { Cabecalho, Kpi, Secao } from "@/components/ui";
import { salvarMeta } from "@/lib/actions";
import { calc, feed, hoje, marcacoes, me, meta, receitas, tarefas } from "@/lib/crm";
import { brl, mesAtual, nomeMes } from "@/lib/format";

export const metadata = { title: "Dashboard de vendas" };

const SITUACAO = { acima: ["Acima do ritmo", "bg-green/15 text-green"], no_ritmo: ["No ritmo", "bg-blue/10 text-blue"], abaixo: ["Abaixo do ritmo", "bg-orange/15 text-danger"] } as const;

export default async function Vendas() {
  const [access, f, m, abertas] = await Promise.all([me(), feed(), marcacoes(), tarefas()]);
  const h = hoje();
  const mes = mesAtual(h);
  const verFinanceiro = access.permissions.includes("financeiro");
  const [metaMes, r] = await Promise.all([meta(mes), verFinanceiro ? receitas() : Promise.resolve(null)]);
  const vg = calc.visaoGeral(f, h);
  const faturamentoMes = r?.planos.esteMes ?? 0;
  const ritmo = calc.ritmoMeta(metaMes, { assinaturas: vg.numeros.novasAssinaturasMes, faturamento: faturamentoMes }, h);
  const semPasso = calc.semProximoPasso(f, abertas, h, m);
  const atrasadas = abertas.filter((t) => t.dueAt < new Date().toISOString());
  const ativos = vg.funil.filter((x: { etapa: string }) => ["em_contato", "interessada", "proposta"].includes(x.etapa)).reduce((s: number, x: { quantidade: number }) => s + x.quantidade, 0);

  return (
    <>
      <Cabecalho titulo="Dashboard de vendas" subtitulo={`Meta de ${nomeMes(mes)} · funil e time comercial · dia ${h.getUTCDate()}`} />

      <div className={`grid gap-6 ${verFinanceiro ? "xl:grid-cols-2" : ""}`}>
        {(["assinaturas", ...(verFinanceiro ? ["faturamento"] : [])] as const).map((k) => {
          const x = ritmo?.[k as "assinaturas" | "faturamento"];
          const fmt = (v: number) => (k === "faturamento" ? brl(v) : v.toLocaleString("pt-BR"));
          return (
            <section key={k} className="card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm text-muted">{k === "assinaturas" ? "Novas assinaturas" : "Faturamento de planos"} · realizado contra a meta</p>
                {x ? <span className={`pill ${SITUACAO[x.situacao as keyof typeof SITUACAO][1]}`}>{SITUACAO[x.situacao as keyof typeof SITUACAO][0]}</span> : null}
              </div>
              {x ? (
                <>
                  <p className="mt-2 font-display text-4xl font-semibold text-navy">
                    {fmt(x.realizado)} <span className="text-lg text-muted">de {fmt(x.meta)}</span>
                  </p>
                  <BarraMeta realizado={x.realizado} ritmo={x.ritmoHoje} meta={x.meta} />
                  <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                    <div><p className="text-muted">Ritmo para hoje</p><p className="font-semibold">{fmt(x.ritmoHoje)}</p></div>
                    <div><p className="text-muted">Falta</p><p className="font-semibold text-danger">{fmt(x.falta)}</p></div>
                    <div><p className="text-muted">Da meta</p><p className="font-semibold">{x.percentual ?? 0}%</p></div>
                  </div>
                  {k === "faturamento" ? <p className="mt-3 text-xs text-muted">Faturamento = só planos (Stripe). Lojas parceiras, financiamentos e afiliados ficam à parte, só para visualização. Mês em andamento.</p> : null}
                </>
              ) : (
                <p className="mt-3 text-sm text-muted">Sem meta para este mês.{access.permissions.includes("equipe") ? " Defina abaixo." : ""}</p>
              )}
            </section>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi valor={ativos} rotulo="Em negociação" detalhe="em contato, interessada ou proposta" href="/funil" />
        <Kpi valor={semPasso.length} rotulo="Sem próximo passo" tom={semPasso.length ? "orange" : "navy"} href="/" />
        <Kpi valor={atrasadas.length} rotulo="Tarefas vencidas" tom={atrasadas.length ? "danger" : "navy"} href="/tarefas" />
        <Kpi valor={vg.numeros.cancelamentosMes} rotulo="Cancelamentos no mês" tom={vg.numeros.cancelamentosMes ? "danger" : "navy"} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Secao titulo="Funil" acao={<Link className="link text-sm" href="/funil">Abrir funil</Link>}>
          <ul className="space-y-2">
            {vg.funil.map((x: { etapa: string; nome: string; quantidade: number }) => {
              const max = Math.max(1, ...vg.funil.map((y: { quantidade: number }) => y.quantidade));
              return (
                <li key={x.etapa} className="grid grid-cols-[11rem_1fr_3rem] items-center gap-3 text-sm">
                  <span>{x.nome}</span>
                  <div className="h-3 rounded-full bg-line"><div className={`h-3 rounded-full ${x.etapa === "perdida" || x.etapa === "cancelou" ? "bg-orange" : "bg-blue"}`} style={{ width: `${(x.quantidade / max) * 100}%` }} /></div>
                  <span className="text-right font-semibold">{x.quantidade}</span>
                </li>
              );
            })}
          </ul>
        </Secao>
        <Secao titulo="Time comercial">
          <div className="overflow-x-auto">
            <table className="tabela">
              <thead><tr><th>Vendedor</th><th>Cards</th><th>Cadastradas</th><th>Assinantes</th><th>MRR</th></tr></thead>
              <tbody>
                {vg.vendedores.map((v: { nome: string; cards: number; cadastradas: number; assinantes: number; mrr: number }) => (
                  <tr key={v.nome}><td className="font-semibold">{v.nome}</td><td>{v.cards}</td><td>{v.cadastradas}</td><td>{v.assinantes}</td><td>{brl(v.mrr)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>
      </div>

      {vg.motivos.length ? (
        <Secao titulo="Por que não fechou ou cancelou" className="mt-6">
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {vg.motivos.map((x: { categoria: string; quantidade: number }) => (
              <li key={x.categoria} className="rounded-xl bg-cream p-3 text-sm"><b className="text-navy">{x.quantidade}</b> · {x.categoria}</li>
            ))}
          </ul>
        </Secao>
      ) : null}

      {access.permissions.includes("equipe") ? (
        <Secao titulo={`Meta de ${nomeMes(mes)}`} className="mt-6">
          <Form action={salvarMeta} botao="Salvar meta" manter className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <input type="hidden" name="mes" value={mes} />
            <div>
              <label className="label" htmlFor="assinaturas">Novas assinaturas</label>
              <input id="assinaturas" name="assinaturas" inputMode="numeric" defaultValue={metaMes?.newSubscriptions ?? ""} required className="input" />
            </div>
            <div>
              <label className="label" htmlFor="faturamento">Faturamento de planos (R$)</label>
              <input id="faturamento" name="faturamento" inputMode="decimal" defaultValue={metaMes ? String(metaMes.revenue).replace(".", ",") : ""} required className="input" />
            </div>
          </Form>
        </Secao>
      ) : null}
    </>
  );
}

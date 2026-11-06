import { redirect } from "next/navigation";
import { Cabecalho, Kpi, Secao } from "@/components/ui";
import { me, receitas } from "@/lib/crm";
import { brl, nomeMes } from "@/lib/format";

export const metadata = { title: "Receitas" };

export default async function Receitas() {
  const access = await me();
  if (!access.permissions.includes("financeiro")) redirect("/");
  const r = await receitas();
  const meses = [...r.consolidado.porMes].reverse();
  const atual = new Date().toISOString().slice(0, 7);
  return (
    <>
      <Cabecalho titulo="Receitas" subtitulo="Faturamento = só planos (Stripe). Lojas parceiras, financiamentos e afiliados aparecem à parte, só para visualização." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi valor={brl(r.planos.esteMes)} rotulo="Faturamento do mês (em andamento)" tom="green" />
        <Kpi valor={brl(r.planos.mesPassado)} rotulo="Faturamento do mês passado" />
        <Kpi valor={brl(r.planos.mrr)} rotulo="MRR" detalhe={`${r.planos.assinantes} assinantes`} />
        <Kpi valor={brl(r.planos.total12m)} rotulo="Faturamento em 12 meses" detalhe={r.planos.estornos12m ? `estornos ${brl(r.planos.estornos12m)}` : undefined} />
      </div>
      <Secao titulo="Mês a mês" className="mt-6">
        <div className="overflow-x-auto">
          <table className="tabela min-w-[640px]">
            <thead><tr><th>Mês</th><th>Planos (faturamento)</th><th>Lojas parceiras*</th><th>Financiamentos*</th></tr></thead>
            <tbody>
              {meses.map((x) => (
                <tr key={x.mes}>
                  <td className="font-semibold capitalize">{nomeMes(x.mes)}{x.mes === atual ? " (em andamento)" : ""}</td>
                  <td className="font-semibold text-green">{brl(x.planos)}</td>
                  <td className="text-muted">{brl(x.lojas)}</td>
                  <td className="text-muted">{brl(x.financiamentos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">* Só visualização: não entra no faturamento nem no caixa.</p>
      </Secao>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Secao titulo="Financiamentos (só visualização)">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-muted">Negócios em 12 meses</dt><dd className="font-semibold">{r.financiamentos.negocios12m}</dd></div>
            <div><dt className="text-muted">Comissão em 12 meses</dt><dd className="font-semibold">{brl(r.financiamentos.comissao12m)}</dd></div>
            <div><dt className="text-muted">Comissão a receber</dt><dd className="font-semibold">{brl(r.financiamentos.comissaoAReceber)}</dd></div>
            <div><dt className="text-muted">Comissão recebida</dt><dd className="font-semibold">{brl(r.financiamentos.comissaoRecebida)}</dd></div>
          </dl>
        </Secao>
        <Secao titulo="Programa de afiliados (só visualização)">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-muted">Afiliados ativos</dt><dd className="font-semibold">{r.afiliados.programa.ativos}</dd></div>
            <div><dt className="text-muted">Indicados</dt><dd className="font-semibold">{r.afiliados.programa.indicados}</dd></div>
            <div><dt className="text-muted">Comissão disponível</dt><dd className="font-semibold">{brl(r.afiliados.programa.comissoes.disponivel)}</dd></div>
            <div><dt className="text-muted">Lojas parceiras em 12 meses</dt><dd className="font-semibold">{brl(r.afiliados.lojas.total12m)}</dd></div>
          </dl>
        </Secao>
      </div>
      <p className="mt-6 text-sm text-muted">Contas a pagar e receber, extrato, fluxo de caixa e DRE entram na fase 2 (financeiro).</p>
    </>
  );
}

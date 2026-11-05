import { Baixar, TrocarCategoria } from "@/components/FinForms";
import { Expandir } from "@/components/Expandir";
import { Form } from "@/components/Form";
import { Cabecalho, Kpi } from "@/components/ui";
import { acaoLancamento, novoLancamento } from "@/lib/actions";
import { exigirFinanceiro, fin, qs } from "@/lib/fin";
import { brl, data, nomeMes } from "@/lib/format";

export const metadata = { title: "Contas a pagar e receber" };

const ORIGEM: Record<string, string> = { stripe: "Stripe", ofx: "Extrato", planilha: "Planilha", manual: "" };

export default async function Lancamentos({ searchParams }: { searchParams: { tipo?: string; status?: string; mes?: string; categoria?: string; q?: string; conta?: string } }) {
  await exigirFinanceiro();
  const filtro = { tipo: searchParams.tipo, status: searchParams.status ?? "aberto", mes: searchParams.mes, categoria: searchParams.categoria, q: searchParams.q, conta: searchParams.conta };
  const r = await fin.lancamentos(qs({ ...filtro, status: filtro.status === "todos" ? undefined : filtro.status }));
  const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  const contas = r.contas.map((c) => ({ id: c.id, nome: c.nome }));
  const contasBanco = contas.filter((c) => c.id !== "stripe");
  const nomeConta = new Map(r.contas.map((c) => [c.id, c.nome]));
  const s = r.resumo;
  return (
    <>
      <Cabecalho titulo="Contas a pagar e receber" subtitulo="Tudo o que entra e sai. As mensalidades do Stripe entram sozinhas (já recebidas); o resto você lança aqui ou importa do banco e da planilha." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi valor={brl(s.aReceber)} rotulo={`A receber em ${nomeMes(s.mes)}`} detalhe={`já recebido: ${brl(s.recebido)}`} tom="green" />
        <Kpi valor={brl(s.aPagar)} rotulo={`A pagar em ${nomeMes(s.mes)}`} detalhe={`já pago: ${brl(s.pago)}`} />
        <Kpi valor={brl(s.saldoPrevisto)} rotulo="Saldo previsto do mês" detalhe="entradas − saídas" tom={s.saldoPrevisto < 0 ? "danger" : "navy"} />
        <Kpi valor={brl(s.vencidosReceber.valor)} rotulo="Recebimentos vencidos" detalhe={`${s.vencidosReceber.quantidade} lançamento(s)`} tom={s.vencidosReceber.quantidade ? "danger" : "navy"} href="?status=vencido&tipo=receber" />
        <Kpi valor={brl(s.vencidosPagar.valor)} rotulo="Pagamentos vencidos" detalhe={`${s.vencidosPagar.quantidade} lançamento(s)`} tom={s.vencidosPagar.quantidade ? "danger" : "navy"} href="?status=vencido&tipo=pagar" />
        <Kpi valor={r.total} rotulo="Lançamentos no filtro" />
      </div>

      <Expandir titulo="+ Lançamento manual" inicial={!r.total && !searchParams.q} className="card mt-6">
        <Form action={novoLancamento} botao="Salvar lançamento" className="mt-4 grid gap-3 md:grid-cols-3">
          <div>
            <label className="label" htmlFor="tipo">Tipo</label>
            <select id="tipo" name="tipo" className="input" defaultValue="pagar">
              <option value="pagar">A pagar (despesa)</option>
              <option value="receber">A receber (receita)</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="descricao">Descrição</label>
            <input id="descricao" name="descricao" required maxLength={200} className="input" placeholder="Ex.: Servidor VPS Locaweb" />
          </div>
          <div>
            <label className="label" htmlFor="valor">Valor (R$)</label>
            <input id="valor" name="valor" required inputMode="decimal" className="input" placeholder="0,00" />
          </div>
          <div>
            <label className="label" htmlFor="vencimento">Vencimento</label>
            <input id="vencimento" name="vencimento" type="date" required defaultValue={hoje} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="competencia">Competência (mês a que pertence)</label>
            <input id="competencia" name="competencia" type="date" className="input" />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="categoria">Categoria</label>
            <select id="categoria" name="categoria" className="input" defaultValue="F02">
              {r.categorias.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="contraparte">Cliente / fornecedor</label>
            <input id="contraparte" name="contraparte" maxLength={120} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="repetir">Repetir</label>
            <select id="repetir" name="repetir" className="input" defaultValue="unico">
              <option value="unico">Uma vez / parcelado</option>
              <option value="recorrente">Todo mês (recorrente)</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="parcelas">Parcelas ou meses</label>
            <input id="parcelas" name="parcelas" type="number" min={1} max={60} defaultValue={1} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="conta">Conta</label>
            <select id="conta" name="conta" className="input" defaultValue={contasBanco[0]?.id ?? ""}>
              <option value="">—</option>
              {contasBanco.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold md:col-span-3"><input type="checkbox" name="pago" /> Já foi pago/recebido (na data do vencimento)</label>
        </Form>
      </Expandir>

      <form className="mt-6 grid gap-2 sm:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_1fr_2fr_auto]">
        <select name="tipo" defaultValue={searchParams.tipo ?? ""} className="input">
          <option value="">Receber e pagar</option>
          <option value="receber">Só a receber</option>
          <option value="pagar">Só a pagar</option>
        </select>
        <select name="status" defaultValue={filtro.status} className="input">
          <option value="aberto">Em aberto</option>
          <option value="vencido">Vencidos</option>
          <option value="pago">Pagos</option>
          <option value="cancelado">Cancelados</option>
          <option value="todos">Todos</option>
        </select>
        <input name="mes" type="month" defaultValue={searchParams.mes} className="input" aria-label="Mês" />
        <select name="categoria" defaultValue={searchParams.categoria ?? ""} className="input">
          <option value="">Todas as categorias</option>
          {r.categorias.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.nome}</option>)}
        </select>
        <input name="q" defaultValue={searchParams.q} maxLength={100} placeholder="Buscar descrição, cliente ou fornecedor" className="input" />
        <button className="btn-primary">Filtrar</button>
      </form>

      <div className="card mt-4 overflow-x-auto p-0">
        <table className="tabela min-w-[1100px]">
          <thead><tr><th>Vencimento</th><th>Descrição</th><th>Categoria</th><th>Conta</th><th className="text-right">Valor</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {r.lista.map((m) => {
              const vencido = m.status === "aberto" && m.vencimento < hoje;
              return (
                <tr key={m.id}>
                  <td className={`whitespace-nowrap ${vencido ? "font-semibold text-danger" : ""}`}>{data(m.vencimento)}</td>
                  <td>
                    <p className="font-semibold">{m.descricao}</p>
                    <p className="text-xs text-muted">{[m.contraparte, ORIGEM[m.origem], m.competencia.slice(0, 7) !== m.vencimento.slice(0, 7) ? `competência ${nomeMes(m.competencia.slice(0, 7))}` : ""].filter(Boolean).join(" · ")}</p>
                  </td>
                  <td>{m.origem === "stripe" ? <span className="text-xs">{m.categoria}</span> : <TrocarCategoria id={m.id} atual={m.categoria} categorias={r.categorias} />}</td>
                  <td className="text-xs">{m.contaId ? nomeConta.get(m.contaId) ?? "—" : "—"}</td>
                  <td className={`whitespace-nowrap text-right font-semibold ${m.tipo === "receber" ? "text-green" : "text-ink"}`}>{m.tipo === "pagar" ? "−" : "+"} {brl(m.valor)}</td>
                  <td>
                    <span className={`pill whitespace-nowrap ${m.status === "pago" ? "bg-green/15 text-green" : m.status === "cancelado" ? "bg-line text-muted" : vencido ? "bg-orange/15 text-danger" : "bg-blue/10 text-blue"}`}>
                      {m.status === "pago" ? (m.tipo === "receber" ? `Recebido ${data(m.pagoEm)}` : `Pago ${data(m.pagoEm)}`) : m.status === "cancelado" ? "Cancelado" : vencido ? "Vencido" : "Em aberto"}
                    </span>
                  </td>
                  <td>
                    {m.origem === "stripe" ? null : m.status === "aberto" ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Baixar id={m.id} contas={contasBanco} hoje={hoje} padrao={m.contaId} />
                        <form action={acaoLancamento}>
                          <input type="hidden" name="id" value={m.id} />
                          <input type="hidden" name="acao" value="cancelar" />
                          <button className="text-xs text-muted hover:text-danger">Cancelar</button>
                        </form>
                      </div>
                    ) : m.origem !== "ofx" ? (
                      <form action={acaoLancamento}>
                        <input type="hidden" name="id" value={m.id} />
                        <input type="hidden" name="acao" value="reabrir" />
                        <button className="text-xs text-muted hover:text-blue">Reabrir</button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!r.lista.length ? <p className="p-6 text-center text-sm text-muted">Nenhum lançamento neste filtro.</p> : null}
      </div>
      {!contasBanco.length ? <p className="mt-4 text-sm text-orange">Cadastre suas contas bancárias em “Importar e contas” para poder dar baixa.</p> : null}
    </>
  );
}

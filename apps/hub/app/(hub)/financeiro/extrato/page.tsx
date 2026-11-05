import { Cabecalho } from "@/components/ui";
import { exigirFinanceiro, fin, qs } from "@/lib/fin";
import { brl, data } from "@/lib/format";

export const metadata = { title: "Extrato" };

export default async function Extrato({ searchParams }: { searchParams: { conta?: string; de?: string; ate?: string } }) {
  await exigirFinanceiro();
  const e = await fin.extrato(qs({ conta: searchParams.conta, de: searchParams.de, ate: searchParams.ate }));
  const nome = new Map(e.contas.map((c) => [c.id, c.nome]));
  const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  return (
    <>
      <Cabecalho titulo="Extrato de movimentações" subtitulo="Tudo o que entrou e saiu de cada conta, com o saldo linha a linha: o que foi baixado no Hub, o extrato importado e as mensalidades do Stripe." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {e.saldos.porConta.map((c) => (
          <a key={c.id} href={`?conta=${c.id}`} className={`card block hover:border-blue ${searchParams.conta === c.id ? "border-blue" : ""}`}>
            <p className={`font-display text-2xl font-semibold ${c.saldo < 0 ? "text-danger" : "text-navy"}`}>{brl(c.saldo)}</p>
            <p className="text-sm text-muted">{c.nome}</p>
          </a>
        ))}
        <a href="?" className={`card block bg-navy hover:opacity-90 ${!searchParams.conta ? "ring-2 ring-orange" : ""}`}>
          <p className="font-display text-2xl font-semibold text-white">{brl(e.saldos.total)}</p>
          <p className="text-sm text-white/70">Saldo de todas as contas hoje</p>
        </a>
      </div>
      <form className="mt-6 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="conta">Conta</label>
          <select id="conta" name="conta" defaultValue={searchParams.conta ?? ""} className="input">
            <option value="">Todas as contas</option>
            {e.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="de">De</label>
          <input id="de" name="de" type="date" defaultValue={searchParams.de ?? `${hoje.slice(0, 7)}-01`} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="ate">Até</label>
          <input id="ate" name="ate" type="date" defaultValue={searchParams.ate ?? hoje} className="input" />
        </div>
        <button className="btn-primary">Filtrar</button>
      </form>
      <div className="card mt-4 overflow-x-auto p-0">
        <table className="tabela min-w-[860px]">
          <thead><tr><th>Data</th><th>Conta</th><th>Descrição</th><th>Categoria</th><th className="text-right">Entrada</th><th className="text-right">Saída</th><th className="text-right">Saldo</th></tr></thead>
          <tbody>
            <tr className="bg-cream"><td>{data(searchParams.de ?? `${hoje.slice(0, 7)}-01`)}</td><td colSpan={5} className="font-semibold">Saldo anterior</td><td className="text-right font-semibold">{brl(e.saldoAnterior)}</td></tr>
            {e.linhas.map((l) => (
              <tr key={l.id}>
                <td>{data(l.data)}</td>
                <td className="text-xs">{nome.get(l.contaId) ?? l.contaId}</td>
                <td>{l.descricao}{l.origem === "transferencia" ? <span className="pill ml-2 bg-line text-navy">transferência</span> : null}</td>
                <td className="text-xs">{l.categoria ?? "—"}</td>
                <td className="text-right text-green">{l.entrada ? brl(l.entrada) : ""}</td>
                <td className="text-right text-danger">{l.saida ? brl(l.saida) : ""}</td>
                <td className={`text-right font-semibold ${l.saldo < 0 ? "text-danger" : ""}`}>{brl(l.saldo)}</td>
              </tr>
            ))}
            <tr className="bg-cream"><td colSpan={6} className="font-semibold">Saldo no fim do período</td><td className="text-right font-semibold">{brl(e.saldoFinal)}</td></tr>
          </tbody>
        </table>
        {!e.linhas.length ? <p className="p-6 text-center text-sm text-muted">Nenhuma movimentação no período.</p> : null}
      </div>
    </>
  );
}

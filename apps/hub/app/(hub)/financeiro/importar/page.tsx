import { Importar } from "@/components/FinForms";
import { Expandir } from "@/components/Expandir";
import { Form } from "@/components/Form";
import { Cabecalho, Secao } from "@/components/ui";
import { novaConta, transferir } from "@/lib/actions";
import { exigirFinanceiro, fin } from "@/lib/fin";
import { brl, data } from "@/lib/format";

export const metadata = { title: "Importar e contas" };

export default async function ImportarContas() {
  await exigirFinanceiro();
  const contas = await fin.contas();
  const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  const banco = contas.filter((c) => c.id !== "stripe");
  return (
    <>
      <Cabecalho titulo="Importar e contas" subtitulo="Traga o extrato do banco (.ofx) e a sua planilha (.csv), cadastre as contas e registre transferências entre elas." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Secao titulo="Importar extrato ou planilha">
          {banco.length ? <Importar contas={banco.map((c) => ({ id: c.id, nome: c.nome }))} /> : <p className="text-sm text-orange">Cadastre uma conta ao lado antes de importar.</p>}
          <div className="mt-5 space-y-2 text-xs text-muted">
            <p><b className="text-navy">Extrato do banco (.ofx):</b> no app ou site do banco, procure “Exportar extrato” e escolha OFX. Cada linha vira lançamento já pago nesta conta; o que vier do Stripe vira transferência Stripe → banco. Importar o mesmo arquivo de novo não duplica.</p>
            <p><b className="text-navy">Planilha (.csv):</b> no Excel ou Google Planilhas, “Salvar como / Fazer download” em CSV. Colunas reconhecidas: Data, Descrição, Valor (negativo = despesa), Categoria (código R01, F02...), Tipo, Situação (pago ou aberto).</p>
            <p>O que entrar sem categoria vai para “Outras despesas” ou “Outras receitas”. Ajuste na tela Contas a pagar e receber.</p>
          </div>
        </Secao>
        <div className="space-y-6">
          <Secao titulo="Contas">
            <ul className="divide-y divide-line">
              {contas.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                  <span><b className="text-navy">{c.nome}</b>{c.banco ? ` · ${c.banco}` : ""}</span>
                  <span className="text-xs text-muted">{c.id === "stripe" ? "automática" : `saldo inicial ${brl(c.saldoInicial)} em ${data(c.saldoInicialEm)}`}</span>
                </li>
              ))}
            </ul>
            <Expandir titulo="+ Nova conta" className="mt-4" tituloClasse="text-sm font-semibold text-blue">
              <Form action={novaConta} botao="Criar conta" className="mt-3 grid gap-3 sm:grid-cols-2">
                <input name="nome" required maxLength={80} className="input" placeholder="Nome (ex.: Inter PJ)" aria-label="Nome" />
                <input name="banco" maxLength={80} className="input" placeholder="Banco (ex.: Inter)" aria-label="Banco" />
                <select name="tipo" className="input" defaultValue="corrente" aria-label="Tipo">
                  <option value="corrente">Conta corrente</option>
                  <option value="cartao">Cartão de crédito</option>
                  <option value="caixa">Caixa (dinheiro)</option>
                  <option value="investimento">Investimento</option>
                </select>
                <input name="saldoInicial" inputMode="decimal" className="input" placeholder="Saldo inicial (R$)" aria-label="Saldo inicial" />
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="saldoInicialEm">Saldo inicial em</label>
                  <input id="saldoInicialEm" name="saldoInicialEm" type="date" required defaultValue={`${hoje.slice(0, 7)}-01`} className="input" />
                </div>
              </Form>
            </Expandir>
          </Secao>
          <Secao titulo="Transferência entre contas">
            <Form action={transferir} botao="Registrar transferência" className="grid gap-3 sm:grid-cols-2">
              <select name="de" className="input" aria-label="De" defaultValue="stripe">{contas.map((c) => <option key={c.id} value={c.id}>De: {c.nome}</option>)}</select>
              <select name="para" className="input" aria-label="Para" defaultValue={banco[0]?.id}>{contas.map((c) => <option key={c.id} value={c.id}>Para: {c.nome}</option>)}</select>
              <input name="valor" required inputMode="decimal" className="input" placeholder="Valor (R$)" aria-label="Valor" />
              <input name="data" type="date" required defaultValue={hoje} className="input" aria-label="Data" />
              <input name="descricao" maxLength={200} className="input sm:col-span-2" placeholder="Descrição (ex.: repasse do Stripe)" aria-label="Descrição" />
            </Form>
          </Secao>
        </div>
      </div>
    </>
  );
}

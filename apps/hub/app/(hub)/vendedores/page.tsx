import Link from "next/link";
import { VENDEDOR_AUTONOMIA } from "@novoseminovo/shared-types";
import { Situacao } from "@/components/Barras";
import { Form } from "@/components/Form";
import { Cabecalho, Secao, Vazio } from "@/components/ui";
import { salvarGeralVendedores } from "@/lib/actions";
import { me } from "@/lib/crm";
import { brl } from "@/lib/format";
import { horas, painelVendedores, pct } from "@/lib/vendedores";

export const metadata = { title: "Vendedores IA" };

export default async function Vendedores() {
  const [acesso, p] = await Promise.all([me(), painelVendedores()]);
  const dono = acesso.permissions.includes("equipe");
  const pendentes = p.vendedores.reduce((s, v) => s + v.numeros.aprovacoesPendentes, 0);
  const ranking = [...p.vendedores].filter((v) => v.ativo || v.numeros.contatadosTotal).sort((a, b) => b.numeros.ganhos - a.numeros.ganhos || (b.numeros.taxaResposta ?? -1) - (a.numeros.taxaResposta ?? -1) || b.numeros.contatadosTotal - a.numeros.contatadosTotal);
  const avisos = [
    !p.iaLigada ? "IA desligada no servidor: as respostas chegam para você escrever à mão." : "",
    !p.caixaConfigurada ? "E-mail de envio (contato@) não configurado: nada sai." : "",
    !p.leituraConfigurada ? "Leitura da caixa (IMAP) não configurada: respostas não são lidas sozinhas." : "",
    p.geral.pausarTodos ? "Todos os vendedores estão pausados." : "",
  ].filter(Boolean);
  return (
    <>
      <Cabecalho
        titulo="Vendedores IA"
        subtitulo="Assistentes comerciais da NovoSeminovo: abordam as empresas importadas, leem as respostas do contato@ e escrevem os rascunhos. Sempre se apresentam como assistentes, nunca como pessoa."
        acao={dono ? <Link className="btn-primary" href="/vendedores/respostas">Respostas para aprovar ({pendentes})</Link> : undefined}
      />
      {avisos.length ? (
        <ul className="mb-6 space-y-1 rounded-xl bg-orange/10 p-3 text-sm text-navy">
          {avisos.map((a) => <li key={a}>{a}</li>)}
        </ul>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {p.vendedores.map((v) => (
          <Link key={v.id} href={`/vendedores/${v.id}`} className="card block transition hover:border-blue">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-display text-xl font-semibold text-navy">{v.nome}</p>
                <p className="text-xs text-muted">{v.titulo}</p>
              </div>
              <Situacao v={v} />
            </div>
            {v.ativo ? (
              <>
                <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <div><dt className="text-muted">Na fila</dt><dd className="text-lg font-semibold">{v.numeros.fila}</dd></div>
                  <div><dt className="text-muted">Contatadas 7d</dt><dd className="text-lg font-semibold">{v.numeros.contatados7d}</dd></div>
                  <div><dt className="text-muted">Respostas</dt><dd className="text-lg font-semibold">{v.numeros.respostas} <span className="text-xs text-muted">{pct(v.numeros.taxaResposta)}</span></dd></div>
                  <div><dt className="text-muted">Negociação</dt><dd className="text-lg font-semibold">{v.numeros.emNegociacao}</dd></div>
                  <div><dt className="text-muted">Ganhos</dt><dd className="text-lg font-semibold text-green">{v.numeros.ganhos}</dd></div>
                  <div><dt className="text-muted">Para aprovar</dt><dd className={`text-lg font-semibold ${v.numeros.aprovacoesPendentes ? "text-orange" : ""}`}>{v.numeros.aprovacoesPendentes}</dd></div>
                </dl>
                <p className="mt-3 text-xs text-muted">{VENDEDOR_AUTONOMIA[v.autonomia]} · IA hoje {brl(v.numeros.custoIaHojeBrl)}</p>
              </>
            ) : (
              <p className="mt-4 text-sm text-muted">Entra quando ganhar uma caixa de e-mail própria e for ativado.</p>
            )}
          </Link>
        ))}
      </div>

      <Secao titulo="Ranking dos vendedores" className="mt-6">
        {ranking.length ? (
          <div tabIndex={0} role="region" aria-labelledby="ranking-legenda" className="overflow-x-auto">
            <table className="tabela min-w-[760px]">
              <caption id="ranking-legenda" className="sr-only">Ranking dos vendedores IA por ganhos e taxa de resposta</caption>
              <thead>
                <tr><th scope="col">Vendedor</th><th scope="col">Contatadas</th><th scope="col">Respostas</th><th scope="col">Taxa</th><th scope="col">Negociação</th><th scope="col">Ganhos</th><th scope="col">Conversão</th><th scope="col">Tempo de resposta</th><th scope="col">IA no mês</th></tr>
              </thead>
              <tbody>
                {ranking.map((v, i) => (
                  <tr key={v.id}>
                    <th scope="row" className="font-semibold text-navy">{i + 1}. <Link className="link" href={`/vendedores/${v.id}`}>{v.nome}</Link></th>
                    <td>{v.numeros.contatadosTotal}</td>
                    <td>{v.numeros.respostas}</td>
                    <td>{pct(v.numeros.taxaResposta)}</td>
                    <td>{v.numeros.emNegociacao}</td>
                    <td>{v.numeros.ganhos}</td>
                    <td>{pct(v.numeros.conversao)}</td>
                    <td>{horas(v.numeros.tempoMedioRespostaHoras)}</td>
                    <td>{brl(v.numeros.custoIaMesBrl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Vazio titulo="Nenhum vendedor ativo ainda" />
        )}
        <p className="mt-3 text-xs text-muted">Ganho = a empresa se cadastrou no site (mesmo e-mail, telefone ou CNPJ do card, ou pelo link do vendedor). A IA nunca marca ganho.</p>
      </Secao>

      {dono ? (
        <Secao titulo="Controle geral (só o dono)" className="mt-6">
          <Form action={salvarGeralVendedores} botao="Salvar" manter className="space-y-3">
            <span className="flex items-center gap-2 text-sm">
              <input id="pausarTodos" name="pausarTodos" type="checkbox" value="1" defaultChecked={p.geral.pausarTodos} className="accent-blue" />
              <label htmlFor="pausarTodos">Pausar todos os vendedores agora (nada de rascunho nem envio)</label>
            </span>
            <span className="flex items-center gap-2 text-sm">
              <input id="confirmarSaida" name="confirmarSaida" type="checkbox" value="1" defaultChecked={p.geral.confirmarSaida} className="accent-blue" />
              <label htmlFor="confirmarSaida">Mandar uma confirmação curta a quem pedir para sair</label>
            </span>
          </Form>
        </Secao>
      ) : null}
    </>
  );
}

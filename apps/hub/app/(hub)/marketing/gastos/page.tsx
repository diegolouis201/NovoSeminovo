import { Form } from "@/components/Form";
import { Cabecalho, Kpi, Secao } from "@/components/ui";
import { salvarOrcamentos } from "@/lib/actions";
import { exigirMarketing, mkt } from "@/lib/mkt";
import { brl, nomeMes } from "@/lib/format";

export const metadata = { title: "Gastos e orçamento" };
const NOME: Record<string, string> = { meta_ads: "Meta Ads (Instagram/Facebook)", google_ads: "Google Ads", tiktok_ads: "TikTok Ads" };

export default async function Gastos({ searchParams }: { searchParams: { mes?: string } }) {
  const access = await exigirMarketing();
  const atual = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 7);
  const mes = /^\d{4}-\d{2}$/.test(searchParams.mes ?? "") ? searchParams.mes! : atual;
  const g = await mkt.gastos(mes);
  return (
    <>
      <Cabecalho
        titulo="Gastos com anúncios"
        subtitulo={`${nomeMes(mes)}${mes === atual ? " (em andamento)" : ""} · Meta, Google e TikTok pelo Windsor.ai, contra o orçamento. A cobrança no cartão entra no financeiro como Marketing (F03) ao importar o extrato.`}
        acao={
          <form className="flex gap-2">
            <input type="month" name="mes" defaultValue={mes} className="input w-auto" aria-label="Mês" />
            <button className="btn">Ver</button>
          </form>
        }
      />
      {!g.windsor ? <p className="mb-4 rounded-xl bg-orange/10 p-3 text-sm">Windsor.ai não configurado no servidor: os gastos aparecem quando a chave for colocada.</p> : null}
      {g.windsor && !g.periodoDisponivel ? <p className="mb-4 rounded-xl bg-orange/10 p-3 text-sm">Gastos detalhados só do mês atual e do mês passado.</p> : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi valor={brl(g.total.gasto)} rotulo="Gasto no mês" detalhe={g.total.orcamento ? `${g.total.usadoPct}% de ${brl(g.total.orcamento)}` : "sem orçamento"} tom={g.total.estourou ? "danger" : "navy"} />
        <Kpi valor={g.total.cliques.toLocaleString("pt-BR")} rotulo="Cliques" detalhe={g.total.cpc ? `CPC ${brl(g.total.cpc)}` : undefined} />
        <Kpi valor={g.cadastros} rotulo="Empresas cadastradas no mês" detalhe={g.custo.porCadastro ? `${brl(g.custo.porCadastro)} por cadastro` : undefined} />
        <Kpi valor={g.assinaturas} rotulo="Novas assinaturas no mês" detalhe={g.custo.porAssinatura ? `${brl(g.custo.porAssinatura)} por assinatura` : undefined} tom="green" />
        <Kpi valor={g.total.conversoes} rotulo="Leads e cadastros das campanhas" detalhe={g.total.custoPorConversao ? `${brl(g.total.custoPorConversao)} cada` : `${g.total.impressoes.toLocaleString("pt-BR")} impressões`} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Secao titulo="Por plataforma">
          <ul className="space-y-4">
            {g.porPlataforma.map((p) => (
              <li key={p.plataforma}>
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <b className="text-navy">{NOME[p.plataforma] ?? p.plataforma}</b>
                  <span>{brl(p.gasto)}{p.orcamento ? ` de ${brl(p.orcamento)}` : ""} {p.estourou ? <span className="pill bg-orange/15 text-danger">acima do orçamento</span> : null}</span>
                </div>
                <div className="mt-1 h-2.5 rounded-full bg-line"><div className={`h-2.5 rounded-full ${p.estourou ? "bg-danger" : "bg-blue"}`} style={{ width: `${Math.min(100, p.usadoPct ?? (p.gasto ? 100 : 0))}%` }} /></div>
                <p className="mt-1 text-xs text-muted">{p.cliques} cliques{p.cpc ? ` · CPC ${brl(p.cpc)}` : ""} · {p.impressoes.toLocaleString("pt-BR")} impressões · {g.conexoes[p.plataforma] === "nao_conectado" ? "não conectado no Windsor" : g.conexoes[p.plataforma] === "sem_dados" ? "sem gasto no período" : ""}</p>
              </li>
            ))}
          </ul>
        </Secao>
        {access.permissions.includes("marketing") ? (
          <Secao titulo={`Orçamento de ${nomeMes(mes)}`}>
            <Form action={salvarOrcamentos} botao="Salvar orçamento" manter>
              <input type="hidden" name="mes" value={mes} />
              {["meta_ads", "google_ads", "tiktok_ads"].map((p) => (
                <div key={p}>
                  <label className="label" htmlFor={p}>{NOME[p]} (R$)</label>
                  <input id={p} name={p} inputMode="decimal" defaultValue={g.orcamentos[p] !== undefined ? String(g.orcamentos[p]).replace(".", ",") : ""} className="input" />
                </div>
              ))}
            </Form>
          </Secao>
        ) : null}
      </div>
      <Secao titulo="Custo por campanha" className="mt-6">
        <p className="mb-3 text-xs text-muted">
          Leads e cadastros contam para a campanha quando o link do anúncio tem utm_campaign igual ao nome da campanha no gerenciador (maiúsculas e espaços não importam). Leads de campanha = lojas e imobiliárias do formulário; leads de compradores = contatos de anúncio e pedidos de financiamento.
        </p>
        {g.porCampanha.length ? (
          <div className="overflow-x-auto">
            <table className="tabela min-w-[1000px]">
              <thead><tr><th>Campanha</th><th>Plataforma</th><th className="text-right">Gasto</th><th className="text-right">Cliques</th><th className="text-right">CPC</th><th className="text-right">Leads de campanha</th><th className="text-right">Cadastros de empresas</th><th className="text-right">Leads de compradores</th><th className="text-right">Custo por lead</th><th className="text-right">Custo por cadastro</th></tr></thead>
              <tbody>
                {g.porCampanha.map((c) => (
                  <tr key={`${c.plataforma}${c.campanha}`}>
                    <td className="font-semibold">{c.campanha}</td>
                    <td className="text-xs">{NOME[c.plataforma] ?? c.plataforma}</td>
                    <td className="text-right">{brl(c.gasto)}</td>
                    <td className="text-right">{c.cliques}</td>
                    <td className="text-right">{c.cpc ? brl(c.cpc) : "—"}</td>
                    <td className="text-right">{c.leadsCampanha}</td>
                    <td className="text-right">{c.cadastros}</td>
                    <td className="text-right">{c.leadsCompradores}</td>
                    <td className="text-right">{c.custoPorLead ? brl(c.custoPorLead) : "—"}</td>
                    <td className="text-right">{c.custoPorCadastro ? brl(c.custoPorCadastro) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">Nenhuma campanha com gasto neste mês.</p>
        )}
      </Secao>
      {g.semGasto.length ? (
        <Secao titulo="Campanhas do site sem gasto no período" className="mt-6">
          <p className="mb-3 text-xs text-muted">Chegaram leads com estes utm_campaign, mas nenhuma campanha com esse nome teve gasto no mês. Confira se o nome no link é igual ao da campanha no gerenciador.</p>
          <div className="overflow-x-auto">
            <table className="tabela min-w-[560px]">
              <thead><tr><th>utm_campaign</th><th className="text-right">Leads de campanha</th><th className="text-right">Cadastros de empresas</th><th className="text-right">Leads de compradores</th></tr></thead>
              <tbody>
                {g.semGasto.map((c) => (
                  <tr key={c.campanha}><td className="font-semibold">{c.campanha}</td><td className="text-right">{c.leadsCampanha}</td><td className="text-right">{c.cadastros}</td><td className="text-right">{c.leadsCompradores}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>
      ) : null}
    </>
  );
}

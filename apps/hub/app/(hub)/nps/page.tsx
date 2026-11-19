import Link from "next/link";
import { NPS_PERIODOS, NPS_TIPOS } from "@novoseminovo/shared-types";
import { Cabecalho, Kpi, Secao, Vazio } from "@/components/ui";
import { calc, feed, hoje, marcacoes } from "@/lib/crm";
import { data } from "@/lib/format";
import { filtrosNps, painelNps } from "@/lib/nps";

export const metadata = { title: "NPS" };

const cor = { promotor: "bg-green/15 text-green", neutro: "bg-line text-navy", detrator: "bg-orange/15 text-danger" } as const;
const nps = (v: number | null) => (v === null ? "—" : v > 0 ? `+${v}` : String(v));

export default async function Nps({ searchParams }: { searchParams: { periodo?: string; tipo?: string } }) {
  const filtro = filtrosNps(searchParams);
  const [d, f, m] = await Promise.all([painelNps(filtro), feed(), marcacoes()]);
  const pendentes: { empresaId: string; cardId?: string; nome: string; vendedor?: string; ultimaResposta?: string; ultimaNota?: number }[] = calc.npsPendentes(f, hoje(), m);
  const periodo = NPS_PERIODOS[d.periodo];
  return (
    <>
      <Cabecalho
        titulo="NPS"
        subtitulo="Notas do painel do parceiro e da pesquisa por e-mail (a cada 6 meses), juntas. Uma nota por empresa no período: a mais recente."
        acao={<Link className="btn" href="/nps/envio">Envio por e-mail</Link>}
      />
      <search className="mb-4 block">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block font-semibold text-navy">Período</span>
            <select name="periodo" defaultValue={d.periodo} className="input w-auto">
              {Object.entries(NPS_PERIODOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold text-navy">Tipo de empresa</span>
            <select name="tipo" defaultValue={d.tipo} className="input w-auto">
              <option value="todos">Todos os tipos</option>
              {Object.entries(NPS_TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <button className="btn">Filtrar</button>
        </form>
      </search>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi valor={nps(d.geral.nps)} rotulo={`NPS · ${periodo.toLowerCase()}`} detalhe={`promotores − detratores · ${d.geral.respostas} ${d.geral.respostas === 1 ? "empresa" : "empresas"}`} />
        <Kpi valor={d.geral.promotores} rotulo="Promotores (9 e 10)" tom="green" />
        <Kpi valor={d.geral.neutros} rotulo="Neutros (7 e 8)" />
        <Kpi valor={d.geral.detratores} rotulo="Detratores (0 a 6)" tom={d.geral.detratores ? "danger" : "navy"} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Secao titulo="Por tipo de empresa">
          <div tabIndex={0} role="region" aria-labelledby="nps-tipo-legenda" className="overflow-x-auto">
            <table className="tabela min-w-[520px]">
              <caption id="nps-tipo-legenda" className="sr-only">NPS por tipo de empresa no período</caption>
              <thead>
                <tr><th scope="col">Tipo</th><th scope="col">NPS</th><th scope="col">Empresas</th><th scope="col">Promotores</th><th scope="col">Neutros</th><th scope="col">Detratores</th></tr>
              </thead>
              <tbody>
                {d.porTipo.map((t) => (
                  <tr key={t.tipo}>
                    <th scope="row" className="font-semibold text-navy">{t.rotulo}</th>
                    <td className="font-semibold">{nps(t.nps)}</td>
                    <td>{t.respostas}</td>
                    <td>{t.promotores}</td>
                    <td>{t.neutros}</td>
                    <td>{t.detratores}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>
        <Secao titulo="Pesquisa por e-mail no período">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-muted">E-mails enviados</dt><dd className="text-xl font-bold text-navy">{d.email.enviados}</dd></div>
            <div><dt className="text-muted">Respondidos</dt><dd className="text-xl font-bold text-navy">{d.email.respondidos}</dd></div>
            <div><dt className="text-muted">Taxa de resposta</dt><dd className="text-xl font-bold text-navy">{d.email.taxaResposta === null ? "—" : `${d.email.taxaResposta}%`}</dd></div>
            <div><dt className="text-muted">Lembretes enviados</dt><dd className="text-xl font-bold text-navy">{d.email.lembretes}</dd></div>
            <div><dt className="text-muted">Respostas pelo painel</dt><dd className="text-xl font-bold text-navy">{d.porOrigem.painel}</dd></div>
            <div><dt className="text-muted">Respostas por e-mail</dt><dd className="text-xl font-bold text-navy">{d.porOrigem.email}</dd></div>
          </dl>
        </Secao>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Secao titulo="Últimos comentários">
          <p className="mb-3 rounded-lg bg-orange/10 px-3 py-2 text-xs font-semibold text-danger">Uso interno — depoimento público só com autorização por escrito da empresa</p>
          {d.comentarios.length ? (
            <ul className="divide-y divide-line">
              {d.comentarios.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <Link className="link" href={`/empresas/${c.cardId ?? c.empresaId}`}>{c.empresa}</Link>
                    <p className="text-xs text-muted">
                      {c.tipo} · {data(c.data)} · {c.origem === "email" ? "por e-mail" : "no painel"}
                      {c.querContato ? " · pediu contato" : ""}
                    </p>
                    <p className="mt-1 whitespace-pre-line break-words text-navy">“{c.comentario}”</p>
                  </div>
                  <span className={`pill shrink-0 ${cor[c.faixa]}`}>{c.nota}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Vazio titulo="Nenhum comentário no período" texto="Os comentários aparecem aqui quando as empresas escrevem algo junto com a nota." />
          )}
        </Secao>
        <Secao titulo={`Sem resposta há mais de 180 dias (${pendentes.length})`}>
          {pendentes.length ? (
            <ul className="divide-y divide-line">
              {pendentes.slice(0, 50).map((p) => (
                <li key={p.empresaId} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <Link className="link" href={`/empresas/${p.cardId ?? p.empresaId}`}>{p.nome}</Link>
                    <p className="text-xs text-muted">{p.ultimaResposta ? `última nota ${p.ultimaNota} em ${data(p.ultimaResposta)}` : "nunca respondeu"}{p.vendedor ? ` · ${p.vendedor}` : ""}</p>
                  </div>
                  <Link className="btn shrink-0" href={`/empresas/${p.cardId ?? p.empresaId}`}>Lembrar</Link>
                </li>
              ))}
            </ul>
          ) : (
            <Vazio titulo="Todas responderam recentemente" />
          )}
        </Secao>
      </div>
    </>
  );
}

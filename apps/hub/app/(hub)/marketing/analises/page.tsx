import Link from "next/link";
import { Cabecalho, Secao, Vazio } from "@/components/ui";
import { exigirMarketing, mkt } from "@/lib/mkt";
import { data } from "@/lib/format";

export const metadata = { title: "Análises de marketing" };

export default async function Analises() {
  await exigirMarketing();
  const a = await mkt.analises();
  return (
    <>
      <Cabecalho titulo="Análises" subtitulo="Últimos 30 dias: o que deu mais alcance no Instagram, de onde vêm as visitas do site e os resultados dos posts publicados pelo Hub." />
      {!a.windsor ? <p className="mb-4 rounded-xl bg-orange/10 p-3 text-sm">Windsor.ai não configurado no servidor: Instagram e Google Analytics aparecem quando a chave for colocada.</p> : null}
      {a.erros.map((e) => <p key={e} className="mb-2 text-sm text-danger">{e}</p>)}
      <div className="grid gap-6 xl:grid-cols-2">
        <Secao titulo="Instagram: posts com mais alcance">
          {a.instagram?.length ? (
            <div className="overflow-x-auto">
              <table className="tabela">
                <thead><tr><th>Data</th><th>Post</th><th className="text-right">Alcance</th><th className="text-right">Curtidas</th><th className="text-right">Coment.</th></tr></thead>
                <tbody>
                  {a.instagram.map((p, i) => (
                    <tr key={i}>
                      <td className="whitespace-nowrap text-xs">{data(p.data)}</td>
                      <td className="text-xs">{p.link ? <a className="link" href={p.link} target="_blank" rel="noopener noreferrer">{p.legenda || p.tipo}</a> : p.legenda || p.tipo}</td>
                      <td className="text-right">{p.alcance.toLocaleString("pt-BR")}</td><td className="text-right">{p.curtidas}</td><td className="text-right">{p.comentarios}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Vazio titulo="Sem dados do Instagram" />}
        </Secao>
        <Secao titulo="Visitas do site por origem">
          {a.origens?.length ? (
            <ul className="space-y-2">
              {a.origens.map((o) => {
                const max = Math.max(1, ...a.origens!.map((x) => x.sessoes));
                return (
                  <li key={`${o.fonte}${o.meio}`} className="text-sm">
                    <div className="flex justify-between"><span>{o.fonte || "(direto)"} <span className="text-xs text-muted">/ {o.meio}</span></span><b>{o.sessoes.toLocaleString("pt-BR")}</b></div>
                    <div className="mt-1 h-2 rounded-full bg-line"><div className="h-2 rounded-full bg-blue" style={{ width: `${(o.sessoes / max) * 100}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          ) : <Vazio titulo="Sem dados do Google Analytics" />}
        </Secao>
      </div>
      <Secao titulo="Publicados pelo Hub" className="mt-6">
        {a.publicados.length ? (
          <div className="overflow-x-auto">
            <table className="tabela min-w-[720px]">
              <thead><tr><th>Publicado</th><th>Conteúdo</th><th>Redes</th><th className="text-right">Alcance</th><th className="text-right">Curtidas</th><th className="text-right">Salvos</th></tr></thead>
              <tbody>
                {a.publicados.map((c) => (
                  <tr key={c.id}>
                    <td className="text-xs">{data(c.publicadoEm)}</td>
                    <td><Link className="link" href={`/marketing/conteudos/${c.id}`}>{c.titulo}</Link></td>
                    <td className="text-xs">{Object.keys(c.links).join(", ")}</td>
                    <td className="text-right">{c.metricas?.reach ?? "—"}</td><td className="text-right">{c.metricas?.likes ?? "—"}</td><td className="text-right">{c.metricas?.saved ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-muted">Nada publicado pelo Hub ainda.</p>}
      </Secao>
    </>
  );
}

import Link from "next/link";
import { MKT_REDES } from "@novoseminovo/shared-types";
import { Decisao, MarcarPublicado, RecolherParaAjuste } from "@/components/MktForms";
import { Previa } from "@/components/Previa";
import { atualizarMetricas, cancelarConteudo } from "@/lib/actions";
import { exigirMarketing, mkt } from "@/lib/mkt";
import { dataHora } from "@/lib/format";

export const metadata = { title: "Conteúdo" };
const local = (iso?: string) => (iso ? new Date(new Date(iso).getTime() - 3 * 3_600_000).toISOString().slice(0, 16) : undefined);
const nome = (r: string) => MKT_REDES[r as keyof typeof MKT_REDES] ?? r;
const ACAO: Record<string, string> = { enviado: "Enviado para aprovação", ajuste: "Pediu ajuste", revisado: "Nova versão", aprovado: "Aprovado", publicado: "Publicado", erro: "Erro ao publicar", cancelado: "Cancelado" };

export default async function ConteudoDetalhe({ params }: { params: { id: string } }) {
  await exigirMarketing();
  const c = await mkt.detalhe(params.id);
  const faltam = c.redes.filter((r) => !c.links[r] && !c.automatico.includes(r));
  return (
    <>
      <Link href="/marketing/conteudos" className="text-sm font-semibold text-muted hover:text-blue">← Conteúdos</Link>
      <div className="mt-3 grid gap-6 xl:grid-cols-[minmax(0,28rem)_1fr]">
        <Previa c={c} />
        <div className="space-y-6">
          {c.status === "em_aprovacao" || c.status === "erro" ? (
            <section className="card">
              <h2 className="h2 mb-3">{c.status === "erro" ? "Tentar de novo" : "Sua decisão"}</h2>
              {c.erro ? <p className="mb-3 rounded-xl bg-orange/10 p-3 text-sm text-danger">{c.erro}</p> : null}
              <Decisao id={c.id} sugestao={local(c.dataPlanejada)} automatico={c.automatico} manual={c.manual} />
            </section>
          ) : null}
          {(c.status === "aprovado" || c.status === "publicado") && (faltam.length || c.status === "aprovado") ? (
            <section className="card">
              <h2 className="h2 mb-2">Publicação</h2>
              <p className="mb-3 text-sm text-muted">{c.automatico.length ? `O Hub publica sozinho no ${c.automatico.map(nome).join(" e ")} em ${dataHora(c.dataPlanejada)}.` : "Este conteúdo é publicado à mão."} {faltam.length ? `Falta publicar à mão: ${faltam.map(nome).join(", ")}.` : ""}</p>
              <MarcarPublicado id={c.id} redes={faltam} />
              {c.status === "aprovado" ? <div className="mt-4 border-t border-line pt-4"><RecolherParaAjuste id={c.id} /></div> : null}
            </section>
          ) : null}
          <section className="card">
            <h2 className="h2 mb-3">Links e resultados</h2>
            {Object.keys(c.links).length ? (
              <ul className="space-y-1 text-sm">{Object.entries(c.links).map(([r, l]) => <li key={r}><b>{nome(r)}:</b> <a className="link" href={l} target="_blank" rel="noopener noreferrer">{l}</a></li>)}</ul>
            ) : <p className="text-sm text-muted">Ainda não publicado.</p>}
            {c.metricas ? <p className="mt-3 text-sm">Instagram: <b>{c.metricas.reach ?? 0}</b> alcance · <b>{c.metricas.likes ?? 0}</b> curtidas · <b>{c.metricas.comments ?? 0}</b> comentários · <b>{c.metricas.saved ?? 0}</b> salvos · <b>{c.metricas.shares ?? 0}</b> compartilhamentos</p> : null}
            {c.links.instagram ? (
              <form action={atualizarMetricas} className="mt-3"><input type="hidden" name="id" value={c.id} /><button className="btn">Atualizar métricas do Instagram</button></form>
            ) : null}
          </section>
          <section className="card">
            <h2 className="h2 mb-3">Histórico</h2>
            <ol className="space-y-3">
              {c.historico.map((h, i) => (
                <li key={i} className="border-l-2 border-blue/30 pl-3 text-sm">
                  <p className="text-xs text-muted"><b className="text-navy">{ACAO[h.acao] ?? h.acao}</b> · {dataHora(h.em)} · {h.autor.length > 30 ? "Diego" : h.autor}</p>
                  {h.texto ? <p className="whitespace-pre-wrap">{h.texto}</p> : null}
                </li>
              ))}
            </ol>
          </section>
          {!["publicado", "cancelado"].includes(c.status) ? (
            <form action={cancelarConteudo}><input type="hidden" name="id" value={c.id} /><button className="text-sm text-muted hover:text-danger">Cancelar este conteúdo</button></form>
          ) : null}
        </div>
      </div>
    </>
  );
}

import Link from "next/link";
import { Previa } from "@/components/Previa";
import { Cabecalho, Kpi, Secao, Vazio } from "@/components/ui";
import { exigirMarketing, mkt } from "@/lib/mkt";
import { brl } from "@/lib/format";

export const metadata = { title: "Marketing" };

export default async function Marketing() {
  await exigirMarketing();
  const mes = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 7);
  const [r, g] = await Promise.all([mkt.resumo(), mkt.gastos(mes)]);
  return (
    <>
      <Cabecalho
        titulo="Marketing"
        subtitulo="O Claude do Marketing cria e envia para cá; você aprova ou pede ajuste; o Hub publica no Instagram e no Facebook na hora marcada."
        acao={<Link href="/marketing/novo" className="btn">+ Conteúdo</Link>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi valor={r.aguardando} rotulo="Aguardando sua aprovação" tom={r.aguardando ? "orange" : "navy"} href="/marketing/aprovacoes" />
        <Kpi valor={r.ajustes} rotulo="Em ajuste com o Claude" href="/marketing/conteudos?status=ajuste" />
        <Kpi valor={r.aprovados} rotulo="Aprovados / agendados" href="/marketing/calendario" />
        <Kpi valor={r.erros} rotulo="Erro ao publicar" tom={r.erros ? "danger" : "navy"} href="/marketing/conteudos?status=erro" />
        <Kpi valor={brl(g.total.gasto)} rotulo="Gasto com anúncios no mês" detalhe={g.total.orcamento ? `de ${brl(g.total.orcamento)} de orçamento` : "sem orçamento definido"} tom={g.total.estourou ? "danger" : "navy"} href="/marketing/gastos" />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Secao titulo="Próximos 7 dias" acao={<Link className="link text-sm" href="/marketing/calendario">Calendário</Link>}>
          {r.proximos.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {r.proximos.map((c) => (
                <Link key={c.id} href={`/marketing/conteudos/${c.id}`} className="block hover:opacity-90">
                  <Previa c={c} compacta />
                </Link>
              ))}
            </div>
          ) : (
            <Vazio titulo="Nada programado para a semana" texto="Peça ao Claude do Marketing o calendário da semana." />
          )}
        </Secao>
        <Secao titulo="Conexões">
          <ul className="space-y-2 text-sm">
            <li>{r.instagram ? "✅" : "⚠️"} Instagram (publicação automática){r.instagram ? "" : ": falta o token no servidor"}</li>
            <li>{r.facebook ? "✅" : "⚠️"} Página do Facebook (publicação automática){r.facebook ? "" : ": falta o token da página no servidor"}</li>
            <li>{g.windsor ? "✅" : "⚠️"} Windsor.ai (gastos e análises){g.windsor ? "" : ": falta a chave no servidor"}</li>
            {Object.entries(g.conexoes).map(([p, s]) => (
              <li key={p} className="pl-6 text-xs text-muted">{p}: {s === "ok" ? "com dados" : s === "sem_dados" ? "conectado, sem gasto no período" : "não conectado no Windsor"}</li>
            ))}
            <li>ℹ️ TikTok, YouTube, vídeos, e-mail e WhatsApp: aprovação aqui, publicação à mão (marque o link no conteúdo).</li>
          </ul>
        </Secao>
      </div>
    </>
  );
}

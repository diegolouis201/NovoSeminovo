import Link from "next/link";
import { Decisao } from "@/components/MktForms";
import { Previa } from "@/components/Previa";
import { Cabecalho, Vazio } from "@/components/ui";
import { exigirMarketing, mkt } from "@/lib/mkt";

export const metadata = { title: "Aprovações" };
const local = (iso?: string) => (iso ? new Date(new Date(iso).getTime() - 3 * 3_600_000).toISOString().slice(0, 16) : undefined);

export default async function Aprovacoes() {
  await exigirMarketing();
  const lista = await mkt.listar("?status=em_aprovacao");
  return (
    <>
      <Cabecalho titulo="Aprovações" subtitulo="Nada é publicado sem o seu OK. Aprove com a data e a hora, ou peça ajuste: o Claude do Marketing recebe o pedido e manda uma nova versão." />
      {lista.length ? (
        <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">
          {lista.map((c) => (
            <div key={c.id} className="card space-y-4">
              <Previa c={c} />
              {c.feedback ? <p className="rounded-xl bg-orange/10 p-3 text-xs"><b>Seu último pedido:</b> {c.feedback}</p> : null}
              {c.observacao ? <p className="text-xs text-muted"><b>Nota do Claude:</b> {c.observacao}</p> : null}
              <Decisao id={c.id} sugestao={local(c.dataPlanejada)} automatico={c.automatico} manual={c.manual} />
              <Link href={`/marketing/conteudos/${c.id}`} className="link text-xs">Ver histórico</Link>
            </div>
          ))}
        </div>
      ) : (
        <div className="card"><Vazio titulo="Nada aguardando aprovação" texto="Quando o Claude do Marketing enviar um conteúdo, ele aparece aqui." /></div>
      )}
    </>
  );
}

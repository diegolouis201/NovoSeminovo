import Link from "next/link";
import { MKT_REDES, MKT_STATUS, MKT_TIPOS } from "@novoseminovo/shared-types";
import { Cabecalho } from "@/components/ui";
import { qs } from "@/lib/fin";
import { COR_STATUS, exigirMarketing, mkt } from "@/lib/mkt";
import { dataHora } from "@/lib/format";

export const metadata = { title: "Conteúdos" };

export default async function Conteudos({ searchParams }: { searchParams: { status?: string; rede?: string; mes?: string } }) {
  await exigirMarketing();
  const lista = await mkt.listar(qs({ status: searchParams.status, rede: searchParams.rede, mes: searchParams.mes }));
  return (
    <>
      <Cabecalho titulo="Conteúdos" subtitulo="Tudo o que foi criado: posts, carrosséis, vídeos, e-mails, WhatsApp e anúncios." acao={<Link href="/marketing/novo" className="btn">+ Conteúdo</Link>} />
      <form className="mb-4 grid gap-2 sm:grid-cols-4">
        <select name="status" defaultValue={searchParams.status ?? ""} className="input">
          <option value="">Todas as situações</option>
          {Object.entries(MKT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="rede" defaultValue={searchParams.rede ?? ""} className="input">
          <option value="">Todas as redes</option>
          {Object.entries(MKT_REDES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="month" name="mes" defaultValue={searchParams.mes} className="input" aria-label="Mês" />
        <button className="btn-primary">Filtrar</button>
      </form>
      <div className="card overflow-x-auto p-0">
        <table className="tabela min-w-[880px]">
          <thead><tr><th>Quando</th><th>Conteúdo</th><th>Redes</th><th>Situação</th><th>Resultado</th></tr></thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id}>
                <td className="whitespace-nowrap text-xs">{c.dataPlanejada ? dataHora(c.dataPlanejada) : "—"}</td>
                <td>
                  <Link className="link" href={`/marketing/conteudos/${c.id}`}>{c.titulo}</Link>
                  <p className="text-xs text-muted">{MKT_TIPOS[c.tipo as keyof typeof MKT_TIPOS] ?? c.tipo}{c.revisao > 1 ? ` · versão ${c.revisao}` : ""}</p>
                </td>
                <td className="text-xs">{c.redes.map((r) => (c.links[r] ? `✅ ${MKT_REDES[r as keyof typeof MKT_REDES] ?? r}` : MKT_REDES[r as keyof typeof MKT_REDES] ?? r)).join(" · ")}</td>
                <td><span className={`pill whitespace-nowrap ${COR_STATUS[c.status] ?? ""}`}>{MKT_STATUS[c.status as keyof typeof MKT_STATUS] ?? c.status}</span></td>
                <td className="text-xs">{c.metricas ? `${c.metricas.reach ?? 0} alcance · ${c.metricas.likes ?? 0} curtidas · ${c.metricas.comments ?? 0} coment.` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!lista.length ? <p className="p-6 text-center text-sm text-muted">Nenhum conteúdo neste filtro.</p> : null}
      </div>
    </>
  );
}

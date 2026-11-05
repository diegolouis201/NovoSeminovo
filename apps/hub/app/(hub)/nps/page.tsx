import Link from "next/link";
import { Cabecalho, Kpi, Secao, Vazio } from "@/components/ui";
import { calc, feed, hoje, marcacoes } from "@/lib/crm";
import { data } from "@/lib/format";

export const metadata = { title: "NPS" };

export default async function Nps() {
  const [f, m] = await Promise.all([feed(), marcacoes()]);
  const h = hoje();
  const n = calc.visaoGeral(f, h).numeros.nps;
  const respostas = f.empresas.filter((e) => e.nps).sort((a, b) => b.nps!.data.localeCompare(a.nps!.data));
  const pendentes: { empresaId: string; cardId?: string; nome: string; vendedor?: string; ultimaResposta?: string; ultimaNota?: number }[] = calc.npsPendentes(f, h, m);
  const cor = { promotor: "bg-green/15 text-green", neutro: "bg-line text-navy", detrator: "bg-orange/15 text-danger" } as const;
  return (
    <>
      <Cabecalho titulo="NPS" subtitulo="O site pergunta sozinho no painel do parceiro (30 dias depois do cadastro e a cada 90). Aqui ficam as notas e quem ainda não respondeu." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi valor={n.score ?? "—"} rotulo="NPS dos últimos 90 dias" detalhe="promotores − detratores" />
        <Kpi valor={n.promotores} rotulo="Promotores (9 e 10)" tom="green" />
        <Kpi valor={n.neutros} rotulo="Neutros (7 e 8)" />
        <Kpi valor={n.detratores} rotulo="Detratores (0 a 6)" tom={n.detratores ? "danger" : "navy"} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Secao titulo="Últimas respostas">
          {respostas.length ? (
            <ul className="divide-y divide-line">
              {respostas.slice(0, 50).map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <Link className="link" href={`/empresas/${e.cardId ?? e.id}`}>{e.nome}</Link>
                    <p className="text-xs text-muted">{data(e.nps!.data)}{e.nps!.comentario ? ` · “${e.nps!.comentario}”` : ""}</p>
                  </div>
                  <span className={`pill ${cor[e.nps!.classificacao]}`}>{e.nps!.nota}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Vazio titulo="Nenhuma resposta ainda" texto="As notas aparecem aqui assim que as empresas responderem no painel do parceiro." />
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

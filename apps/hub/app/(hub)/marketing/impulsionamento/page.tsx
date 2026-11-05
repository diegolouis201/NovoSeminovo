import Link from "next/link";
import { MKT_IMPULSO_STATUS, MKT_REDES } from "@novoseminovo/shared-types";
import { Form } from "@/components/Form";
import { Cabecalho, Kpi, Secao } from "@/components/ui";
import { aprovarImpulso, salvarRegrasImpulso } from "@/lib/actions";
import { exigirMarketing, mkt } from "@/lib/mkt";
import { brl, data } from "@/lib/format";

export const metadata = { title: "Impulsionamento" };
const REGRAS: [string, string][] = [["objetivo", "Objetivo"], ["criterios", "Quais posts impulsionar"], ["publicos", "Públicos"], ["orcamento", "Orçamento"], ["execucao", "Como executamos"], ["regras", "Quando parar ou mudar"]];
const soma = (inicio: string, n: number) => new Date(new Date(`${inicio}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

export default async function Impulsionamento() {
  await exigirMarketing();
  const { regras, lista } = await mkt.impulso();
  const limite = regras.limiteDia ?? 20;
  // Gasto planejado por rede e por dia (o que não foi encerrado).
  const porDia: Record<string, Record<string, number>> = {};
  for (const c of lista) {
    const b = c.impulso!;
    if (b.status === "encerrado" || !b.inicio || !b.dias || !b.orcamentoDia) continue;
    for (const rede of c.redes) for (let i = 0; i < b.dias; i++) {
      const d = soma(b.inicio, i);
      (porDia[rede] ??= {})[d] = (porDia[rede][d] ?? 0) + b.orcamentoDia;
    }
  }
  const total = lista.filter((c) => c.impulso!.status !== "encerrado").reduce((s, c) => s + (c.impulso!.orcamentoDia ?? 0) * (c.impulso!.dias ?? 0), 0);
  const gasto = lista.reduce((s, c) => s + (c.impulso!.resultados?.gasto ?? 0), 0);
  return (
    <>
      <Cabecalho titulo="Impulsionamento" subtitulo="Posts que viram anúncio: proposto → você aprova → o Claude coloca no ar (Meta Ads / Google Ads) → resultados entram aqui. Nada roda sem a sua aprovação." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi valor={brl(total)} rotulo="Planejado" />
        <Kpi valor={brl(gasto)} rotulo="Gasto até agora" />
        <Kpi valor={lista.filter((c) => c.impulso!.status === "proposto").length} rotulo="Aguardando sua aprovação" tom="orange" />
        <Kpi valor={`${brl(limite)}/dia`} rotulo="Teto por rede, salvo aprovação" />
      </div>
      {Object.keys(porDia).length ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(porDia).map(([rede, dias]) => {
            const pico = Math.max(...Object.values(dias));
            const acima = Object.entries(dias).filter(([, v]) => v > limite);
            return (
              <div key={rede} className={`card ${acima.length ? "border-2 border-danger" : ""}`}>
                <p className="text-sm font-semibold">{MKT_REDES[rede as keyof typeof MKT_REDES] ?? rede}</p>
                <p className="font-display text-2xl font-semibold text-navy">{brl(pico)} <span className="text-xs text-muted">no dia mais cheio</span></p>
                <div className="mt-2 h-2 rounded-full bg-line"><div className={`h-2 rounded-full ${acima.length ? "bg-danger" : "bg-green"}`} style={{ width: `${Math.min(100, (pico / limite) * 100)}%` }} /></div>
                <p className="mt-1 text-xs text-muted">{acima.length ? `Passa do teto em ${acima.length} dia(s): ${acima.slice(0, 4).map(([d]) => data(d).slice(0, 5)).join(", ")}` : "Dentro do teto."}</p>
              </div>
            );
          })}
        </div>
      ) : null}
      <Secao titulo="Posts impulsionados" className="mt-6">
        {lista.length ? (
          <div className="overflow-x-auto">
            <table className="tabela min-w-[980px]">
              <thead><tr><th>Período</th><th>Post</th><th>Objetivo · público</th><th className="text-right">R$/dia × dias</th><th>Situação</th><th className="text-right">Gasto</th><th className="text-right">Cliques</th><th></th></tr></thead>
              <tbody>
                {lista.map((c) => {
                  const b = c.impulso!;
                  return (
                    <tr key={c.id}>
                      <td className="whitespace-nowrap text-xs">{b.inicio ? `${data(b.inicio)} → ${b.dias ? data(soma(b.inicio, b.dias - 1)) : "?"}` : "sem data"}</td>
                      <td><Link className="link" href={`/marketing/conteudos/${c.id}`}>{c.titulo}</Link><p className="text-xs text-muted">{c.redes.map((r) => MKT_REDES[r as keyof typeof MKT_REDES] ?? r).join(", ")}</p></td>
                      <td className="text-xs">{b.objetivo ?? "—"}<br /><span className="text-muted">{[b.publico, b.local, b.idade].filter(Boolean).join(" · ")}</span></td>
                      <td className="whitespace-nowrap text-right text-sm">{brl(b.orcamentoDia)} × {b.dias ?? "?"}<br /><b>{brl((b.orcamentoDia ?? 0) * (b.dias ?? 0))}</b></td>
                      <td><span className={`pill whitespace-nowrap ${b.status === "proposto" ? "bg-orange/15 text-danger" : b.status === "ativo" ? "bg-blue/10 text-blue" : b.status === "aprovado" ? "bg-green/15 text-green" : "bg-line text-muted"}`}>{MKT_IMPULSO_STATUS[b.status as keyof typeof MKT_IMPULSO_STATUS] ?? b.status}</span></td>
                      <td className="text-right">{b.resultados?.gasto !== undefined ? brl(b.resultados.gasto) : "—"}</td>
                      <td className="text-right">{b.resultados?.cliques ?? "—"}</td>
                      <td>{b.status === "proposto" ? <form action={aprovarImpulso}><input type="hidden" name="id" value={c.id} /><button className="btn-primary">Aprovar</button></form> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-muted">Nenhum post marcado para impulsionar.</p>}
      </Secao>
      <Secao titulo="Estratégia de impulsionamento" className="mt-6">
        <Form action={salvarRegrasImpulso} botao="Salvar estratégia" manter className="grid gap-3 md:grid-cols-2">
          {REGRAS.map(([k, l]) => (
            <div key={k}>
              <label className="label" htmlFor={`r-${k}`}>{l}</label>
              <textarea id={`r-${k}`} name={k} rows={3} maxLength={3000} defaultValue={(regras as Record<string, string | undefined>)[k] ?? ""} className="input" />
            </div>
          ))}
          <div>
            <label className="label" htmlFor="limiteDia">Teto por rede (R$/dia)</label>
            <input id="limiteDia" name="limiteDia" inputMode="decimal" defaultValue={String(limite)} className="input" />
          </div>
        </Form>
      </Secao>
    </>
  );
}

import Link from "next/link";
import { Cabecalho } from "@/components/ui";
import { ETAPAS, feed, hoje, marcacoes } from "@/lib/crm";
import { brl, data } from "@/lib/format";

export const metadata = { title: "Funil" };

type Card = { chave: string; nome: string; vendedor?: string; cidade?: string; proximo?: string; plano?: string; valor?: number; importante?: boolean };

export default async function Funil({ searchParams }: { searchParams: { segmento?: string } }) {
  const [f, m] = await Promise.all([feed(), marcacoes()]);
  const seg = searchParams.segmento;
  const hojeIso = hoje().toISOString().slice(0, 10);
  const colunas = new Map<string, Card[]>(ETAPAS.map((e: { id: string }) => [e.id, []]));
  for (const p of f.prospeccao) if (!seg || p.segmento === seg) colunas.get(p.etapa.id)?.push({ chave: p.cardId, nome: p.nome, vendedor: p.vendedor, cidade: p.cidade, proximo: p.proximoContato, importante: m[p.cardId]?.importante });
  for (const e of f.empresas) if (!seg || e.segmento === seg) colunas.get(e.etapa.id)?.push({ chave: e.cardId ?? e.id, nome: e.nome, vendedor: e.vendedor, cidade: e.cidade, proximo: e.proximoContato, plano: e.plano?.nome, valor: e.plano?.valorMensal, importante: m[e.id]?.importante || (e.cardId ? m[e.cardId]?.importante : false) });

  return (
    <>
      <Cabecalho
        titulo="Funil"
        subtitulo="Da prospecção até assinante. Mudar etapa: na ficha da empresa (as etapas depois do cadastro andam sozinhas pelo site)."
        acao={
          <form className="flex gap-2">
            <select name="segmento" defaultValue={seg ?? ""} className="input">
              <option value="">Carros e imóveis</option>
              <option value="vehicle">Veículos</option>
              <option value="property">Imóveis</option>
            </select>
            <button className="btn">Filtrar</button>
          </form>
        }
      />
      <div className="flex gap-4 overflow-x-auto pb-4">
        {ETAPAS.map((etapa: { id: string; nome: string }) => {
          const cards = colunas.get(etapa.id) ?? [];
          return (
            <div key={etapa.id} className="w-72 shrink-0">
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="font-display font-semibold text-navy">{etapa.nome}</h2>
                <span className="pill bg-line text-navy">{cards.length}</span>
              </div>
              <div className="space-y-2">
                {cards.slice(0, 60).map((c) => (
                  <Link key={c.chave} href={`/empresas/${c.chave}`} className="block rounded-xl border border-line bg-white p-3 text-sm shadow-sm hover:border-blue">
                    <p className="font-semibold text-navy">{c.importante ? "⭐ " : ""}{c.nome}</p>
                    <p className="text-xs text-muted">{[c.cidade, c.vendedor ?? "Sem dono"].filter(Boolean).join(" · ")}</p>
                    {c.plano ? <p className="mt-1 text-xs">{c.plano} · {brl(c.valor)}/mês</p> : null}
                    {c.proximo ? <p className={`mt-1 text-xs font-semibold ${c.proximo.slice(0, 10) < hojeIso ? "text-danger" : "text-blue"}`}>Contato: {data(c.proximo)}</p> : null}
                  </Link>
                ))}
                {cards.length > 60 ? <Link className="link block px-1 text-sm" href={`/empresas?etapa=${etapa.id}`}>Ver todas ({cards.length})</Link> : null}
                {!cards.length ? <p className="rounded-xl border border-dashed border-line p-3 text-center text-xs text-muted">Vazio</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

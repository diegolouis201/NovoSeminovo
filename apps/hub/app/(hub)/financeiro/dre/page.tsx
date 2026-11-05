import { Cabecalho } from "@/components/ui";
import { exigirFinanceiro, fin, pct } from "@/lib/fin";
import { brl, nomeMes } from "@/lib/format";
import type { LinhaDre } from "@/lib/fin";

export const metadata = { title: "DRE" };

type Linha = { rotulo: string; valor: (l: LinhaDre) => number | undefined; forte?: boolean; pct?: boolean; cat?: string; sub?: boolean };

export default async function Dre({ searchParams }: { searchParams: { ano?: string; regime?: string } }) {
  await exigirFinanceiro();
  const anoAtual = new Date().getUTCFullYear();
  const ano = Number(searchParams.ano) || anoAtual;
  const regime = searchParams.regime === "caixa" ? "caixa" : "competencia";
  const d = await fin.dre(ano, regime);
  const cats = (g: string) => d.categorias.filter((c) => c.grupo === g);
  const linhaCat = (c: { codigo: string; nome: string }): Linha => ({ rotulo: `${c.codigo}  ${c.nome}`, valor: (l) => l.porCategoria[c.codigo] ?? 0, cat: c.codigo, sub: true });
  const linhas: Linha[] = [
    ...cats("receita").map(linhaCat),
    { rotulo: "(=) Receita bruta", valor: (l) => l.receitaBruta, forte: true },
    ...cats("deducao").map(linhaCat),
    { rotulo: "(=) Receita líquida", valor: (l) => l.receitaLiquida, forte: true },
    ...cats("custo").map(linhaCat),
    { rotulo: "(=) Margem de contribuição", valor: (l) => l.margemContribuicao, forte: true },
    { rotulo: "Margem de contribuição %", valor: (l) => l.margemPct, pct: true },
    ...cats("despesa_fixa").map(linhaCat),
    { rotulo: "(=) EBITDA", valor: (l) => l.ebitda, forte: true },
    ...cats("nao_operacional").map(linhaCat),
    { rotulo: "(=) Lucro líquido", valor: (l) => l.lucroLiquido, forte: true },
    ...cats("retirada").map(linhaCat),
  ];
  const col = [...d.meses, { ...d.total, mes: "total" }];
  const fmt = (v: number | undefined, p?: boolean) => (v === undefined ? "—" : p ? pct(v) : v === 0 ? "—" : brl(v).replace("R$", "").trim());
  return (
    <>
      <Cabecalho
        titulo="DRE e resultado"
        subtitulo={regime === "competencia" ? "Regime de competência: cada receita e despesa no mês a que pertence (inclui o que está em aberto)." : "Regime de caixa: só o que foi pago ou recebido, no mês do pagamento."}
        acao={
          <form className="flex flex-wrap gap-2">
            <select name="ano" defaultValue={ano} className="input w-auto">{[anoAtual - 1, anoAtual, anoAtual + 1].map((y) => <option key={y}>{y}</option>)}</select>
            <select name="regime" defaultValue={regime} className="input w-auto">
              <option value="competencia">Competência</option>
              <option value="caixa">Caixa</option>
            </select>
            <button className="btn">Ver</button>
          </form>
        }
      />
      <div className="card overflow-x-auto p-0">
        <table className="tabela min-w-[1500px] text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white">{regime === "competencia" ? "Competência" : "Caixa"} · R$</th>
              {col.map((l) => <th key={l.mes} className="text-right capitalize">{l.mes === "total" ? `Total ${ano}` : nomeMes(l.mes).slice(0, 3)}</th>)}
            </tr>
          </thead>
          <tbody>
            {linhas.map((ln) => (
              <tr key={ln.rotulo} className={ln.forte ? "bg-cream font-semibold text-navy" : ""}>
                <td className={`sticky left-0 whitespace-nowrap ${ln.forte ? "bg-cream" : "bg-white"} ${ln.sub ? "pl-6 text-muted" : ""} ${ln.pct ? "italic text-muted" : ""}`}>{ln.rotulo}</td>
                {col.map((l) => {
                  const v = ln.valor(l as LinhaDre);
                  return <td key={l.mes} className={`text-right ${typeof v === "number" && v < 0 && !ln.sub ? "text-danger" : ""}`}>{fmt(v, ln.pct)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">Faturamento = planos (Stripe) + outras receitas lançadas. Financiamentos e programa de afiliados ficam fora do DRE (só visualização, em Receitas por categoria). Retiradas dos sócios aparecem depois do lucro.</p>
    </>
  );
}

// Monta o relatório de receitas (Markdown) a partir de dados/receitas.json.
// Faturamento = planos. Lojas parceiras (links de afiliado), financiamentos e
// o programa de afiliados são só visualização: não entram no faturamento.

export function brl(value) {
  const [int, dec] = Math.abs(Number(value ?? 0)).toFixed(2).split(".");
  return `${value < 0 ? "-" : ""}R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesCurto = (mes) => `${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`;

export function buildRevenueReport(r) {
  const { consolidado: c, planos: p, financiamentos: f, afiliados: a } = r;
  const linhas = [];
  const add = (text = "") => linhas.push(text);
  const data = new Date(r.geradoEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  add(`# Receitas — ${data}`);
  add();
  add("## Faturamento (planos)");
  add();
  add(`- Faturamento do mês (em andamento): ${brl(c.esteMes)}`);
  add(`- Mês passado: ${brl(c.mesPassado)}`);
  add(`- Faturamento 12 meses: ${brl(c.total12m)}`);
  add();
  add("| Mês | Faturamento (planos) | Lojas parceiras* | Financiamentos* |");
  add("|---|---:|---:|---:|");
  for (const m of c.porMes) add(`| ${mesCurto(m.mes)} | ${brl(m.total)} | ${brl(m.lojas)} | ${brl(m.financiamentos)} |`);
  add();
  add("\\* só visualização, não entram no faturamento.");
  add();
  add("## Planos (receita principal)");
  add();
  add(`- Mensalidades (MRR): ${brl(p.mrr)} · ${p.assinantes} assinante(s)`);
  add(`- Este mês: ${brl(p.esteMes)} · mês passado: ${brl(p.mesPassado)} · 12 meses: ${brl(p.total12m)}`);
  add(`- Estornos em 12 meses: ${brl(p.estornos12m)}`);
  add();
  add("## Lojas parceiras (links de afiliado) — só visualização");
  add();
  add(`- 12 meses: ${brl(a.lojas.total12m)} · cliques nos links (30 dias): ${a.lojas.cliques30d}`);
  for (const l of a.lojas.porLoja) add(`- ${l.loja}: ${brl(l.valor12m)}`);
  add();
  add("## Financiamentos — só visualização (não entra no caixa nem no faturamento)");
  add();
  add(`- Negócios em 12 meses: ${f.negocios12m} · valor financiado: ${brl(f.valorFinanciado12m)}`);
  add(`- Líquido 12 meses: ${brl(f.liquido12m)} (comissão do banco menos cashback)`);
  add(`- Pedidos de financiamento em andamento: ${f.leadsAbertos}`);
  add();
  add("## Programa de afiliados (custo) — só visualização");
  add();
  const pr = a.programa;
  add(`- Afiliados ativos: ${pr.ativos} (${pr.pendentes} aguardando aprovação) · indicados: ${pr.indicados} · cliques (30 dias): ${pr.cliques30d}`);
  add(`- O que os indicados pagaram em 12 meses: ${brl(pr.receitaGerada12m)}`);
  add(`- Comissões: a confirmar ${brl(pr.comissoes.aConfirmar)} · liberadas ${brl(pr.comissoes.disponivel)} · pagas ${brl(pr.comissoes.paga)} · canceladas ${brl(pr.comissoes.cancelada)}`);
  if (pr.ranking.length) {
    add();
    add("| Afiliado | Indicados | Receita gerada | Comissão |");
    add("|---|---:|---:|---:|");
    for (const x of pr.ranking) add(`| ${x.nome} (${x.codigo}) | ${x.indicados} | ${brl(x.receitaGerada)} | ${brl(x.comissao)} |`);
  }
  add();
  add("## Para o Diego decidir");
  add();
  add("Envolve dinheiro: nada aqui vira ordem sem o Diego.");
  add();
  add(`- Comissões de afiliados liberadas para pagar: ${brl(pr.comissoes.disponivel)} (pagar em /admin/afiliados)`);
  add(`- Cashback de financiamento a pagar: ${brl(f.cashbackAPagar)}`);
  add(`- Comissão de financiamento a receber do banco: ${brl(f.comissaoAReceber)}`);
  add();
  return linhas.join("\n");
}

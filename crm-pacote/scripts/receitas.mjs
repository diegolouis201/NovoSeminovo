// Baixa as receitas por categoria do site e gera o relatório do mês.
// Uso: node scripts/receitas.mjs
import { api, iso, today, writeJson, writeText } from "./lib.mjs";
import { brl, buildRevenueReport } from "./receitas-relatorio.mjs";

const receitas = await api("/crm/receitas");
writeJson("dados/receitas.json", receitas);
const arquivo = `relatorios/receitas-${iso(today()).slice(0, 7)}.md`;
writeText(arquivo, buildRevenueReport(receitas));
console.log(`Faturamento do mês (em andamento): ${brl(receitas.consolidado.esteMes)} · 12 meses: ${brl(receitas.consolidado.total12m)} · MRR: ${brl(receitas.planos.mrr)}`);
console.log(`Financiamentos (só acompanhamento): comissão 12 meses ${brl(receitas.financiamentos.comissao12m)}`);
console.log(`Relatório: ${arquivo}`);

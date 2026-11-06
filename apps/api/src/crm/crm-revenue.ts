import { STORE_EARNING_STORES, type CrmRevenue } from "@novoseminovo/shared-types";

// Receitas por categoria do CRM. Função pura: recebe as linhas do banco e a
// data de hoje. Faturamento = planos. Lojas parceiras (links de afiliado),
// financiamentos (comissão do banco, toda da empresa) e o programa de
// afiliados são só para visualização e ficam fora do total.

type Money = unknown;
export type RevenueInput = {
  subscriptionPayments: { paidAt: Date; amount: Money; refundedAmount: Money }[];
  listingPlans: { paidAt: Date | null; amount: Money }[];
  mrr: number;
  assinantes: number;
  deals: { createdAt: Date; financedAmount: Money; commissionAmount: Money; commissionReceivedAt: Date | null }[];
  leadsAbertos: number;
  storeEarnings: { month: string; store: string; amount: Money }[];
  storeClicks30d: number;
  affiliates: { id: string; code: string; name: string; status: string; referrals: number; clicks30d: number }[];
  commissions: { affiliateId: string; baseAmount: Money; amount: Money; status: string; createdAt: Date }[];
};

const num = (value: Money) => Number(value ?? 0);
const cents = (value: number) => Math.round(value * 100) / 100;
const monthKey = (date: Date) => date.toISOString().slice(0, 7);
const sum = <T>(rows: T[], pick: (row: T) => number) => cents(rows.reduce((acc, row) => acc + pick(row), 0));

export function buildCrmRevenue(input: RevenueInput, hoje: Date): CrmRevenue {
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) months.push(monthKey(new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - i, 1))));
  const inWindow = new Set(months);
  const [mesPassadoKey, esteMesKey] = [months[10]!, months[11]!];
  const blank = () => new Map(months.map((m) => [m, 0]));
  const add = (map: Map<string, number>, key: string, value: number) => {
    if (map.has(key)) map.set(key, map.get(key)! + value);
  };

  // ---- Planos ----
  const subs = blank();
  const ads = blank();
  let estornos = 0;
  for (const p of input.subscriptionPayments) {
    add(subs, monthKey(p.paidAt), num(p.amount) - num(p.refundedAmount));
    if (inWindow.has(monthKey(p.paidAt))) estornos += num(p.refundedAmount);
  }
  for (const p of input.listingPlans) if (p.paidAt) add(ads, monthKey(p.paidAt), num(p.amount));
  const planosPorMes = months.map((mes) => ({ mes, assinaturas: cents(subs.get(mes)!), anuncios: cents(ads.get(mes)!), total: cents(subs.get(mes)! + ads.get(mes)!) }));
  const planoDoMes = (mes: string) => planosPorMes.find((m) => m.mes === mes)!.total;

  // ---- Lojas parceiras (links de afiliado) ----
  const stores = blank();
  const byStore = new Map<string, number>();
  for (const e of input.storeEarnings) {
    if (!inWindow.has(e.month)) continue;
    add(stores, e.month, num(e.amount));
    const name = STORE_EARNING_STORES[e.store as keyof typeof STORE_EARNING_STORES] ?? e.store;
    byStore.set(name, (byStore.get(name) ?? 0) + num(e.amount));
  }
  const lojasPorMes = months.map((mes) => ({ mes, valor: cents(stores.get(mes)!) }));

  // ---- Financiamentos (só acompanhamento) ----
  const deals12m = input.deals.filter((deal) => inWindow.has(monthKey(deal.createdAt)));
  const financiamentosPorMes = months.map((mes) => {
    const rows = deals12m.filter((deal) => monthKey(deal.createdAt) === mes);
    return { mes, negocios: rows.length, comissao: sum(rows, (deal) => num(deal.commissionAmount)) };
  });

  // ---- Consolidado: faturamento = planos; o resto só para visualização ----
  const consolidadoPorMes = months.map((mes) => {
    const planos = planoDoMes(mes);
    return { mes, planos, lojas: cents(stores.get(mes)!), financiamentos: financiamentosPorMes.find((m) => m.mes === mes)!.comissao, total: planos };
  });
  const totalDoMes = (mes: string) => consolidadoPorMes.find((m) => m.mes === mes)!.total;

  // ---- Programa de afiliados ----
  const valid = input.commissions.filter((c) => c.status !== "canceled");
  const byStatus = (status: string) => sum(input.commissions.filter((c) => c.status === status), (c) => num(c.amount));
  const ranking = input.affiliates
    .map((a) => {
      const own = valid.filter((c) => c.affiliateId === a.id);
      return { codigo: a.code, nome: a.name, indicados: a.referrals, receitaGerada: sum(own, (c) => num(c.baseAmount)), comissao: sum(own, (c) => num(c.amount)) };
    })
    .filter((a) => a.indicados > 0 || a.comissao > 0)
    .sort((a, b) => b.receitaGerada - a.receitaGerada || b.indicados - a.indicados)
    .slice(0, 10);

  return {
    geradoEm: hoje.toISOString(),
    consolidado: {
      porMes: consolidadoPorMes,
      total12m: sum(consolidadoPorMes, (m) => m.total),
      esteMes: totalDoMes(esteMesKey),
      mesPassado: totalDoMes(mesPassadoKey),
      acompanhamento12m: { lojas: sum(lojasPorMes, (m) => m.valor), financiamentos: sum(financiamentosPorMes, (m) => m.comissao) },
    },
    planos: {
      porMes: planosPorMes,
      total12m: sum(planosPorMes, (m) => m.total),
      esteMes: planoDoMes(esteMesKey),
      mesPassado: planoDoMes(mesPassadoKey),
      estornos12m: cents(estornos),
      mrr: cents(input.mrr),
      assinantes: input.assinantes,
    },
    financiamentos: {
      porMes: financiamentosPorMes,
      negocios12m: deals12m.length,
      valorFinanciado12m: sum(deals12m, (deal) => num(deal.financedAmount)),
      comissao12m: sum(financiamentosPorMes, (m) => m.comissao),
      comissaoRecebida: sum(input.deals.filter((deal) => deal.commissionReceivedAt), (deal) => num(deal.commissionAmount)),
      comissaoAReceber: sum(input.deals.filter((deal) => !deal.commissionReceivedAt), (deal) => num(deal.commissionAmount)),
      leadsAbertos: input.leadsAbertos,
    },
    afiliados: {
      lojas: {
        porMes: lojasPorMes,
        porLoja: [...byStore].map(([loja, valor]) => ({ loja, valor12m: cents(valor) })).sort((a, b) => b.valor12m - a.valor12m || a.loja.localeCompare(b.loja)),
        total12m: sum(lojasPorMes, (m) => m.valor),
        cliques30d: input.storeClicks30d,
      },
      programa: {
        ativos: input.affiliates.filter((a) => a.status === "approved").length,
        pendentes: input.affiliates.filter((a) => a.status === "pending").length,
        indicados: input.affiliates.reduce((acc, a) => acc + a.referrals, 0),
        cliques30d: input.affiliates.reduce((acc, a) => acc + a.clicks30d, 0),
        receitaGerada12m: sum(valid.filter((c) => inWindow.has(monthKey(c.createdAt))), (c) => num(c.baseAmount)),
        comissoes: { aConfirmar: byStatus("pending"), disponivel: byStatus("available"), paga: byStatus("paid"), cancelada: byStatus("canceled") },
        ranking,
      },
    },
  };
}

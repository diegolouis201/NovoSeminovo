import Link from "next/link";
import { redirect } from "next/navigation";
import { formatBRL } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { Card, CrmSectionNav, HBars, MonthColumns, Tile, int } from "@/components/crm/CrmUi";
import { fetchCrmRevenue } from "@/lib/api";

export const dynamic = "force-dynamic";

// Receitas por categoria. Faturamento = planos + lojas parceiras (links de
// afiliado). Financiamento aparece só para acompanhamento: não soma no total.

function change(now: number, before: number): string | undefined {
  if (!before) return "mês em andamento";
  const value = Math.round(((now - before) / before) * 100);
  return `mês em andamento · ${value >= 0 ? "▲" : "▼"} ${Math.abs(value)}% vs. mês passado inteiro`;
}

export default async function AdminCrmRevenuePage() {
  const session = await auth();
  if (!session?.user) redirect("/entrar");
  if (session.user.role !== "admin") redirect("/admin");

  const data = await fetchCrmRevenue(session.accessToken);

  const header = (
    <header className="flex flex-col gap-3">
      <div>
        <Link href="/admin" className="text-sm font-semibold text-brand-blue hover:underline">
          ← Moderação
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Receitas</h1>
        <p className="text-sm text-ink-muted">
          Faturamento por categoria. Financiamentos aparecem só para acompanhamento e não entram no total.
          {data && ` Atualizado em ${new Date(data.geradoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`}
        </p>
      </div>
      <CrmSectionNav current="receitas" />
    </header>
  );

  if (!data) {
    return (
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12">
        {header}
        <p className="rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">Não consegui carregar as receitas agora. Tente de novo em alguns minutos.</p>
      </main>
    );
  }

  const { consolidado, planos, financiamentos: fin, afiliados } = data;
  const programa = afiliados.programa;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-12">
      {header}

      <section aria-label="Resumo das receitas" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Faturamento este mês" value={formatBRL(consolidado.esteMes)} hint={change(consolidado.esteMes, consolidado.mesPassado)} />
        <Tile label="Faturamento 12 meses" value={formatBRL(consolidado.total12m)} hint="planos + lojas parceiras" />
        <Tile label="Mensalidades (MRR)" value={formatBRL(planos.mrr)} hint={`${int(planos.assinantes)} assinante(s)`} />
        <Tile label="Comissões de afiliados a pagar" value={formatBRL(programa.comissoes.disponivel)} hint="liberadas para pagamento" />
      </section>

      <Card title="Faturamento consolidado" note="Por mês, nos últimos 12 meses. Financiamento não entra aqui.">
        <MonthColumns
          label={`Faturamento por mês: total de 12 meses ${formatBRL(consolidado.total12m)}`}
          months={consolidado.porMes.map((m) => ({ mes: m.mes, values: [m.planos, m.lojas] }))}
          series={[
            { name: "Planos", color: "bg-chart-1" },
            { name: "Lojas parceiras", color: "bg-chart-2" },
          ]}
          format={formatBRL}
        />
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Receita de planos" note="Receita principal: mensalidades de lojas e imobiliárias + planos de anúncio de pessoa física, sem estornos.">
          <dl className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
            <div>
              <dt className="text-xs text-ink-muted">Este mês</dt>
              <dd className="font-semibold text-ink">{formatBRL(planos.esteMes)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Mês passado</dt>
              <dd className="font-semibold text-ink">{formatBRL(planos.mesPassado)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">12 meses</dt>
              <dd className="font-semibold text-ink">{formatBRL(planos.total12m)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Estornos (12 meses)</dt>
              <dd className="font-semibold text-ink">{formatBRL(planos.estornos12m)}</dd>
            </div>
          </dl>
          <MonthColumns
            label={`Receita de planos por mês: total ${formatBRL(planos.total12m)}`}
            months={planos.porMes.map((m) => ({ mes: m.mes, values: [m.assinaturas, m.anuncios] }))}
            series={[
              { name: "Assinaturas", color: "bg-chart-1" },
              { name: "Planos de anúncio", color: "bg-chart-2" },
            ]}
            format={formatBRL}
          />
        </Card>

        <Card title="Financiamentos" note="Comissão do banco menos o cashback devolvido a quem contratou.">
          <p className="w-fit rounded-full bg-surface-sober px-3 py-1 text-xs font-semibold text-ink">Só acompanhamento · Não entra no caixa nem no faturamento</p>
          <dl className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
            <div>
              <dt className="text-xs text-ink-muted">Negócios (12 meses)</dt>
              <dd className="font-semibold text-ink">{int(fin.negocios12m)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Valor financiado</dt>
              <dd className="font-semibold text-ink">{formatBRL(fin.valorFinanciado12m)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Líquido (12 meses)</dt>
              <dd className="font-semibold text-ink">{formatBRL(fin.liquido12m)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Comissão a receber</dt>
              <dd className="font-semibold text-ink">{formatBRL(fin.comissaoAReceber)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Cashback a pagar</dt>
              <dd className="font-semibold text-ink">{formatBRL(fin.cashbackAPagar)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Pedidos em andamento</dt>
              <dd className="font-semibold text-ink">{int(fin.leadsAbertos)}</dd>
            </div>
          </dl>
          <MonthColumns
            label={`Líquido de financiamentos por mês: ${formatBRL(fin.liquido12m)} em 12 meses`}
            months={fin.porMes.map((m) => ({ mes: m.mes, values: [Math.max(0, m.liquido)] }))}
            series={[{ name: "Líquido", color: "bg-ink-muted" }]}
            format={formatBRL}
          />
        </Card>

        <Card title="Lojas parceiras (links de afiliado)" note="Comissão de Amazon, Mercado Livre e outras lojas, lançada por mês em Painel geral. Entra no faturamento.">
          <p className="text-sm text-ink-muted">
            12 meses: <strong className="text-ink">{formatBRL(afiliados.lojas.total12m)}</strong> · cliques nos links (30 dias):{" "}
            <strong className="text-ink">{int(afiliados.lojas.cliques30d)}</strong>
          </p>
          <HBars
            label="Comissão por loja em 12 meses"
            rows={afiliados.lojas.porLoja.map((l) => ({ name: l.loja, value: l.valor12m, display: formatBRL(l.valor12m) }))}
            muted="Nenhuma comissão de loja lançada nos últimos 12 meses."
          />
          <Link href="/admin/painel" className="text-sm font-semibold text-brand-blue hover:underline">
            Lançar comissão do mês →
          </Link>
        </Card>

        <Card title="Programa de afiliados" note="Quem indica o NovoSeminovo: o que os indicados pagaram e a comissão de cada afiliado (custo, não receita).">
          <dl className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
            <div>
              <dt className="text-xs text-ink-muted">Afiliados ativos</dt>
              <dd className="font-semibold text-ink">
                {int(programa.ativos)}
                {programa.pendentes > 0 && <span className="font-normal text-ink-muted"> · {int(programa.pendentes)} aguardando</span>}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Indicados</dt>
              <dd className="font-semibold text-ink">{int(programa.indicados)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Cliques (30 dias)</dt>
              <dd className="font-semibold text-ink">{int(programa.cliques30d)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Receita gerada (12 meses)</dt>
              <dd className="font-semibold text-ink">{formatBRL(programa.receitaGerada12m)}</dd>
            </div>
          </dl>
          <HBars
            label="Comissões por situação"
            rows={[
              { name: "A confirmar (garantia)", value: programa.comissoes.aConfirmar, display: formatBRL(programa.comissoes.aConfirmar) },
              { name: "Liberada para pagar", value: programa.comissoes.disponivel, display: formatBRL(programa.comissoes.disponivel) },
              { name: "Paga", value: programa.comissoes.paga, display: formatBRL(programa.comissoes.paga) },
              { name: "Cancelada (estorno)", value: programa.comissoes.cancelada, display: formatBRL(programa.comissoes.cancelada), dim: true },
            ]}
          />
          {programa.ranking.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-muted">
                    <th className="py-1 pr-3 font-normal">Afiliado</th>
                    <th className="py-1 pr-3 text-right font-normal">Indicados</th>
                    <th className="py-1 pr-3 text-right font-normal">Receita gerada</th>
                    <th className="py-1 text-right font-normal">Comissão</th>
                  </tr>
                </thead>
                <tbody className="[font-variant-numeric:tabular-nums]">
                  {programa.ranking.map((a) => (
                    <tr key={a.codigo} className="border-t border-border">
                      <td className="py-1.5 pr-3 text-ink">
                        {a.nome} <span className="text-xs text-ink-muted">({a.codigo})</span>
                      </td>
                      <td className="py-1.5 pr-3 text-right">{int(a.indicados)}</td>
                      <td className="py-1.5 pr-3 text-right">{formatBRL(a.receitaGerada)}</td>
                      <td className="py-1.5 text-right font-semibold">{formatBRL(a.comissao)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Link href="/admin/afiliados" className="text-sm font-semibold text-brand-blue hover:underline">
            Pagar e gerenciar afiliados →
          </Link>
        </Card>
      </div>
    </main>
  );
}

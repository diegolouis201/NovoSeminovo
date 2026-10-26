import Link from "next/link";
import { redirect } from "next/navigation";
import {
  PARTNER_TYPE_LABELS,
  STORE_EARNING_STORES,
  formatBRL,
  type AdminOverview,
  type AdminOverviewDay,
  type AdminOverviewScope,
  type AdminOverviewTrend,
} from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { deleteStoreEarningAction, saveStoreEarningAction } from "@/lib/actions/admin-overview";
import { fetchAdminOverview } from "@/lib/api";

export const dynamic = "force-dynamic";

const SCOPES: { value: AdminOverviewScope; label: string }[] = [
  { value: "all", label: "Geral" },
  { value: "vehicle", label: "Veículos" },
  { value: "property", label: "Imóveis" },
];

const int = (value: number) => value.toLocaleString("pt-BR");

function monthLabel(month: string): string {
  const label = new Date(`${month}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

type Tile = { label: string; value: string; hint?: string; trend?: AdminOverviewTrend };

// Variação contra os 30 dias anteriores; sem base de comparação, não mostra %.
function TrendBadge({ trend }: { trend: AdminOverviewTrend }) {
  if (trend.prev30d === 0) {
    return trend.last30d > 0 ? <span className="text-xs font-semibold text-ink-muted">novo no período</span> : null;
  }
  const change = Math.round(((trend.last30d - trend.prev30d) / Math.abs(trend.prev30d)) * 100);
  const up = change >= 0;
  return (
    <span className={`text-xs font-semibold ${up ? "text-brand-green" : "text-status-danger"}`}>
      {up ? "▲" : "▼"} {Math.abs(change)}% <span className="font-normal text-ink-muted">vs. 30 dias antes</span>
    </span>
  );
}

function TileGrid({ title, note, tiles }: { title: string; note?: string; tiles: Tile[] }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
        {note && <p className="text-xs text-ink-muted">{note}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="flex flex-col gap-0.5 rounded-brand-lg border border-border bg-surface-raised p-4">
            <p className="text-xs text-ink-muted">{tile.label}</p>
            <p className="font-display text-2xl font-bold text-ink [font-variant-numeric:tabular-nums]">{tile.value}</p>
            {tile.trend && <TrendBadge trend={tile.trend} />}
            {tile.hint && <p className="text-xs text-ink-muted">{tile.hint}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

function shortDate(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// Uma série por gráfico (múltiplos pequenos, mesma cor): sem legenda, o título
// nomeia; o valor de cada dia aparece ao passar o mouse.
function DailyChart({ title, days, field }: { title: string; days: AdminOverviewDay[]; field: keyof Omit<AdminOverviewDay, "day"> }) {
  const values = days.map((day) => day[field]);
  const max = Math.max(1, ...values);
  const total = values.reduce((sum, value) => sum + value, 0);
  return (
    <div className="rounded-brand-lg border border-border bg-surface-raised p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <span className="text-sm font-bold text-ink [font-variant-numeric:tabular-nums]">{int(total)}</span>
      </div>
      <div className="mt-3 flex h-24 items-end gap-[2px]" role="img" aria-label={`${title} por dia nos últimos 30 dias: total ${total}, máximo ${max} em um dia`}>
        {days.map((day) => (
          <div key={day.day} className="group flex h-full flex-1 flex-col justify-end" title={`${shortDate(day.day)}: ${day[field]}`}>
            <div
              className="rounded-t-[4px] bg-brand-blue group-hover:bg-brand-green"
              style={{ height: `${day[field] === 0 ? 2 : Math.max(6, (day[field] / max) * 100)}%`, opacity: day[field] === 0 ? 0.25 : 1 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-ink-muted">
        <span>{days[0] ? shortDate(days[0].day) : ""}</span>
        <span>máx. {max}/dia</span>
        <span>hoje</span>
      </div>
    </div>
  );
}

export default async function AdminOverviewPage({ searchParams }: { searchParams: { tipo?: string; sucesso?: string; erro?: string } }) {
  const session = await auth();
  if (!session?.user) redirect("/entrar");
  if (session.user.role !== "admin") redirect("/admin");

  const scope: AdminOverviewScope = searchParams.tipo === "vehicle" || searchParams.tipo === "property" ? searchParams.tipo : "all";
  const back = scope === "all" ? "/admin/painel" : `/admin/painel?tipo=${scope}`;
  const data = await fetchAdminOverview(scope, session.accessToken);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12">
      <header className="flex flex-col gap-3">
        <div>
          <Link href="/admin" className="text-sm font-semibold text-brand-blue hover:underline">
            ← Moderação
          </Link>
          <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Painel geral</h1>
          <p className="text-sm text-ink-muted">
            Os grandes números do NovoSeminovo num lugar só. Tendências comparam os últimos 30 dias com os 30 dias anteriores.
            {data && ` Atualizado em ${new Date(data.generatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`}
          </p>
        </div>
        <nav className="flex w-fit gap-1 rounded-full bg-surface-sober p-1" aria-label="Recorte do painel">
          {SCOPES.map((item) => (
            <Link
              key={item.value}
              href={item.value === "all" ? "/admin/painel" : `/admin/painel?tipo=${item.value}`}
              aria-current={scope === item.value ? "page" : undefined}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${scope === item.value ? "bg-brand-blue text-on-blue" : "text-ink hover:bg-surface-raised"}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      {searchParams.erro && <p className="rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">{searchParams.erro}</p>}
      {searchParams.sucesso && <p className="rounded-brand bg-surface-sober px-4 py-3 text-sm text-ink">{searchParams.sucesso}</p>}
      {!data ? (
        <p className="text-sm text-status-danger">Não foi possível carregar os números agora. Tente de novo em instantes.</p>
      ) : (
        <Dashboard data={data} back={back} />
      )}
    </main>
  );
}

function Dashboard({ data, back }: { data: AdminOverview; back: string }) {
  const { revenue } = data;
  const scoped = data.scope !== "all";
  const sideLabel = data.scope === "vehicle" ? "carros" : "imóveis";
  const globalNote = scoped ? "Cadastros de pessoas e afiliados são do site todo (a conta não é de carro nem de imóvel)." : undefined;
  const listingsRevenue = { last30d: revenue.listingPlans.last30d + revenue.subscriptions.last30d, prev30d: revenue.listingPlans.prev30d + revenue.subscriptions.prev30d };

  const headline: Tile[] = [
    { label: "Receita (30 dias)", value: formatBRL(revenue.total.last30d), trend: revenue.total },
    { label: scoped ? `Anúncios ativos de ${sideLabel}` : "Anúncios ativos", value: int(data.listings.active) },
    { label: "Leads (30 dias)", value: int(data.engagement.leads.last30d), trend: data.engagement.leads },
    { label: "Novos cadastros (30 dias)", value: int(data.users.newUsers.last30d), trend: data.users.newUsers },
  ];

  return (
    <>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Destaques">
        {headline.map((item) => (
          <div key={item.label} className="flex flex-col gap-1 rounded-brand-lg bg-brand-blue p-5 text-on-blue">
            <p className="text-sm font-semibold opacity-90">{item.label}</p>
            <p className="font-display text-3xl font-bold [font-variant-numeric:tabular-nums] sm:text-4xl">{item.value}</p>
            {item.trend && <HeadlineTrend trend={item.trend} />}
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Receita — três linhas</h2>
          <p className="text-xs text-ink-muted">Últimos 30 dias. Só entra dinheiro que de fato foi pago.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <RevenueCard
            title="Anúncios"
            value={listingsRevenue.last30d}
            trend={listingsRevenue}
            lines={[
              `Planos de anúncio (pessoa física): ${formatBRL(revenue.listingPlans.last30d)} · ${int(revenue.listingPlansCount30d)} compras`,
              `Mensalidades de lojas e imobiliárias: ${formatBRL(revenue.subscriptions.last30d)}`,
              `Receita mensal recorrente hoje (MRR): ${formatBRL(revenue.mrr)} · ${int(revenue.payingSubscriptions)} assinaturas pagas${revenue.pastDue ? ` · ${int(revenue.pastDue)} em atraso` : ""}`,
            ]}
          />
          <RevenueCard
            title="Financiamento"
            value={revenue.financing.last30d}
            trend={revenue.financing}
            lines={[
              `${int(revenue.financingDeals30d)} financiamentos fechados`,
              `Comissão do banco menos o cashback dos clientes (${formatBRL(revenue.financingRebates30d)})`,
              `${int(revenue.financingOpenLeads)} pedidos de financiamento em andamento`,
            ]}
          />
          <RevenueCard
            title="Links de afiliados (lojas)"
            value={revenue.stores.last30d}
            trend={revenue.stores}
            lines={
              data.scope === "vehicle"
                ? ["Os links de lojas só aparecem no Arquiteto (imóveis)."]
                : [
                    `${int(revenue.storeClicks30d)} cliques em Amazon, Mercado Livre e outras lojas`,
                    "Valor lançado por você a partir do relatório de cada loja (veja abaixo).",
                  ]
            }
          />
        </div>
        <RevenueMonths data={data} />
      </section>

      <OriginsSection data={data} />

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-ink">Últimos 30 dias, dia a dia</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DailyChart title="Novos cadastros (site todo)" days={data.daily} field="users" />
          <DailyChart title="Anúncios criados" days={data.daily} field="listings" />
          <DailyChart title="Leads" days={data.daily} field="leads" />
          <DailyChart title="Mensagens no chat" days={data.daily} field="messages" />
        </div>
      </section>

      <TileGrid
        title="Anúncios"
        tiles={[
          {
            label: "Ativos",
            value: int(data.listings.active),
            hint: scoped ? undefined : `${int(data.listings.activeVehicles)} carros · ${int(data.listings.activeProperties)} imóveis`,
          },
          { label: "Criados (30 dias)", value: int(data.listings.created.last30d), trend: data.listings.created },
          {
            label: "Vendidos (30 dias)",
            value: int(data.listings.sold.last30d),
            trend: data.listings.sold,
            hint: data.listings.soldValue30d ? `${formatBRL(data.listings.soldValue30d)} em vendas` : undefined,
          },
          { label: "Visualizações (total)", value: int(data.listings.views) },
          { label: "Esperando análise", value: int(data.listings.pendingReview), hint: "fila da moderação" },
          { label: "Pausados", value: int(data.listings.paused) },
          { label: "Recusados", value: int(data.listings.rejected) },
          { label: "Expirados", value: int(data.listings.expired) },
          ...(scoped ? [{ label: "Preço médio dos ativos", value: data.listings.avgActivePrice ? formatBRL(data.listings.avgActivePrice) : "—" }] : []),
        ]}
      />

      <TileGrid
        title="Pessoas e parceiros"
        note={globalNote}
        tiles={[
          { label: "Usuários cadastrados", value: int(data.users.total) },
          { label: "Novos usuários (30 dias)", value: int(data.users.newUsers.last30d), trend: data.users.newUsers },
          { label: scoped ? `Pessoas que já anunciaram ${sideLabel}` : "Pessoas que já anunciaram", value: int(data.users.sellers) },
          { label: scoped ? `Parceiros de ${sideLabel}` : "Lojas e imobiliárias", value: int(data.partners.total), hint: `${int(data.partners.verified)} verificadas` },
          ...data.partners.byType.map((row) => ({ label: PARTNER_TYPE_LABELS[row.type] ?? row.type, value: int(row.count) })),
        ]}
      />

      <TileGrid
        title="Negociação"
        tiles={[
          {
            label: "Leads (30 dias)",
            value: int(data.engagement.leads.last30d),
            trend: data.engagement.leads,
            hint: `${int(data.engagement.leadsWon30d)} ganhos no período`,
          },
          { label: "Conversas no chat (30 dias)", value: int(data.engagement.conversations.last30d), trend: data.engagement.conversations },
          { label: "Mensagens (30 dias)", value: int(data.engagement.messages.last30d), trend: data.engagement.messages },
          { label: "Simulações de financiamento (30 dias)", value: int(data.engagement.simulations.last30d), trend: data.engagement.simulations },
          { label: "Favoritos salvos (total)", value: int(data.engagement.favorites) },
          { label: "Denúncias abertas", value: int(data.engagement.openReports) },
        ]}
      />

      <TileGrid
        title="Inteligência artificial"
        tiles={[
          { label: "Conversas com assistentes (30 dias, site todo)", value: int(data.ai.agentConversations.last30d), trend: data.ai.agentConversations },
          {
            label: "Interessados em financiamento (30 dias)",
            value: int(data.ai.financingLeads.last30d),
            trend: data.ai.financingLeads,
            hint: `${int(data.ai.financingLeadsConverted)} convertidos no total`,
          },
          ...(data.scope === "vehicle"
            ? []
            : [
                {
                  label: "Projetos do Arquiteto (30 dias)",
                  value: int(data.ai.architectSessions.last30d),
                  trend: data.ai.architectSessions,
                  hint: `${int(data.ai.architectImages30d)} imagens geradas`,
                },
              ]),
          { label: "Decisões da moderação automática (30 dias)", value: int(data.ai.autoModerated30d) },
        ]}
      />

      <TileGrid
        title="Programa de afiliados"
        note={globalNote}
        tiles={[
          {
            label: "Afiliados ativos",
            value: int(data.affiliates.active),
            hint: data.affiliates.pending ? `${int(data.affiliates.pending)} esperando aprovação` : undefined,
          },
          { label: "Cadastros indicados", value: int(data.users.referred) },
          { label: "Comissão a pagar / em análise", value: formatBRL(data.affiliates.commissionsOpen) },
          { label: "Comissão já paga", value: formatBRL(data.affiliates.commissionsPaid) },
        ]}
      />

      {data.scope !== "vehicle" && <StoreEarnings data={data} back={back} />}
    </>
  );
}

function HeadlineTrend({ trend }: { trend: AdminOverviewTrend }) {
  if (trend.prev30d === 0) return trend.last30d > 0 ? <p className="text-xs opacity-90">novo no período</p> : null;
  const change = Math.round(((trend.last30d - trend.prev30d) / Math.abs(trend.prev30d)) * 100);
  return (
    <p className="text-xs font-semibold opacity-90">
      {change >= 0 ? "▲" : "▼"} {Math.abs(change)}% vs. 30 dias antes
    </p>
  );
}

function RevenueCard({ title, value, trend, lines }: { title: string; value: number; trend: AdminOverviewTrend; lines: string[] }) {
  return (
    <div className="flex flex-col gap-1 rounded-brand-lg border-2 border-brand-green bg-surface-raised p-4">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="font-display text-3xl font-bold text-ink [font-variant-numeric:tabular-nums]">{formatBRL(value)}</p>
      <TrendBadge trend={trend} />
      <ul className="mt-1 flex flex-col gap-0.5 text-xs text-ink-muted">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

function RevenueMonths({ data }: { data: AdminOverview }) {
  const months = [...data.revenue.months].reverse();
  const showStores = data.scope !== "vehicle";
  return (
    <div className="overflow-x-auto rounded-brand-lg border border-border">
      <table className="w-full min-w-[640px] text-left text-sm">
        <caption className="bg-surface-sober px-3 py-2 text-left text-sm font-semibold text-ink">Receita por mês</caption>
        <thead className="bg-surface-sober text-xs uppercase text-ink-muted">
          <tr>
            <th className="px-3 py-2">Mês</th>
            <th className="px-3 py-2 text-right">Planos de anúncio</th>
            <th className="px-3 py-2 text-right">Mensalidades</th>
            <th className="px-3 py-2 text-right">Financiamento</th>
            {showStores && <th className="px-3 py-2 text-right">Lojas (afiliados)</th>}
            <th className="px-3 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="[font-variant-numeric:tabular-nums]">
          {months.map((row) => {
            const total = row.listingPlans + row.subscriptions + row.financing + (showStores ? row.stores : 0);
            return (
              <tr key={row.month} className="border-t border-border">
                <td className="px-3 py-2 font-semibold text-ink">{monthLabel(row.month)}</td>
                <td className="px-3 py-2 text-right">{formatBRL(row.listingPlans)}</td>
                <td className="px-3 py-2 text-right">{formatBRL(row.subscriptions)}</td>
                <td className="px-3 py-2 text-right">{formatBRL(row.financing)}</td>
                {showStores && <td className="px-3 py-2 text-right">{formatBRL(row.stores)}</td>}
                <td className="px-3 py-2 text-right font-bold text-ink">{formatBRL(total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-3 py-2 text-xs text-ink-muted">
        Mensalidades entram a partir desta versão (cada fatura paga no Stripe fica registrada); meses anteriores aparecem zerados.
      </p>
    </div>
  );
}

function OriginsSection({ data }: { data: AdminOverview }) {
  const rows = data.origins;
  const max = Math.max(1, ...rows.map((row) => row.signups + row.leads + row.financingLeads));
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">De onde vêm os cadastros e os leads</h2>
        <p className="text-xs text-ink-muted">
          Últimos 30 dias. Cadastros são do site todo{data.scope !== "all" ? `; leads e pedidos de financiamento são só de ${data.scope === "vehicle" ? "carros" : "imóveis"}` : ""}.
          O rastreio começou nesta versão — o que veio antes aparece como “Não identificado”.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">Nenhum cadastro ou lead nos últimos 30 dias.</p>
      ) : (
        <div className="overflow-x-auto rounded-brand-lg border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-surface-sober text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-3 py-2">Origem</th>
                <th className="px-3 py-2 text-right">Cadastros</th>
                <th className="px-3 py-2 text-right">Leads de lojas</th>
                <th className="px-3 py-2 text-right">Pedidos de financiamento</th>
                <th className="w-1/4 px-3 py-2">Participação</th>
              </tr>
            </thead>
            <tbody className="[font-variant-numeric:tabular-nums]">
              {rows.map((row) => {
                const total = row.signups + row.leads + row.financingLeads;
                return (
                  <tr key={row.key} className="border-t border-border">
                    <td className="px-3 py-2 font-semibold text-ink">{row.label}</td>
                    <td className="px-3 py-2 text-right">{int(row.signups)}</td>
                    <td className="px-3 py-2 text-right">{int(row.leads)}</td>
                    <td className="px-3 py-2 text-right">{int(row.financingLeads)}</td>
                    <td className="px-3 py-2">
                      <div className="h-2 rounded-full bg-surface-sober" title={`${total} no total`}>
                        <div className="h-2 rounded-full bg-brand-blue" style={{ width: `${Math.max(4, (total / max) * 100)}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {data.campaigns.length > 0 && (
        <div className="overflow-x-auto rounded-brand-lg border border-border">
          <table className="w-full min-w-[480px] text-left text-sm">
            <caption className="bg-surface-sober px-3 py-2 text-left text-sm font-semibold text-ink">Campanhas (utm_campaign)</caption>
            <thead className="bg-surface-sober text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-3 py-2">Origem</th>
                <th className="px-3 py-2">Campanha</th>
                <th className="px-3 py-2 text-right">Cadastros</th>
                <th className="px-3 py-2 text-right">Leads</th>
              </tr>
            </thead>
            <tbody className="[font-variant-numeric:tabular-nums]">
              {data.campaigns.map((row) => (
                <tr key={`${row.source}-${row.campaign}`} className="border-t border-border">
                  <td className="px-3 py-2">{row.source}</td>
                  <td className="px-3 py-2 font-semibold text-ink">{row.campaign}</td>
                  <td className="px-3 py-2 text-right">{int(row.signups)}</td>
                  <td className="px-3 py-2 text-right">{int(row.leads)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <details className="rounded-brand-lg bg-surface-sober px-4 py-3 text-sm text-ink">
        <summary className="cursor-pointer font-semibold">Como marcar os links das suas campanhas</summary>
        <p className="mt-2">
          Google, Instagram, Facebook e outros sites são reconhecidos sozinhos. Para separar uma campanha (ex.: post patrocinado, bio, story), use o link
          com <code>utm_source</code> e <code>utm_campaign</code>:
        </p>
        <ul className="mt-2 flex flex-col gap-1 break-all font-mono text-xs">
          <li>novoseminovo.com.br/?utm_source=instagram&amp;utm_campaign=bio</li>
          <li>novoseminovo.com.br/carros?utm_source=instagram&amp;utm_medium=paid&amp;utm_campaign=black_friday</li>
          <li>novoseminovo.com.br/imoveis?utm_source=google&amp;utm_medium=cpc&amp;utm_campaign=imoveis_bh</li>
        </ul>
        <p className="mt-2 text-xs text-ink-muted">
          utm_medium=paid ou cpc marca como anúncio pago (Meta Ads / Google Ads). Links de afiliado (?ref=CODIGO) já contam como “Afiliados”.
        </p>
      </details>
    </section>
  );
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function StoreEarnings({ data, back }: { data: AdminOverview; back: string }) {
  return (
    <section id="lojas" className="flex scroll-mt-24 flex-col gap-3">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">Receita das lojas parceiras (links de afiliados)</h2>
        <p className="text-xs text-ink-muted">
          Amazon e Mercado Livre não avisam o site quando pagam a comissão. Lance aqui o valor do mês que aparece no painel de cada programa — lançar de novo o
          mesmo mês e loja substitui o valor.
        </p>
      </div>
      <form action={saveStoreEarningAction} className="grid grid-cols-2 items-end gap-3 rounded-brand-lg border border-border bg-surface-raised p-4 md:grid-cols-5">
        <input type="hidden" name="back" value={back} />
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
          Mês
          <input type="month" name="month" required defaultValue={currentMonth()} className="rounded-brand border border-border bg-surface-page px-3 py-2 text-sm font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
          Loja
          <select name="store" required className="rounded-brand border border-border bg-surface-page px-3 py-2 text-sm font-normal">
            {Object.entries(STORE_EARNING_STORES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
          Valor (R$)
          <input name="amount" required inputMode="decimal" placeholder="0,00" className="rounded-brand border border-border bg-surface-page px-3 py-2 text-sm font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
          Observação
          <input name="note" placeholder="opcional" className="rounded-brand border border-border bg-surface-page px-3 py-2 text-sm font-normal" />
        </label>
        <Button type="submit" variant="primary" className="col-span-2 justify-center md:col-span-1">
          Lançar
        </Button>
      </form>
      {data.revenue.storeEntries.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-brand-lg border border-border bg-surface-raised">
          {data.revenue.storeEntries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
              <span>
                <strong className="text-ink">{monthLabel(entry.month)}</strong> · {STORE_EARNING_STORES[entry.store as keyof typeof STORE_EARNING_STORES] ?? entry.store}
                {entry.note && <span className="text-ink-muted"> · {entry.note}</span>}
              </span>
              <span className="flex items-center gap-3">
                <strong className="[font-variant-numeric:tabular-nums]">{formatBRL(entry.amount)}</strong>
                <form action={deleteStoreEarningAction.bind(null, entry.id, back)}>
                  <button type="submit" className="text-xs font-semibold text-status-danger hover:underline">
                    Apagar
                  </button>
                </form>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

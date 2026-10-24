import Link from "next/link";
import { redirect } from "next/navigation";
import { PARTNER_TYPE_LABELS, formatBRL, type AdminOverview, type AdminOverviewDay, type AdminOverviewTrend } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { fetchAdminOverview } from "@/lib/api";

export const dynamic = "force-dynamic";

const int = (value: number) => value.toLocaleString("pt-BR");

type Tile = { label: string; value: string; hint?: string; trend?: AdminOverviewTrend; money?: boolean };

// Variação contra os 30 dias anteriores; sem base de comparação, não mostra %.
function TrendBadge({ trend }: { trend: AdminOverviewTrend }) {
  if (trend.prev30d === 0) {
    return trend.last30d > 0 ? <span className="text-xs font-semibold text-ink-muted">novo no período</span> : null;
  }
  const change = Math.round(((trend.last30d - trend.prev30d) / trend.prev30d) * 100);
  const up = change >= 0;
  return (
    <span className={`text-xs font-semibold ${up ? "text-brand-green" : "text-status-danger"}`}>
      {up ? "▲" : "▼"} {Math.abs(change)}% <span className="font-normal text-ink-muted">vs. 30 dias antes</span>
    </span>
  );
}

function TileGrid({ title, tiles }: { title: string; tiles: Tile[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
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
          <div key={day.day} className="group relative flex h-full flex-1 flex-col justify-end" title={`${shortDate(day.day)}: ${day[field]}`}>
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

export default async function AdminOverviewPage() {
  const session = await auth();
  if (!session?.user) redirect("/entrar");
  if (session.user.role !== "admin") redirect("/admin");

  const data = await fetchAdminOverview(session.accessToken);
  if (!data) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="font-display text-2xl font-semibold text-ink">Painel geral</h1>
        <p className="mt-2 text-sm text-status-danger">Não foi possível carregar os números agora. Tente de novo em instantes.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12">
      <header>
        <Link href="/admin" className="text-sm font-semibold text-brand-blue hover:underline">
          ← Moderação
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Painel geral</h1>
        <p className="text-sm text-ink-muted">
          Os grandes números do NovoSeminovo num lugar só. Tendências comparam os últimos 30 dias com os 30 dias anteriores. Atualizado em{" "}
          {new Date(data.generatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.
        </p>
      </header>

      <Headline data={data} />

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-ink">Últimos 30 dias, dia a dia</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DailyChart title="Novos cadastros" days={data.daily} field="users" />
          <DailyChart title="Anúncios criados" days={data.daily} field="listings" />
          <DailyChart title="Leads" days={data.daily} field="leads" />
          <DailyChart title="Mensagens no chat" days={data.daily} field="messages" />
        </div>
      </section>

      <TileGrid
        title="Anúncios"
        tiles={[
          { label: "Ativos", value: int(data.listings.active), hint: `${int(data.listings.activeVehicles)} carros · ${int(data.listings.activeProperties)} imóveis` },
          { label: "Criados (30 dias)", value: int(data.listings.created.last30d), trend: data.listings.created },
          { label: "Vendidos (30 dias)", value: int(data.listings.sold.last30d), trend: data.listings.sold, hint: data.listings.soldValue30d ? `${formatBRL(data.listings.soldValue30d)} em vendas` : undefined },
          { label: "Visualizações (total)", value: int(data.listings.views) },
          { label: "Esperando análise", value: int(data.listings.pendingReview), hint: "fila da moderação" },
          { label: "Pausados", value: int(data.listings.paused) },
          { label: "Recusados", value: int(data.listings.rejected) },
          { label: "Expirados", value: int(data.listings.expired) },
          { label: "Preço médio — carros ativos", value: data.listings.avgActivePrice.vehicle ? formatBRL(data.listings.avgActivePrice.vehicle) : "—" },
          { label: "Preço médio — imóveis ativos", value: data.listings.avgActivePrice.property ? formatBRL(data.listings.avgActivePrice.property) : "—" },
        ]}
      />

      <TileGrid
        title="Pessoas e parceiros"
        tiles={[
          { label: "Usuários cadastrados", value: int(data.users.total) },
          { label: "Novos usuários (30 dias)", value: int(data.users.newUsers.last30d), trend: data.users.newUsers },
          { label: "Pessoas que já anunciaram", value: int(data.users.sellers) },
          { label: "Lojas e imobiliárias", value: int(data.partners.total), hint: `${int(data.partners.verified)} verificadas` },
          ...data.partners.byType.map((row) => ({ label: PARTNER_TYPE_LABELS[row.type] ?? row.type, value: int(row.count) })),
        ]}
      />

      <TileGrid
        title="Receita"
        tiles={[
          { label: "Receita mensal (MRR)", value: formatBRL(data.revenue.mrr), hint: `${int(data.revenue.payingSubscriptions)} assinaturas pagas` },
          { label: "Assinaturas em atraso", value: int(data.revenue.pastDue) },
          { label: "Planos de anúncio (30 dias)", value: formatBRL(data.revenue.listingPlans.last30d), trend: data.revenue.listingPlans, hint: `${int(data.revenue.listingPlansCount30d)} compras` },
          { label: "Planos de anúncio (total)", value: formatBRL(data.revenue.listingPlansTotal) },
        ]}
      />

      <TileGrid
        title="Negociação"
        tiles={[
          { label: "Leads (30 dias)", value: int(data.engagement.leads.last30d), trend: data.engagement.leads, hint: `${int(data.engagement.leadsWon30d)} ganhos no período` },
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
          { label: "Conversas com assistentes (30 dias)", value: int(data.ai.agentConversations.last30d), trend: data.ai.agentConversations },
          { label: "Interessados em financiamento (30 dias)", value: int(data.ai.financingLeads.last30d), trend: data.ai.financingLeads, hint: `${int(data.ai.financingLeadsConverted)} convertidos no total` },
          { label: "Projetos do Arquiteto (30 dias)", value: int(data.ai.architectSessions.last30d), trend: data.ai.architectSessions, hint: `${int(data.ai.architectImages30d)} imagens geradas` },
          { label: "Cliques em lojas parceiras (30 dias)", value: int(data.ai.storeClicks30d), hint: "Amazon, Mercado Livre…" },
          { label: "Decisões da moderação automática (30 dias)", value: int(data.ai.autoModerated30d) },
        ]}
      />

      <TileGrid
        title="Afiliados"
        tiles={[
          { label: "Afiliados ativos", value: int(data.affiliates.active), hint: data.affiliates.pending ? `${int(data.affiliates.pending)} esperando aprovação` : undefined },
          { label: "Cadastros indicados", value: int(data.users.referred) },
          { label: "Comissão a pagar / em análise", value: formatBRL(data.affiliates.commissionsOpen) },
          { label: "Comissão já paga", value: formatBRL(data.affiliates.commissionsPaid) },
        ]}
      />
    </main>
  );
}

// Faixa de destaque: os 4 números que respondem "como está o site?".
function Headline({ data }: { data: AdminOverview }) {
  const items: Tile[] = [
    { label: "Anúncios ativos", value: int(data.listings.active) },
    { label: "Usuários", value: int(data.users.total), trend: data.users.newUsers, hint: `+${int(data.users.newUsers.last30d)} em 30 dias` },
    { label: "Receita mensal (MRR)", value: formatBRL(data.revenue.mrr) },
    { label: "Leads em 30 dias", value: int(data.engagement.leads.last30d), trend: data.engagement.leads },
  ];
  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Destaques">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-1 rounded-brand-lg bg-brand-blue p-5 text-on-blue">
          <p className="text-sm font-semibold opacity-90">{item.label}</p>
          <p className="font-display text-3xl font-bold [font-variant-numeric:tabular-nums] sm:text-4xl">{item.value}</p>
          {item.hint && <p className="text-xs opacity-90">{item.hint}</p>}
        </div>
      ))}
    </section>
  );
}

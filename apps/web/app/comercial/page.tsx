import Link from "next/link";
import { SALES_STAGES, type SalesCard, type SalesSegment } from "@novoseminovo/shared-types";
import { fetchSalesBoard, fetchSalesGoals, fetchSalesMe } from "@/lib/api";
import { quickMoveAction } from "@/lib/actions/sales";
import { QuickMove } from "@/components/sales/QuickMove";
import { Flash, SalesDenied, money, salesSession } from "@/components/sales/SalesAccess";
import { SITE_URL } from "@/lib/company";

export const dynamic = "force-dynamic";

const TABS: { key: string; label: string; segment?: SalesSegment }[] = [
  { key: "veiculos", label: "Veículos", segment: "vehicle" },
  { key: "imoveis", label: "Imóveis", segment: "property" },
  { key: "todos", label: "Consolidado" },
];
const SEGMENT_LABEL: Record<SalesSegment, string> = { vehicle: "Veículos", property: "Imóveis" };
const STATUS_LABEL: Record<string, string> = { active: "Em dia", past_due: "Pagamento atrasado", canceled: "Cancelada" };

function dateLabel(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default async function SalesBoardPage({ searchParams }: { searchParams: { aba?: string; meus?: string; sucesso?: string; erro?: string } }) {
  const { allowed, token } = await salesSession("/comercial");
  if (!allowed) return <SalesDenied />;

  const tab = TABS.find((t) => t.key === searchParams.aba) ?? TABS[0]!;
  const mine = searchParams.meus === "1";
  const [board, goals, me] = await Promise.all([fetchSalesBoard({ segment: tab.segment, mine }, token), fetchSalesGoals(token), fetchSalesMe(token)]);
  const cards = board?.cards ?? [];
  const query = (next: { aba?: string; meus?: boolean }) => {
    const params = new URLSearchParams({ aba: next.aba ?? tab.key });
    if (next.meus ?? mine) params.set("meus", "1");
    return `/comercial?${params}`;
  };
  const returnTo = query({});
  const link = me?.salesCode ? `${SITE_URL}/para-lojas?vendedor=${me.salesCode}` : undefined;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Comercial</h1>
          <p className="text-sm text-ink-muted">Funil das empresas: até o cadastro você move o card; depois o site move sozinho.</p>
        </div>
        <Link href="/comercial/novo" className="rounded-brand bg-brand-green px-4 py-2 text-sm font-bold text-on-green hover:opacity-90">
          + Nova empresa
        </Link>
      </div>

      <Flash sucesso={searchParams.sucesso} erro={searchParams.erro} />

      <section aria-label="Metas do mês" className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-ink">Metas do mês</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Goal label="Abordagens" value={goals?.approaches} hint="meta: 20 por semana" />
          <Goal label="Cadastros" value={goals?.signups} hint="da sua carteira" />
          <Goal label="Novas assinaturas" value={goals?.newSubscribers} />
          <Goal label="Assinantes ativos" value={goals?.activeSubscribers} />
          <Goal label="Mensalidades (MRR)" text={money(goals?.mrr)} />
        </div>
        {link && (
          <p className="rounded-brand border border-border bg-surface-raised px-4 py-3 text-sm text-ink">
            Seu link de indicação: <span className="select-all break-all font-semibold">{link}</span>
            <span className="block text-xs text-ink-muted">Empresa que se cadastrar por ele entra na sua carteira.</span>
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={query({ aba: t.key })}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${t.key === tab.key ? "bg-brand-blue text-on-blue" : "bg-surface-sober text-ink hover:opacity-80"}`}
          >
            {t.label}
          </Link>
        ))}
        <Link href={query({ meus: !mine })} className="ml-auto text-sm font-semibold text-brand-blue hover:underline">
          {mine ? "Ver todos os cards" : "Só os meus"}
        </Link>
      </div>

      {!board ? (
        <p className="text-sm text-status-danger">Não foi possível carregar o quadro.</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4" aria-label="Quadro comercial">
          {SALES_STAGES.map((stage) => {
            const column = cards.filter((c) => c.stage === stage.id);
            return (
              <section key={stage.id} className="flex w-64 shrink-0 flex-col gap-2 rounded-brand-lg bg-surface-sober p-3">
                <h3 className="text-sm font-bold text-ink">
                  {stage.label} <span className="font-normal text-ink-muted">({column.length})</span>
                </h3>
                {!stage.manual && <p className="text-[11px] text-ink-muted">Anda sozinho pelo site</p>}
                {column.map((card) => (
                  <Card key={card.id} card={card} showSegment={!tab.segment} moveAction={quickMoveAction.bind(null, card.id, returnTo)} />
                ))}
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

function Goal({ label, value, text, hint }: { label: string; value?: number; text?: string; hint?: string }) {
  return (
    <div className="rounded-brand-lg border border-border bg-surface-raised p-4">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="font-display text-2xl font-semibold text-ink [font-variant-numeric:tabular-nums]">{text ?? (value ?? 0).toLocaleString("pt-BR")}</p>
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

function Card({ card, showSegment, moveAction }: { card: SalesCard; showSegment: boolean; moveAction: (formData: FormData) => void }) {
  const overdue = card.nextContactAt && new Date(card.nextContactAt) < new Date();
  return (
    <article className="flex flex-col gap-1.5 rounded-brand border border-border bg-surface-raised p-3 text-xs">
      <Link href={`/comercial/${card.id}`} className="text-sm font-semibold text-ink hover:text-brand-blue hover:underline">
        {card.name}
      </Link>
      <p className="text-ink-muted">
        {[card.city, card.state].filter(Boolean).join(" - ") || "Cidade não informada"}
        {showSegment ? ` · ${SEGMENT_LABEL[card.segment]}` : ""}
      </p>
      <p className="text-ink-muted">{card.ownerName ? `Dono: ${card.ownerName}` : "Sem dono"}{card.source === "link" ? " · veio pelo link" : ""}</p>
      {card.nextContactAt && (
        <p className={overdue ? "font-semibold text-status-danger" : "text-ink"}>Próximo contato: {dateLabel(card.nextContactAt)}</p>
      )}
      {card.trialDaysLeft !== undefined && <p className="text-ink">Período grátis: {card.trialDaysLeft} dia(s)</p>}
      {card.planName && (
        <p className="text-ink">
          {card.planName} · {money(card.monthlyValue)} · {STATUS_LABEL[card.subscriptionStatus ?? ""] ?? ""}
        </p>
      )}
      {card.activeListings !== undefined && <p className="text-ink-muted">{card.activeListings} anúncio(s) no ar</p>}
      {!card.partnerId && <QuickMove action={moveAction} stage={card.stage} />}
    </article>
  );
}

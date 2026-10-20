import Link from "next/link";
import { redirect } from "next/navigation";
import type { FinancingLeadSummary } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { FinancingKanban, type KanbanColumn } from "@/components/FinancingKanban";
import { fetchFinancingLeads } from "@/lib/api";

// Etapas do funil do correspondente bancário. Avaliação do imóvel
// (engenharia do banco) só existe no imobiliário. "converted" = Concluído.
const PROPERTY_COLUMNS: KanbanColumn[] = [
  { status: "new", label: "Novo", tone: "bg-brand-orange" },
  { status: "contacted", label: "Contato feito", tone: "bg-brand-blue" },
  { status: "documents", label: "Documentação", tone: "bg-brand-blue" },
  { status: "credit_analysis", label: "Análise de crédito", tone: "bg-brand-purple" },
  { status: "approved", label: "Aprovado", tone: "bg-brand-purple" },
  { status: "property_appraisal", label: "Avaliação do imóvel", tone: "bg-brand-pink" },
  { status: "contract", label: "Contrato", tone: "bg-brand-pink" },
  { status: "converted", label: "Concluído", tone: "bg-brand-green" },
  { status: "lost", label: "Perdido", tone: "bg-ink-muted" },
];
const VEHICLE_COLUMNS = PROPERTY_COLUMNS.filter((column) => column.status !== "property_appraisal");

const TABS = {
  imobiliario: { label: "Financiamento imobiliário", assetType: "property", columns: PROPERTY_COLUMNS },
  veicular: { label: "Financiamento veicular", assetType: "vehicle", columns: VEHICLE_COLUMNS },
} as const;

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-brand bg-surface-raised p-4 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-1 text-xl font-extrabold text-ink [font-variant-numeric:tabular-nums]">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

function summarize(leads: FinancingLeadSummary[]) {
  const open = leads.filter((lead) => lead.status !== "converted" && lead.status !== "lost");
  const done = leads.filter((lead) => lead.status === "converted");
  const sumCommission = (list: FinancingLeadSummary[]) => list.reduce((total, lead) => total + (lead.commissionAmount ?? 0), 0);
  const sumNegotiated = (list: FinancingLeadSummary[]) =>
    list.reduce((total, lead) => total + (lead.negotiatedValue ?? 0), 0);
  const decided = done.length + leads.filter((lead) => lead.status === "lost").length;
  return {
    openCount: open.length,
    openNegotiated: sumNegotiated(open),
    openCommission: sumCommission(open),
    doneCount: done.length,
    doneNegotiated: sumNegotiated(done),
    doneCommission: sumCommission(done),
    conversion: decided > 0 ? Math.round((done.length / decided) * 100) : undefined,
  };
}

export default async function AdminFinancingLeadsPage({ searchParams }: { searchParams: { tipo?: string } }) {
  const session = await auth();
  if (!session?.user) redirect("/entrar");
  if (session.user.role !== "admin") {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <h1 className="font-display text-2xl font-semibold text-ink">Acesso restrito</h1>
        <p className="mt-2 text-sm text-ink-muted">Esta área é só para administradores da plataforma.</p>
      </main>
    );
  }

  const tabKey = searchParams.tipo === "veicular" ? "veicular" : "imobiliario";
  const tab = TABS[tabKey];
  const [propertyLeads, vehicleLeads] = await Promise.all([
    fetchFinancingLeads({ assetType: "property" }, session.accessToken),
    fetchFinancingLeads({ assetType: "vehicle" }, session.accessToken),
  ]);
  const leads = tab.assetType === "property" ? propertyLeads : vehicleLeads;
  const openBy = (list: FinancingLeadSummary[]) => list.filter((lead) => lead.status !== "converted" && lead.status !== "lost").length;
  const stats = summarize(leads);

  return (
    <main className="mx-auto max-w-7xl px-4 py-12">
      <Link href="/admin" className="text-sm font-semibold text-brand-blue hover:underline">
        ← Moderação
      </Link>
      <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Funil de financiamentos</h1>
      <p className="text-sm text-ink-muted">
        Interessados captados pelo assistente de IA (site e WhatsApp). Arraste o card entre as etapas, preencha o valor
        negociado e a comissão é calculada sozinha. Concluiu? Registre o negócio em{" "}
        <Link href="/admin/recompensas" className="font-semibold text-brand-blue hover:underline">
          Recompensas
        </Link>{" "}
        para pagar a parte do anunciante.
      </p>

      <nav className="mt-6 inline-flex flex-wrap gap-1 rounded-full bg-surface-sober p-1" aria-label="Tipo de financiamento">
        {(Object.keys(TABS) as (keyof typeof TABS)[]).map((key) => (
          <Link
            key={key}
            href={`/admin/financiamentos?tipo=${key}`}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              key === tabKey ? "bg-brand-green text-on-green" : "text-ink"
            }`}
          >
            {TABS[key].label}{" "}
            <span className="opacity-80">({openBy(key === "imobiliario" ? propertyLeads : vehicleLeads)})</span>
          </Link>
        ))}
      </nav>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Em negociação"
          value={String(stats.openCount)}
          hint={stats.openNegotiated > 0 ? `${brl(stats.openNegotiated)} negociado` : "sem valor negociado ainda"}
        />
        <Stat label="Comissão prevista" value={brl(stats.openCommission)} hint="das negociações em aberto" />
        <Stat
          label="Comissão realizada"
          value={brl(stats.doneCommission)}
          hint={`${stats.doneCount} concluído(s)${stats.doneNegotiated > 0 ? ` · ${brl(stats.doneNegotiated)} financiado` : ""}`}
        />
        <Stat
          label="Conversão"
          value={stats.conversion === undefined ? "—" : `${stats.conversion}%`}
          hint="concluídos ÷ (concluídos + perdidos)"
        />
      </div>

      <div className="mt-6">
        {leads.length === 0 ? (
          <p className="rounded-brand border border-dashed border-border px-4 py-8 text-center text-sm text-ink-muted">
            Nenhum interessado em {tabKey === "imobiliario" ? "financiamento imobiliário" : "financiamento veicular"} ainda.
            Eles aparecem aqui assim que alguém pede contato pelo assistente.
          </p>
        ) : (
          <FinancingKanban key={tabKey} leads={leads} columns={tab.columns} />
        )}
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        ≈ = comissão estimada pelo valor do bem informado pelo comprador (menos a entrada), até você preencher o valor
        negociado. O número no canto do card mostra há quantos dias ele está na etapa — em vermelho a partir de 3 dias.
      </p>
    </main>
  );
}

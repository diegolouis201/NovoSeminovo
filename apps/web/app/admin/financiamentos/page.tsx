import Link from "next/link";
import { redirect } from "next/navigation";
import { WhatsappLogo } from "@phosphor-icons/react/dist/ssr";
import type { FinancingLeadStatus, FinancingLeadSummary } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { fetchFinancingLeads } from "@/lib/api";
import { updateFinancingLeadStatusAction } from "@/lib/actions/agents";

const STATUS_LABEL: Record<FinancingLeadStatus, string> = {
  new: "Novo",
  contacted: "Em contato",
  converted: "Financiamento fechado",
  lost: "Perdido",
};

const STATUS_TONE: Record<FinancingLeadStatus, string> = {
  new: "bg-brand-orange text-on-orange",
  contacted: "bg-brand-blue text-on-blue",
  converted: "bg-brand-green text-on-green",
  lost: "bg-surface-sober text-ink-muted",
};

const FILTERS: { value?: FinancingLeadStatus; label: string }[] = [
  { label: "Todos" },
  { value: "new", label: "Novos" },
  { value: "contacted", label: "Em contato" },
  { value: "converted", label: "Fechados" },
  { value: "lost", label: "Perdidos" },
];

function whatsappLink(lead: FinancingLeadSummary): string {
  const digits = lead.phone.startsWith("55") ? lead.phone : `55${lead.phone}`;
  const text = `Olá, ${lead.name.split(" ")[0]}! Aqui é do NovoSeminovo, sobre o financiamento que você pediu pelo nosso assistente.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function formatPhone(phone: string): string {
  const local = phone.startsWith("55") && phone.length > 11 ? phone.slice(2) : phone;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return phone;
}

export default async function AdminFinancingLeadsPage({ searchParams }: { searchParams: { status?: string } }) {
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

  const status = FILTERS.find((filter) => filter.value === searchParams.status)?.value;
  const leads = await fetchFinancingLeads(status, session.accessToken);

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <Link href="/admin" className="text-sm font-semibold text-brand-blue hover:underline">
        ← Moderação
      </Link>
      <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Interessados em financiamento</h1>
      <p className="text-sm text-ink-muted">
        Pessoas que pediram contato de um especialista pelo assistente de IA (chat do site ou WhatsApp). Chame no
        WhatsApp, atualize o andamento e, quando o financiamento fechar, registre o negócio em{" "}
        <Link href="/admin/recompensas" className="font-semibold text-brand-blue hover:underline">
          Recompensas
        </Link>
        .
      </p>

      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Filtrar por andamento">
        {FILTERS.map((filter) => {
          const active = filter.value === status;
          return (
            <Link
              key={filter.label}
              href={filter.value ? `/admin/financiamentos?status=${filter.value}` : "/admin/financiamentos"}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                active ? "bg-ink text-surface-page" : "border border-border text-ink hover:bg-surface-sober"
              }`}
            >
              {filter.label}
            </Link>
          );
        })}
      </nav>

      {leads.length === 0 ? (
        <p className="mt-8 rounded-brand border border-dashed border-border px-4 py-8 text-center text-sm text-ink-muted">
          Nenhum interessado {status ? `com andamento "${STATUS_LABEL[status]}"` : "ainda"}. Eles aparecem aqui assim que
          alguém pede contato pelo assistente.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-4">
          {leads.map((lead) => (
            <li key={lead.id} className="rounded-brand bg-surface-raised p-4 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-bold text-ink">{lead.name}</p>
                  <p className="text-sm text-ink-muted [font-variant-numeric:tabular-nums]">
                    {formatPhone(lead.phone)}
                    {lead.email ? ` · ${lead.email}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {new Date(lead.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} ·{" "}
                    {lead.channel === "whatsapp" ? "WhatsApp" : "Chat do site"} ·{" "}
                    {lead.assetType === "property" ? "Imóvel" : "Veículo"}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_TONE[lead.status]}`}>
                  {STATUS_LABEL[lead.status]}
                </span>
              </div>

              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                {lead.assetValueLabel && (
                  <div>
                    <dt className="text-xs text-ink-muted">Valor do bem</dt>
                    <dd className="font-semibold text-ink">{lead.assetValueLabel}</dd>
                  </div>
                )}
                {lead.downPaymentLabel && (
                  <div>
                    <dt className="text-xs text-ink-muted">Entrada</dt>
                    <dd className="font-semibold text-ink">{lead.downPaymentLabel}</dd>
                  </div>
                )}
                {lead.monthlyIncomeLabel && (
                  <div>
                    <dt className="text-xs text-ink-muted">Renda mensal</dt>
                    <dd className="font-semibold text-ink">{lead.monthlyIncomeLabel}</dd>
                  </div>
                )}
              </dl>
              {lead.listingId && (
                <p className="mt-2 text-sm">
                  <span className="text-ink-muted">Anúncio: </span>
                  <Link href={`/anuncio/${lead.listingId}`} className="font-semibold text-brand-blue hover:underline">
                    {lead.listingTitle ?? "ver anúncio"}
                  </Link>
                </p>
              )}
              {lead.notes && <p className="mt-2 text-sm text-ink">{lead.notes}</p>}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <a
                  href={whatsappLink(lead)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-brand bg-brand-green px-4 py-2 text-sm font-bold text-on-green hover:opacity-90"
                >
                  <WhatsappLogo size={18} weight="fill" />
                  Chamar no WhatsApp
                </a>
                <form action={updateFinancingLeadStatusAction} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={lead.id} />
                  <label htmlFor={`status-${lead.id}`} className="text-xs text-ink-muted">
                    Andamento
                  </label>
                  <select
                    id={`status-${lead.id}`}
                    name="status"
                    defaultValue={lead.status}
                    className="rounded-brand border border-border bg-surface-page px-2 py-1.5 text-sm text-ink"
                  >
                    {(Object.keys(STATUS_LABEL) as FinancingLeadStatus[]).map((value) => (
                      <option key={value} value={value}>
                        {STATUS_LABEL[value]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="rounded-brand border border-border px-3 py-1.5 text-sm font-semibold text-ink hover:bg-surface-sober"
                  >
                    Salvar
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

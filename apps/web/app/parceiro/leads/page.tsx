import { redirect } from "next/navigation";
import type { LeadSource, LeadStatus, LeadSummary } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { PartnerNav } from "@/components/PartnerNav";
import { fetchMyPartner, fetchPartnerLeads } from "@/lib/api";
import { updateLeadStatusAction } from "@/lib/actions/partners";

const COLUMNS: { status: LeadStatus; label: string }[] = [
  { status: "new", label: "Novo" },
  { status: "negotiating", label: "Negociando" },
  { status: "won", label: "Ganho" },
  { status: "lost", label: "Perdido" },
];

const SOURCE_LABEL: Record<LeadSource, string> = {
  chat: "💬 Chat",
  whatsapp: "📱 WhatsApp",
  phone: "☎️ Telefone",
};

export default async function PartnerLeadsPage() {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const partner = await fetchMyPartner(session.accessToken);
  if (!partner) redirect("/parceiro");

  const leads = await fetchPartnerLeads(session.accessToken);

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="font-display text-2xl font-semibold text-ink">{partner.legalName}</h1>
      <div className="mt-6">
        <PartnerNav active="leads" />
      </div>

      <h2 className="mt-6 font-display text-xl font-semibold text-ink">Leads</h2>
      <p className="text-sm text-ink-muted">
        Toda conversa ou clique em "Chamar no WhatsApp" num anúncio da sua loja vira um lead aqui — mova
        o status conforme a negociação avança.
      </p>

      {leads.length === 0 ? (
        <p className="mt-6 text-ink-muted">Nenhum lead ainda. Assim que alguém conversar sobre um anúncio seu, ele aparece aqui.</p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {COLUMNS.map((column) => {
            const columnLeads = leads.filter((lead) => lead.status === column.status);
            return (
              <div key={column.status} className="flex flex-col gap-3 rounded-brand bg-surface-sober p-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-sm font-bold text-ink">{column.label}</h3>
                  <span className="text-xs font-bold text-ink-muted">{columnLeads.length}</span>
                </div>
                {columnLeads.map((lead) => (
                  <LeadCard key={lead.id} lead={lead} />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

function LeadCard({ lead }: { lead: LeadSummary }) {
  const action = updateLeadStatusAction.bind(null, lead.id);

  return (
    <div className="flex flex-col gap-2 rounded-brand border border-border bg-surface-raised p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">{lead.buyerName}</p>
        <span className="whitespace-nowrap text-xs text-ink-muted">{SOURCE_LABEL[lead.source]}</span>
      </div>
      <p className="truncate text-xs text-ink-muted">{lead.listingTitle}</p>
      <p className="text-xs text-ink-muted">{lead.buyerEmail}</p>
      <form action={action} className="mt-1 flex items-center gap-2">
        <select
          name="status"
          defaultValue={lead.status}
          className="flex-1 rounded-brand border border-border bg-surface-page px-2 py-1 text-xs text-ink"
        >
          {COLUMNS.map((column) => (
            <option key={column.status} value={column.status}>
              {column.label}
            </option>
          ))}
        </select>
        <Button type="submit" variant="ghost" className="px-2 py-1 text-xs">
          Mover
        </Button>
      </form>
    </div>
  );
}

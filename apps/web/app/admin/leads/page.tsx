import Link from "next/link";
import { redirect } from "next/navigation";
import { LEAD_SOURCE_LABELS, LEAD_STATUS_LABELS, formatBRL, type AdminLeadRow } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { fetchAdminLeads } from "@/lib/api";

export const dynamic = "force-dynamic";

type Params = { periodo?: string; etapa?: string; origem?: string; tipo?: string; busca?: string; pagina?: string };
type Key = keyof Params;

const PERIODS = [
  { key: "7", label: "7 dias" },
  { key: "30", label: "30 dias" },
  { key: "90", label: "90 dias" },
  { key: "", label: "Tudo" },
] as const;
const TYPES = [
  { key: "", label: "Carros e imóveis" },
  { key: "vehicle", label: "Carros" },
  { key: "property", label: "Imóveis" },
] as const;
const STAGES = ["new", "contacted", "visit_scheduled", "negotiating", "won", "lost"] as const;
const STAGE_TONE: Record<AdminLeadRow["status"], string> = {
  new: "bg-brand-orange",
  contacted: "bg-brand-blue",
  visit_scheduled: "bg-brand-purple",
  negotiating: "bg-brand-pink",
  won: "bg-brand-green",
  lost: "bg-ink-muted",
};

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const local = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return phone;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

export default async function AdminLeadsPageView({ searchParams }: { searchParams: Params }) {
  const session = await auth();
  if (!session?.user) redirect("/entrar");
  if (session.user.role !== "admin") redirect("/conta");

  const current: Required<Params> = {
    periodo: ["7", "30", "90"].includes(searchParams.periodo ?? "") ? searchParams.periodo! : searchParams.periodo === "" ? "" : "30",
    etapa: searchParams.etapa ?? "",
    origem: searchParams.origem ?? "",
    tipo: searchParams.tipo === "vehicle" || searchParams.tipo === "property" ? searchParams.tipo : "",
    busca: searchParams.busca ?? "",
    pagina: String(Math.max(1, Number(searchParams.pagina) || 1)),
  };
  const data = await fetchAdminLeads(current, session.accessToken);

  const href = (changes: Partial<Record<Key, string>>) => {
    const next = { ...current, pagina: "1", ...changes };
    const query = new URLSearchParams(
      Object.entries(next).filter(([key, value]) => (key === "periodo" ? true : value && !(key === "pagina" && value === "1"))),
    );
    return `/admin/leads?${query}`;
  };
  const pill = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-semibold ${active ? "bg-brand-blue text-on-blue" : "border border-border text-ink hover:bg-surface-sober"}`;

  const funnelTotal = data ? Object.values(data.funnel).reduce((sum, value) => sum + value, 0) : 0;
  const attended = data ? funnelTotal - data.funnel.new : 0;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-12">
      <header>
        <Link href="/admin" className="text-sm font-semibold text-brand-blue hover:underline">
          ← Moderação
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Todos os leads</h1>
        <p className="text-sm text-ink-muted">
          Cada contato gerado no site (chat, WhatsApp e os cadastrados pelas lojas): quando chegou, de quem, para qual loja ou
          imobiliária foi e em que etapa do funil está.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((period) => (
          <Link key={period.key} href={href({ periodo: period.key })} className={pill(current.periodo === period.key)}>
            {period.label}
          </Link>
        ))}
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        {TYPES.map((type) => (
          <Link key={type.key} href={href({ tipo: type.key })} className={pill(current.tipo === type.key)}>
            {type.label}
          </Link>
        ))}
        <form action="/admin/leads" className="ml-auto flex gap-2">
          {(["periodo", "etapa", "origem", "tipo"] as const).map((key) => (
            <input key={key} type="hidden" name={key} value={current[key]} />
          ))}
          <input
            name="busca"
            defaultValue={current.busca}
            placeholder="Loja, comprador ou anúncio"
            className="w-56 rounded-brand border border-border bg-surface-page px-3 py-1.5 text-sm text-ink"
          />
          <button type="submit" className="rounded-brand bg-brand-blue px-3 py-1.5 text-sm font-bold text-on-blue">
            Buscar
          </button>
        </form>
      </div>

      {!data ? (
        <p className="rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">Não foi possível carregar os leads agora.</p>
      ) : (
        <>
          <section aria-label="Funil" className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            <Link href={href({ etapa: "" })} className={`rounded-brand p-3 ${current.etapa === "" ? "ring-2 ring-brand-blue" : ""} bg-surface-raised shadow-card`}>
              <p className="text-xs text-ink-muted">Leads</p>
              <p className="font-display text-2xl font-semibold text-ink [font-variant-numeric:tabular-nums]">{funnelTotal}</p>
            </Link>
            {STAGES.map((stage) => (
              <Link
                key={stage}
                href={href({ etapa: stage })}
                className={`rounded-brand bg-surface-raised p-3 shadow-card ${current.etapa === stage ? "ring-2 ring-brand-blue" : ""}`}
              >
                <p className="flex items-center gap-1.5 text-xs text-ink-muted">
                  <span className={`h-2 w-2 rounded-full ${STAGE_TONE[stage]}`} aria-hidden /> {LEAD_STATUS_LABELS[stage]}
                </p>
                <p className="font-display text-2xl font-semibold text-ink [font-variant-numeric:tabular-nums]">{data.funnel[stage]}</p>
              </Link>
            ))}
            <div className="rounded-brand bg-surface-raised p-3 shadow-card">
              <p className="text-xs text-ink-muted">Atendidos</p>
              <p className="font-display text-2xl font-semibold text-ink [font-variant-numeric:tabular-nums]">
                {funnelTotal ? Math.round((attended / funnelTotal) * 100) : 0}%
              </p>
            </div>
          </section>

          {data.waitingOver24h > 0 && (
            <p className="rounded-brand bg-brand-orange/10 px-4 py-2 text-sm text-ink">
              <strong>{data.waitingOver24h}</strong> {data.waitingOver24h === 1 ? "lead está" : "leads estão"} em &quot;Novo&quot; há mais de 24
              horas — ninguém da loja atendeu ainda.{" "}
              <Link href={href({ etapa: "new" })} className="font-semibold text-brand-blue hover:underline">
                Ver
              </Link>
            </p>
          )}

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="text-ink-muted">Origem:</span>
            {[["", "Todas"], ...Object.entries(LEAD_SOURCE_LABELS)].map(([key, label]) => (
              <Link key={key} href={href({ origem: key })} className={pill(current.origem === key)}>
                {label}
              </Link>
            ))}
          </div>

          <div className="overflow-x-auto rounded-brand border border-border">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-surface-sober text-xs text-ink-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">Chegou</th>
                  <th className="px-3 py-2 font-semibold">Comprador</th>
                  <th className="px-3 py-2 font-semibold">Anúncio</th>
                  <th className="px-3 py-2 font-semibold">Para quem</th>
                  <th className="px-3 py-2 font-semibold">Origem</th>
                  <th className="px-3 py-2 font-semibold">Etapa</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((lead) => (
                  <tr key={lead.id} className="border-t border-border align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-ink [font-variant-numeric:tabular-nums]">{when(lead.createdAt)}</td>
                    <td className="px-3 py-2">
                      {lead.buyerUserId ? (
                        <Link href={`/admin/usuarios/${lead.buyerUserId}`} className="font-semibold text-ink hover:underline">
                          {lead.buyerName}
                        </Link>
                      ) : (
                        <span className="font-semibold text-ink">{lead.buyerName}</span>
                      )}
                      <p className="text-xs text-ink-muted">
                        {[lead.buyerPhone && formatPhone(lead.buyerPhone), lead.buyerEmail].filter(Boolean).join(" · ") || "sem contato"}
                      </p>
                    </td>
                    <td className="max-w-[220px] px-3 py-2">
                      {lead.listingId ? (
                        <Link href={`/anuncio/${lead.listingId}`} className="line-clamp-2 text-brand-blue hover:underline">
                          {lead.listingTitle ?? "ver anúncio"}
                        </Link>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                      {lead.assetType && <p className="text-xs text-ink-muted">{lead.assetType === "vehicle" ? "Carro" : "Imóvel"}</p>}
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/admin/usuarios/${lead.partnerOwnerUserId}`} className="font-semibold text-ink hover:underline">
                        {lead.partnerName}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-ink">
                      {LEAD_SOURCE_LABELS[lead.source]}
                      {lead.hasConversation && <p className="text-xs text-ink-muted">conversa no chat</p>}
                      {lead.acqSource && (
                        <p className="text-xs text-ink-muted">{lead.acqSource === "direto" ? "acesso direto ao site" : `veio de: ${lead.acqSource}`}</p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                        <span className={`h-2 w-2 rounded-full ${STAGE_TONE[lead.status]}`} aria-hidden />
                        {LEAD_STATUS_LABELS[lead.status]}
                      </span>
                      <p className={`text-xs ${lead.status === "new" && lead.daysInStage >= 1 ? "font-semibold text-status-danger" : "text-ink-muted"}`}>
                        {lead.daysInStage === 0 ? "desde hoje" : `há ${lead.daysInStage} ${lead.daysInStage === 1 ? "dia" : "dias"}`}
                      </p>
                      {lead.proposalValue !== undefined && <p className="text-xs text-ink">Proposta {formatBRL(lead.proposalValue)}</p>}
                    </td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-ink-muted">
                      Nenhum lead com esses filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <nav className="flex items-center justify-center gap-3 text-sm">
              {data.page > 1 && (
                <Link href={href({ pagina: String(data.page - 1) })} className="font-semibold text-brand-blue hover:underline">
                  ← Anteriores
                </Link>
              )}
              <span className="text-ink-muted">
                Página {data.page} de {pages} · {data.total} leads
              </span>
              {data.page < pages && (
                <Link href={href({ pagina: String(data.page + 1) })} className="font-semibold text-brand-blue hover:underline">
                  Próximos →
                </Link>
              )}
            </nav>
          )}
        </>
      )}
    </main>
  );
}

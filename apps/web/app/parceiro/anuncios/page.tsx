import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { PartnerNav } from "@/components/PartnerNav";
import { fetchMyListings, fetchMyPartner } from "@/lib/api";
import { markListingSoldAction, updateListingStatusAction } from "@/lib/actions/listings";

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  draft: { label: "Rascunho", tone: "text-ink-muted" },
  pending_review: { label: "Em análise", tone: "text-brand-orange" },
  active: { label: "Ativo", tone: "text-brand-green" },
  paused: { label: "Pausado", tone: "text-ink-muted" },
  sold: { label: "Vendido", tone: "text-brand-blue" },
  rejected: { label: "Recusado", tone: "text-status-danger" },
  expired: { label: "Expirado", tone: "text-ink-muted" },
};

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "Todos os status" },
  { value: "active", label: "Ativo" },
  { value: "paused", label: "Pausado" },
  { value: "pending_review", label: "Em análise" },
  { value: "sold", label: "Vendido" },
  { value: "draft", label: "Rascunho" },
  { value: "rejected", label: "Recusado" },
  { value: "expired", label: "Expirado" },
];

export default async function PartnerListingsPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string };
}) {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const partner = await fetchMyPartner(session.accessToken);
  if (!partner) redirect("/parceiro");

  const allListings = await fetchMyListings(session.accessToken);

  const statusFilter = searchParams.status ?? "";
  const query = (searchParams.q ?? "").trim().toLowerCase();
  const listings = allListings.filter((listing) => {
    if (statusFilter && listing.status !== statusFilter) return false;
    if (query && !listing.title.toLowerCase().includes(query)) return false;
    return true;
  });

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="font-display text-2xl font-semibold text-ink">{partner.legalName}</h1>
      <div className="mt-6">
        <PartnerNav active="anuncios" showEquipe={partner.isOwner} showServicos={partner.type === "workshop"} />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold text-ink">
          Estoque <span className="text-base font-normal text-ink-muted">({listings.length})</span>
        </h2>
        <div className="flex gap-2">
          <Link
            href="/parceiro/anuncios/importar"
            className="rounded-brand border border-border px-4 py-2 text-sm font-bold text-ink hover:bg-surface-sober"
          >
            Importar CSV
          </Link>
          <Link
            href="/anunciar"
            className="rounded-brand bg-brand-green px-4 py-2 text-sm font-bold text-on-green hover:opacity-90"
          >
            + Anunciar
          </Link>
        </div>
      </div>

      <form className="mt-4 flex flex-wrap gap-2" action="/parceiro/anuncios">
        <input
          type="search"
          name="q"
          defaultValue={searchParams.q ?? ""}
          placeholder="Buscar por título..."
          className="flex-1 rounded-brand border border-border bg-surface-page px-3 py-2 text-sm text-ink"
        />
        <select
          name="status"
          defaultValue={statusFilter}
          className="rounded-brand border border-border bg-surface-page px-3 py-2 text-sm text-ink"
        >
          {STATUS_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Button type="submit" variant="ghost">
          Filtrar
        </Button>
      </form>

      {listings.length === 0 ? (
        <p className="mt-4 text-ink-muted">
          {allListings.length === 0 ? "Nenhum anúncio cadastrado ainda." : "Nenhum anúncio bate com esse filtro."}
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {listings.map((listing) => {
            const status = STATUS_LABEL[listing.status] ?? { label: listing.status, tone: "text-ink-muted" };
            const canToggle = listing.status === "active" || listing.status === "paused";
            const nextStatus = listing.status === "active" ? "paused" : "active";

            return (
              <li key={listing.id} className="rounded-brand border border-border bg-surface-raised p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <Link href={`/anuncio/${listing.id}`} className="font-semibold text-ink hover:underline">
                      {listing.title}
                    </Link>
                    <p className="text-sm text-ink-muted">{listing.priceLabel}</p>
                    <p className={`text-xs font-bold ${status.tone}`}>{status.label}</p>
                  </div>
                  {canToggle && (
                    <form action={updateListingStatusAction.bind(null, listing.id, nextStatus)} className="shrink-0">
                      <Button type="submit" variant="ghost">
                        {listing.status === "active" ? "Pausar" : "Reativar"}
                      </Button>
                    </form>
                  )}
                </div>

                {canToggle && (
                  <form
                    action={markListingSoldAction.bind(null, listing.id)}
                    className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3"
                  >
                    <span className="text-xs font-semibold text-ink-muted">Marcar como vendido por</span>
                    <input
                      type="number"
                      name="soldPrice"
                      min="0"
                      step="0.01"
                      placeholder={`padrão: ${listing.priceLabel}`}
                      className="w-40 rounded-brand border border-border bg-surface-page px-2 py-1.5 text-sm text-ink"
                    />
                    <Button type="submit" variant="secondary" className="px-3 py-1.5 text-xs">
                      Confirmar venda
                    </Button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

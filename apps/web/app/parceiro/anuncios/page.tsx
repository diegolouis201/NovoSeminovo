import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { PartnerNav } from "@/components/PartnerNav";
import { fetchMyListings, fetchMyPartner } from "@/lib/api";
import { updateListingStatusAction } from "@/lib/actions/listings";

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  draft: { label: "Rascunho", tone: "text-ink-muted" },
  pending_review: { label: "Em análise", tone: "text-brand-orange" },
  active: { label: "Ativo", tone: "text-brand-green" },
  paused: { label: "Pausado", tone: "text-ink-muted" },
  sold: { label: "Vendido", tone: "text-brand-blue" },
  rejected: { label: "Recusado", tone: "text-status-danger" },
  expired: { label: "Expirado", tone: "text-ink-muted" },
};

export default async function PartnerListingsPage() {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const partner = await fetchMyPartner(session.accessToken);
  if (!partner) redirect("/parceiro");

  const listings = await fetchMyListings(session.accessToken);

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="font-display text-2xl font-semibold text-ink">{partner.legalName}</h1>
      <div className="mt-6">
        <PartnerNav active="anuncios" />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold text-ink">Estoque</h2>
        <Link
          href="/anunciar"
          className="rounded-brand bg-brand-green px-4 py-2 text-sm font-bold text-on-green hover:opacity-90"
        >
          + Anunciar
        </Link>
      </div>

      {listings.length === 0 ? (
        <p className="mt-4 text-ink-muted">Nenhum anúncio cadastrado ainda.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {listings.map((listing) => {
            const status = STATUS_LABEL[listing.status] ?? { label: listing.status, tone: "text-ink-muted" };
            const canToggle = listing.status === "active" || listing.status === "paused";
            const nextStatus = listing.status === "active" ? "paused" : "active";

            return (
              <li
                key={listing.id}
                className="flex items-center justify-between gap-4 rounded-brand border border-border bg-surface-raised p-4"
              >
                <div className="min-w-0">
                  <Link href={`/anuncio/${listing.id}`} className="font-semibold text-ink hover:underline">
                    {listing.title}
                  </Link>
                  <p className="text-sm text-ink-muted">{listing.priceLabel}</p>
                  <p className={`text-xs font-bold ${status.tone}`}>{status.label}</p>
                </div>
                {canToggle && (
                  <form action={updateListingStatusAction.bind(null, listing.id, nextStatus)}>
                    <Button type="submit" variant="ghost">
                      {listing.status === "active" ? "Pausar" : "Reativar"}
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

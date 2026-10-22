import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { Car, House } from "@phosphor-icons/react/dist/ssr";
import { allowedAssetTypes } from "@novoseminovo/shared-types";
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

export default async function MyListingsPage() {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const [listings, partner] = await Promise.all([fetchMyListings(session.accessToken), fetchMyPartner(session.accessToken)]);
  const allowed = allowedAssetTypes(partner?.type);

  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">Meus anúncios</h1>
        <Link
          href="/anunciar"
          className="rounded-brand bg-brand-green px-4 py-2 text-sm font-bold text-on-green hover:opacity-90"
        >
          + Anunciar
        </Link>
      </div>

      {listings.length === 0 ? (
        <section className="mt-6 flex flex-col items-center gap-4 rounded-brand-lg border border-border bg-surface-raised px-6 py-12 text-center">
          <h2 className="font-display text-xl font-semibold uppercase text-ink">Você ainda não possui anúncios</h2>
          <p className="text-sm font-bold uppercase tracking-wide text-ink-muted">Anuncie agora</p>
          <div className="flex gap-4">
            {allowed.map((type) => {
              const TypeIcon = type === "vehicle" ? Car : House;
              return (
                <Link
                  key={type}
                  href={`/anunciar?tipo=${type}`}
                  className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-brand bg-brand-green text-sm font-bold text-on-green hover:opacity-90"
                >
                  <TypeIcon size={36} weight="fill" />
                  {type === "vehicle" ? "Carro" : "Imóvel"}
                </Link>
              );
            })}
          </div>
          {allowed.length === 2 && <p className="text-xs text-ink-muted">Pessoa física anuncia grátis, até vender.</p>}
        </section>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {listings.map((listing) => {
            const status = STATUS_LABEL[listing.status] ?? { label: listing.status, tone: "text-ink-muted" };
            const canToggle = listing.status === "active" || listing.status === "paused";
            const nextStatus = listing.status === "active" ? "paused" : "active";

            return (
              <li
                key={listing.id}
                className="flex flex-wrap items-center gap-4 rounded-brand border border-border bg-surface-raised p-4"
              >
                {listing.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={listing.image} alt="" className="h-16 w-24 shrink-0 rounded-sober object-cover" />
                ) : (
                  <span className="flex h-16 w-24 shrink-0 items-center justify-center rounded-sober bg-surface-sober text-ink-muted">
                    {listing.assetType === "vehicle" ? <Car size={28} /> : <House size={28} />}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <Link href={`/anuncio/${listing.id}`} className="font-semibold text-ink hover:underline">
                    {listing.title}
                  </Link>
                  <p className="text-sm text-ink-muted">
                    {listing.priceLabel} · {listing.location}
                  </p>
                  <p className={`text-xs font-bold ${status.tone}`}>{status.label}</p>
                </div>

                {canToggle && (
                  <div className="flex shrink-0 gap-2">
                    <form action={updateListingStatusAction.bind(null, listing.id, nextStatus)}>
                      <Button type="submit" variant="ghost">
                        {listing.status === "active" ? "Pausar" : "Reativar"}
                      </Button>
                    </form>
                    <form action={updateListingStatusAction.bind(null, listing.id, "sold")}>
                      <Button type="submit" variant="ghost">
                        Marcar como vendido
                      </Button>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

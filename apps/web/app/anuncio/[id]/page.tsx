import { notFound } from "next/navigation";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { FinancingCallout } from "@/components/FinancingCallout";
import { fetchListing } from "@/lib/api";

export default async function ListingDetailPage({ params }: { params: { id: string } }) {
  const listing = await fetchListing(params.id);
  if (!listing) notFound();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="grid gap-8 md:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <div className="flex h-72 items-center justify-center rounded-brand-lg bg-surface-sober text-6xl md:h-96">
            <span aria-hidden>{listing.assetType === "property" ? "🏠" : "🚗"}</span>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {listing.badge && <Badge label={listing.badge.label} tone={listing.badge.tone} />}
              <span className="text-sm text-ink-muted">{listing.location}</span>
            </div>
            <h1 className="font-display text-3xl font-bold text-ink">{listing.title}</h1>
            <p className="text-2xl font-extrabold [font-variant-numeric:tabular-nums]">
              {listing.priceLabel}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-brand border border-border bg-surface-raised p-4 sm:grid-cols-3">
            {listing.specs.map((spec) => (
              <div key={spec.label}>
                <dt className="text-xs text-ink-muted">{spec.label}</dt>
                <dd className="text-sm font-semibold text-ink">{spec.value}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-col gap-2">
            <h2 className="font-display text-xl font-semibold text-ink">Descrição</h2>
            <p className="text-ink">{listing.description}</p>
          </div>
        </div>

        <aside className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 rounded-brand border border-border bg-surface-raised p-4">
            <p className="text-sm font-semibold text-ink">
              {listing.sellerType === "partner" ? "Loja verificada" : "Anunciante particular"}
            </p>
            <Button variant="primary">Conversar no chat</Button>
            <Button variant="ghost">Chamar no WhatsApp</Button>
          </div>

          <FinancingCallout
            price={listing.financing.price}
            downPayment={listing.financing.downPayment}
            installments={listing.financing.installments}
            rate={listing.financing.rate}
          />
        </aside>
      </div>
    </main>
  );
}

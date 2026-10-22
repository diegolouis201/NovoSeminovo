import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Check } from "@phosphor-icons/react/dist/ssr";
import { LISTING_TIERS, formatBRL, listingTier } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { fetchListing } from "@/lib/api";
import { boostFormAction } from "@/lib/actions/listings";

// "Turbinar anúncio" (pessoa física): sobe o plano do anúncio depois de
// publicado. Cada plano é um pagamento único pelo valor cheio — mais simples
// de explicar, igual aos grandes portais.
export default async function BoostListingPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erro?: string };
}) {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");
  const listing = await fetchListing(params.id, session.accessToken);
  if (!listing) notFound();
  if (listing.ownerUserId !== session.user?.id || listing.isPartnerListing) redirect(`/anuncio/${params.id}`);

  const current = listingTier(listing.planTier);
  const options = LISTING_TIERS.filter((tier) => tier.rank > current.rank);

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <Link href={`/anuncio/${listing.id}`} className="text-sm font-semibold text-brand-blue hover:underline">
        ← Voltar ao anúncio
      </Link>
      <h1 className="mt-2 font-display text-3xl font-bold uppercase text-ink">Turbine seu anúncio</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {listing.title} — plano atual: <strong className="text-ink">{current.name}</strong>. Pagamento único, sem
        mensalidade; o anúncio continua no ar até vender.
      </p>
      {searchParams.erro && (
        <p className="mt-4 rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">{searchParams.erro}</p>
      )}
      {options.length === 0 ? (
        <p className="mt-6 text-ink-muted">Seu anúncio já está no plano mais alto.</p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-3">
          {options.map((tier) => (
            <li key={tier.id} className="flex flex-col gap-2 rounded-brand border border-border bg-surface-raised p-5">
              <p className="font-display text-xl font-bold uppercase text-ink">{tier.name}</p>
              <p className="text-2xl font-extrabold text-ink">{formatBRL(tier.price)}</p>
              <p className="text-xs text-ink-muted">pagamento único</p>
              <ul className="mt-2 flex-1 space-y-1.5 text-sm text-ink">
                {[tier.position, "No ar até vender", `Até ${tier.photos} fotos`, ...(tier.video ? ["Vídeo do veículo"] : [])].map((item) => (
                  <li key={item} className="flex gap-2">
                    <Check size={16} weight="bold" className="mt-0.5 shrink-0 text-brand-green" />
                    {item}
                  </li>
                ))}
              </ul>
              <form action={boostFormAction.bind(null, listing.id, tier.id)}>
                <button type="submit" className="mt-2 w-full rounded-brand bg-brand-green px-4 py-2.5 text-sm font-bold text-on-green hover:opacity-90">
                  Quero o {tier.name}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

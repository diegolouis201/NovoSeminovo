import { redirect } from "next/navigation";
import type { PendingListing, PendingPartner } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { fetchPendingListings, fetchPendingPartners } from "@/lib/api";
import { moderateListingAction, verifyPartnerAction } from "@/lib/actions/admin";

const PARTNER_TYPE_LABEL: Record<string, string> = {
  dealership: "Loja de veículos",
  real_estate_agency: "Imobiliária",
  broker: "Corretor(a) autônomo(a)",
};

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/entrar");

  if (session.user.role !== "admin") {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <h1 className="font-display text-2xl font-semibold text-ink">Acesso restrito</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Esta área é só para administradores da plataforma. Se você acha que deveria ter acesso,
          fale com quem administra o NovoSeminovo.
        </p>
      </main>
    );
  }

  const [listings, partners] = await Promise.all([
    fetchPendingListings(session.accessToken),
    fetchPendingPartners(session.accessToken),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="font-display text-2xl font-semibold text-ink">Moderação</h1>
      <p className="text-sm text-ink-muted">
        Todo anúncio novo espera aqui antes de aparecer na busca; toda loja/imobiliária nova espera
        aqui antes de ganhar o selo de verificada.
      </p>

      <section className="mt-8">
        <h2 className="font-display text-xl font-semibold text-ink">
          Anúncios pendentes <span className="text-base font-normal text-ink-muted">({listings.length})</span>
        </h2>
        {listings.length === 0 ? (
          <p className="mt-3 text-ink-muted">Nenhum anúncio esperando análise.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {listings.map((listing) => (
              <PendingListingCard key={listing.id} listing={listing} />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold text-ink">
          Lojas/imobiliárias pendentes <span className="text-base font-normal text-ink-muted">({partners.length})</span>
        </h2>
        {partners.length === 0 ? (
          <p className="mt-3 text-ink-muted">Nenhuma loja/imobiliária esperando verificação.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {partners.map((partner) => (
              <PendingPartnerCard key={partner.id} partner={partner} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function PendingListingCard({ listing }: { listing: PendingListing }) {
  const action = moderateListingAction.bind(null, listing.id);

  return (
    <li className="flex flex-col gap-3 rounded-brand border border-border bg-surface-raised p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="font-semibold text-ink">{listing.title}</p>
        <p className="text-sm text-ink-muted">
          {listing.priceLabel} · {listing.location}
        </p>
        <p className="text-xs text-ink-muted">
          {listing.ownerName} · {listing.ownerEmail}
        </p>
      </div>
      <form action={action} className="flex shrink-0 flex-col gap-2 sm:w-64">
        <input
          name="reason"
          placeholder="Motivo, se for recusar (opcional)"
          className="rounded-brand border border-border bg-surface-page px-3 py-2 text-xs text-ink placeholder:text-ink-muted"
        />
        <div className="flex gap-2">
          <Button type="submit" name="action" value="approve" variant="primary" className="flex-1 justify-center">
            Aprovar
          </Button>
          <Button type="submit" name="action" value="reject" variant="ghost" className="flex-1 justify-center">
            Recusar
          </Button>
        </div>
      </form>
    </li>
  );
}

function PendingPartnerCard({ partner }: { partner: PendingPartner }) {
  const action = verifyPartnerAction.bind(null, partner.id);

  return (
    <li className="flex flex-col gap-3 rounded-brand border border-border bg-surface-raised p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-semibold text-ink">{partner.legalName}</p>
        <p className="text-sm text-ink-muted">
          {PARTNER_TYPE_LABEL[partner.type] ?? partner.type} · {partner.document}
        </p>
        <p className="text-xs text-ink-muted">
          {partner.ownerName} · {partner.ownerEmail}
        </p>
      </div>
      <form action={action}>
        <Button type="submit" variant="primary">
          Verificar
        </Button>
      </form>
    </li>
  );
}

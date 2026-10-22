import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LeadsKanban } from "@/components/LeadsKanban";
import { fetchMyListings, fetchMyPartner, fetchPartnerLeads } from "@/lib/api";

export default async function PartnerLeadsPage() {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const partner = await fetchMyPartner(session.accessToken);
  if (!partner) redirect("/parceiro");

  const [leads, listings] = await Promise.all([fetchPartnerLeads(session.accessToken), fetchMyListings(session.accessToken)]);
  const stock = listings
    .filter((listing) => listing.status === "active" || listing.status === "paused")
    .map((listing) => ({ id: listing.id, title: listing.title }));

  return (
    <main className="mx-auto max-w-7xl px-4 py-12">
      <h1 className="font-display text-2xl font-semibold text-ink">{partner.legalName}</h1>

      <h2 className="mt-6 font-display text-xl font-semibold text-ink">Leads</h2>
      <p className="text-sm text-ink-muted">
        Quem conversa pelo chat ou clica em &quot;Chamar no WhatsApp&quot; num anúncio seu entra aqui sozinho. Cliente que
        ligou ou foi à loja, cadastre em &quot;Novo lead&quot;. Arraste o card conforme a negociação avança — o número no
        canto mostra há quantos dias ele está na etapa (vermelho a partir de 3).
      </p>

      <LeadsKanban leads={leads} listings={stock} storeName={partner.legalName} isVehicle={partner.type === "dealership"} />
    </main>
  );
}

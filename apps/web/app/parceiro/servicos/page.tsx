import { redirect } from "next/navigation";
import { CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { PartnerNav } from "@/components/PartnerNav";
import { fetchMyPartner, fetchPendingServiceConfirmations, resolveMediaUrl } from "@/lib/api";
import { confirmServiceAction } from "@/lib/actions/vehicles";

export default async function PartnerServicesPage() {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const partner = await fetchMyPartner(session.accessToken);
  if (!partner) redirect("/parceiro");
  if (partner.type !== "workshop") redirect("/parceiro");

  const pending = await fetchPendingServiceConfirmations(session.accessToken);

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="font-display text-2xl font-semibold text-ink">{partner.legalName}</h1>
      <div className="mt-6">
        <PartnerNav active="servicos" showEquipe={partner.isOwner} showServicos />
      </div>

      <h2 className="mt-6 font-display text-xl font-semibold text-ink">Confirmar serviços</h2>
      <p className="text-sm text-ink-muted">
        Donos de veículo marcaram sua oficina como responsável por estes serviços. Confirme só o que sua
        oficina realmente realizou — isso vira um registro verificado no Passaporte Digital do carro.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        {pending.map((item) => (
          <div key={item.eventId} className="rounded-brand border border-border bg-surface-raised p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs text-ink-muted">{item.vehicleLabel}</p>
                <p className="font-semibold text-ink">{item.title}</p>
                {item.description && <p className="text-sm text-ink-muted">{item.description}</p>}
                {item.mileageAtEvent !== undefined && (
                  <p className="text-xs text-ink-muted">
                    {new Intl.NumberFormat("pt-BR").format(item.mileageAtEvent)} km
                  </p>
                )}
              </div>
              <form action={confirmServiceAction.bind(null, item.eventId)}>
                <Button type="submit" variant="primary" className="flex items-center gap-1.5">
                  <CheckCircle size={16} weight="bold" />
                  Confirmar
                </Button>
              </form>
            </div>
            {item.photos.length > 0 && (
              <div className="mt-3 flex gap-2">
                {item.photos.map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={url}
                    src={resolveMediaUrl(url)}
                    alt={`Comprovante de ${item.title}`}
                    className="h-20 w-20 rounded-brand border border-border object-cover"
                  />
                ))}
              </div>
            )}
          </div>
        ))}
        {pending.length === 0 && (
          <p className="rounded-brand border border-dashed border-border p-6 text-center text-sm text-ink-muted">
            Nenhuma confirmação pendente no momento.
          </p>
        )}
      </div>
    </main>
  );
}

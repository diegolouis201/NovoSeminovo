import Link from "next/link";
import {
  ArrowsLeftRight,
  Car,
  IdentificationCard,
  Megaphone,
  ShieldCheck,
  Warning,
  Wrench,
} from "@phosphor-icons/react/dist/ssr";
import type { VehicleEventType, VehicleProfile } from "@novoseminovo/shared-types";
import { fetchWorkshopOptions, resolveMediaUrl } from "@/lib/api";
import { addVehicleEventAction } from "@/lib/actions/vehicles";
import { FormField, SelectField, TextAreaField } from "@/components/FormField";
import { Button } from "@/components/Button";

const EVENT_ICON: Record<VehicleEventType, typeof Wrench> = {
  ownership_change: ArrowsLeftRight,
  revision: Wrench,
  repair: Wrench,
  accident: Warning,
  inspection: ShieldCheck,
  listing_published: Megaphone,
  other: IdentificationCard,
};

const EVENT_TYPE_OPTIONS = [
  { value: "revision", label: "Revisão" },
  { value: "repair", label: "Reparo / conserto" },
  { value: "inspection", label: "Vistoria" },
  { value: "other", label: "Outro" },
];

// Clicar só prefiche tipo/título do formulário (via querystring, sem JS) —
// não submete mais sozinho, porque o comprovante virou obrigatório e não dá
// pra anexar foto com um único toque num botão.
const QUICK_EVENTS: { type: "revision" | "repair" | "other"; title: string }[] = [
  { type: "revision", title: "Troca de óleo" },
  { type: "revision", title: "Revisão na concessionária" },
  { type: "repair", title: "Troca de pneus" },
  { type: "repair", title: "Alinhamento e balanceamento" },
  { type: "other", title: "Lavagem / higienização" },
];

function formatEventDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(iso));
}

function EventBadge({ event }: { event: VehicleProfile["events"][number] }) {
  if (event.source === "partner_verified") {
    return (
      <span className="mt-1 inline-block rounded-full bg-brand-green/10 px-2 py-0.5 text-[11px] font-semibold text-brand-green">
        Confirmado por {event.verifiedByPartnerName}
      </span>
    );
  }
  if (event.source === "owner_reported" && event.verifiedByPartnerName) {
    return (
      <span className="mt-1 inline-block rounded-full bg-brand-orange/10 px-2 py-0.5 text-[11px] font-semibold text-brand-orange">
        Aguardando confirmação de {event.verifiedByPartnerName}
      </span>
    );
  }
  if (event.source === "owner_reported") {
    return (
      <span className="mt-1 inline-block rounded-full bg-surface-sober px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
        Não verificado
      </span>
    );
  }
  return null;
}

export async function VehiclePassportView({
  vehicle,
  erro,
  preset,
  extraParams,
}: {
  vehicle: VehicleProfile;
  erro?: string;
  preset?: string;
  // Parâmetros da URL atual que os links de atalho precisam preservar (ex.:
  // "placa" em /consultar-veiculo) — sem isso, clicar num atalho lá perderia
  // o resultado da busca ao recarregar a página só com "?preset=...".
  extraParams?: Record<string, string>;
}) {
  const workshops = vehicle.isOwner ? await fetchWorkshopOptions() : [];
  const presetMatch = QUICK_EVENTS.find((p) => p.title === preset);
  const addEventWithId = addVehicleEventAction.bind(null, vehicle.id);

  function presetHref(title: string): string {
    const params = new URLSearchParams(extraParams);
    params.set("preset", title);
    return `?${params.toString()}#adicionar-evento`;
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-surface-sober">
          <Car size={28} weight="duotone" className="text-brand-blue" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand-blue">Passaporte Digital do Veículo</p>
          <h1 className="font-display text-2xl font-bold text-ink">
            {[vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "Veículo"}
            {vehicle.yearModel ? ` ${vehicle.yearModel}` : ""}
          </h1>
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 rounded-brand border border-border bg-surface-raised p-4 sm:grid-cols-3">
        {vehicle.color && (
          <div>
            <dt className="text-xs text-ink-muted">Cor</dt>
            <dd className="text-sm font-semibold text-ink">{vehicle.color}</dd>
          </div>
        )}
        {vehicle.plateMasked && (
          <div>
            <dt className="text-xs text-ink-muted">Placa</dt>
            <dd className="text-sm font-semibold text-ink">{vehicle.plateMasked}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-ink-muted">Donos registrados</dt>
          <dd className="text-sm font-semibold text-ink">{vehicle.ownersCount}</dd>
        </div>
      </dl>

      <p className="mt-4 text-xs text-ink-muted">
        As informações deste Passaporte são declaradas pelo proprietário e, quando confirmado, por oficinas
        parceiras — servem só pra apoiar sua decisão. O NovoSeminovo não verifica de forma independente esses
        dados e não se responsabiliza pela veracidade das informações nem pelas condições reais do veículo.
      </p>

      {erro && (
        <p className="mt-6 rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">{erro}</p>
      )}

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold text-ink">Histórico</h2>
        <p className="text-sm text-ink-muted">
          Linha do tempo deste veículo nesta plataforma — eventos marcados pelo dono ainda não são
          verificados por um parceiro, a não ser que uma oficina cadastrada já tenha confirmado.
        </p>

        <ol className="mt-4 flex flex-col gap-4 border-l-2 border-border pl-5">
          {vehicle.events.map((event) => {
            const Icon = EVENT_ICON[event.type];
            return (
              <li key={event.id} className="relative">
                <span className="absolute -left-[27px] flex h-6 w-6 items-center justify-center rounded-full bg-surface-sober">
                  <Icon size={14} weight="bold" className="text-brand-blue" />
                </span>
                <p className="text-xs text-ink-muted">{formatEventDate(event.occurredAt)}</p>
                <p className="text-sm font-semibold text-ink">{event.title}</p>
                {event.description && <p className="text-sm text-ink-muted">{event.description}</p>}
                {event.mileageAtEvent !== undefined && (
                  <p className="text-xs text-ink-muted">
                    {new Intl.NumberFormat("pt-BR").format(event.mileageAtEvent)} km
                  </p>
                )}
                {event.photos.length > 0 && (
                  <div className="mt-2 flex gap-2">
                    {event.photos.map((url) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={url}
                        src={resolveMediaUrl(url)}
                        alt={`Comprovante de ${event.title}`}
                        className="h-16 w-16 rounded-brand border border-border object-cover"
                      />
                    ))}
                  </div>
                )}
                <EventBadge event={event} />
              </li>
            );
          })}
          {vehicle.events.length === 0 && (
            <li className="text-sm text-ink-muted">Nenhum evento registrado ainda.</li>
          )}
        </ol>
      </section>

      {vehicle.isOwner && (
        <section id="adicionar-evento" className="mt-8 rounded-brand border border-border bg-surface-raised p-4">
          <h2 className="font-display text-base font-semibold text-ink">Adicionar evento ao histórico</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Toque num atalho pra preencher rápido, anexe a foto do comprovante (nota fiscal, ordem de serviço)
            e pronto.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_EVENTS.map((p) => (
              <Link
                key={p.title}
                href={presetHref(p.title)}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold hover:bg-surface-sober ${
                  presetMatch?.title === p.title ? "border-brand-green text-brand-green" : "border-border text-ink"
                }`}
              >
                + {p.title}
              </Link>
            ))}
          </div>

          <form action={addEventWithId} encType="multipart/form-data" className="mt-4 flex flex-col gap-4">
            <SelectField
              label="Tipo"
              name="type"
              options={EVENT_TYPE_OPTIONS}
              defaultValue={presetMatch?.type}
            />
            <FormField label="Título" name="title" placeholder="Revisão dos 60.000 km" defaultValue={presetMatch?.title} />
            <TextAreaField label="Descrição" name="description" required={false} />
            <FormField label="Km no momento" name="mileageAtEvent" type="number" min={0} required={false} />
            {workshops.length > 0 && (
              <SelectField
                label="Oficina que realizou o serviço"
                name="workshopPartnerId"
                options={workshops.map((w) => ({ value: w.id, label: w.legalName }))}
                required={false}
              />
            )}
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-ink">Comprovante (foto)</span>
              <input
                type="file"
                name="photos"
                accept="image/jpeg,image/png,image/webp"
                multiple
                required
                className="rounded-brand border border-border bg-surface-page px-3 py-2 text-sm text-ink"
              />
            </label>
            <Button type="submit" className="self-start">
              Adicionar evento
            </Button>
          </form>
        </section>
      )}
    </>
  );
}

import { notFound } from "next/navigation";
import {
  ArrowsLeftRight,
  Car,
  IdentificationCard,
  Megaphone,
  ShieldCheck,
  Warning,
  Wrench,
} from "@phosphor-icons/react/dist/ssr";
import { auth } from "@/auth";
import { fetchVehicleProfile } from "@/lib/api";
import { addVehicleEventAction } from "@/lib/actions/vehicles";
import { SelectField, FormField, TextAreaField } from "@/components/FormField";
import { Button } from "@/components/Button";
import type { VehicleEventType } from "@novoseminovo/shared-types";

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

function formatEventDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(iso));
}

export default async function VehiclePassportPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erro?: string };
}) {
  const session = await auth();
  const vehicle = await fetchVehicleProfile(params.id, session?.accessToken);
  if (!vehicle) notFound();

  const addEventWithId = addVehicleEventAction.bind(null, vehicle.id);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
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

      {searchParams.erro && (
        <p className="mt-6 rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
          {searchParams.erro}
        </p>
      )}

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold text-ink">Histórico</h2>
        <p className="text-sm text-ink-muted">
          Linha do tempo deste veículo nesta plataforma — eventos marcados pelo dono ainda não são
          verificados por um parceiro.
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
                {event.source === "owner_reported" && (
                  <span className="mt-1 inline-block rounded-full bg-surface-sober px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
                    Não verificado
                  </span>
                )}
              </li>
            );
          })}
          {vehicle.events.length === 0 && (
            <li className="text-sm text-ink-muted">Nenhum evento registrado ainda.</li>
          )}
        </ol>
      </section>

      {vehicle.isOwner && (
        <section className="mt-8 rounded-brand border border-border bg-surface-raised p-4">
          <h2 className="font-display text-base font-semibold text-ink">Adicionar evento ao histórico</h2>
          <form action={addEventWithId} className="mt-4 flex flex-col gap-4">
            <SelectField label="Tipo" name="type" options={EVENT_TYPE_OPTIONS} />
            <FormField label="Título" name="title" placeholder="Revisão dos 60.000 km" />
            <TextAreaField label="Descrição" name="description" required={false} />
            <FormField label="Km no momento" name="mileageAtEvent" type="number" min={0} required={false} />
            <Button type="submit" className="self-start">
              Adicionar evento
            </Button>
          </form>
        </section>
      )}
    </main>
  );
}

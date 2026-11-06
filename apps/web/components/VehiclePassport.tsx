import Link from "next/link";
import {
  ArrowsLeftRight,
  Car,
  IdentificationCard,
  DownloadSimple,
  Megaphone,
  SealCheck,
  ShieldCheck,
  Warning,
  WhatsappLogo,
  Wrench,
} from "@phosphor-icons/react/dist/ssr";
import QRCode from "qrcode";
import { formatarKm, historiaDoCarro, type VehicleEventType, type VehicleProfile } from "@novoseminovo/shared-types";
import { SITE_URL } from "@/lib/company";
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
        Confirmado por {event.verifiedByPartnerName ?? "oficina parceira"}
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

function EventoItem({ event }: { event: VehicleProfile["events"][number] }) {
  const Icon = EVENT_ICON[event.type];
  return (
    <li className="relative">
      <span className="absolute -left-[27px] flex h-6 w-6 items-center justify-center rounded-full bg-surface-sober">
        <Icon size={14} weight="bold" className="text-brand-blue" />
      </span>
      <p className="text-xs text-ink-muted">{formatEventDate(event.occurredAt)}</p>
      <p className="text-sm font-semibold text-ink">{event.title}</p>
      {event.description && <p className="text-sm text-ink-muted">{event.description}</p>}
      {event.mileageAtEvent !== undefined && <p className="text-xs text-ink-muted">{formatarKm(event.mileageAtEvent)}</p>}
      {event.photos.length > 0 && (
        <div className="mt-2 flex gap-2">
          {event.photos.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={url} src={resolveMediaUrl(url)} alt={`Comprovante de ${event.title}`} className="h-16 w-16 rounded-brand border border-border object-cover" />
          ))}
        </div>
      )}
      <EventBadge event={event} />
    </li>
  );
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesAno = (iso: string) => {
  const d = new Date(iso);
  return `${MESES[d.getUTCMonth()]}/${d.getUTCFullYear()}`;
};
const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

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
  const historia = historiaDoCarro(vehicle);
  const nome = `${[vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "Veículo"}${vehicle.yearModel ? ` ${vehicle.yearModel}` : ""}`;
  const link = `${SITE_URL}/veiculo/${vehicle.id}`;
  const qr = await QRCode.toDataURL(link, { margin: 1, width: 264, color: { dark: "#20261b", light: "#ffffff" } });

  function presetHref(title: string): string {
    const params = new URLSearchParams(extraParams);
    params.set("preset", title);
    return `?${params.toString()}#adicionar-evento`;
  }

  return (
    <>
      <header className="overflow-hidden rounded-brand border border-border bg-surface-raised">
        {vehicle.capaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={resolveMediaUrl(vehicle.capaUrl)} alt={`Foto de ${nome}`} className="h-56 w-full object-cover sm:h-72" />
        ) : (
          <div className="flex h-40 items-center justify-center bg-brand-blue/10">
            <Car size={64} weight="duotone" className="text-brand-blue" />
          </div>
        )}
        <div className="p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-blue">Diário do Carro · Passaporte Digital</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-ink sm:text-3xl">{nome}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {[historia.subtitulo, vehicle.color ? capitalizar(vehicle.color) : undefined, vehicle.plateMasked ? `placa ${vehicle.plateMasked}` : undefined]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {historia.selos.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Selos do carro">
              {historia.selos.map((selo) => (
                <li key={selo.id} title={selo.descricao} className="flex items-center gap-1.5 rounded-full bg-brand-green/10 px-3 py-1 text-xs font-bold text-brand-green">
                  <SealCheck size={16} weight="fill" /> {selo.nome}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-border pt-4">
            <div className="flex flex-wrap gap-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Conheça a história deste ${nome}: ${link}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-brand bg-brand-green px-3 py-2 text-sm font-bold text-on-green hover:opacity-90"
              >
                <WhatsappLogo size={18} weight="bold" /> Compartilhar
              </a>
              <a
                href={`/veiculo/${vehicle.id}/card`}
                download={`diario-do-carro-${vehicle.id}.png`}
                className="flex items-center gap-1.5 rounded-brand border border-border px-3 py-2 text-sm font-semibold text-ink hover:bg-surface-sober"
              >
                <DownloadSimple size={18} weight="bold" /> Card para Instagram
              </a>
            </div>
            <div className="flex items-center gap-3 sm:ml-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR code do Diário do Carro" width={88} height={88} className="rounded-brand border border-border bg-white" />
              <p className="max-w-[11rem] text-xs text-ink-muted">Aponte a câmera ou cole no vidro do carro para mostrar a história dele.</p>
            </div>
          </div>
        </div>
      </header>

      {historia.alertas.length > 0 && (
        <div className="mt-4 rounded-brand bg-brand-orange/10 px-4 py-3 text-sm text-ink">
          {historia.alertas.map((a) => (
            <p key={a} className="flex items-start gap-2">
              <Warning size={18} weight="bold" className="mt-0.5 shrink-0 text-brand-orange" /> {a}
            </p>
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-ink-muted">
        As informações deste Passaporte são declaradas pelo proprietário e, quando confirmado, por oficinas
        parceiras — servem só pra apoiar sua decisão. O NovoSeminovo não verifica de forma independente esses
        dados e não se responsabiliza pela veracidade das informações nem pelas condições reais do veículo.
        Os selos aparecem só quando há comprovante ou confirmação de oficina; os donos nunca são identificados.
      </p>

      {erro && (
        <p className="mt-6 rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">{erro}</p>
      )}

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold text-ink">A história</h2>
        <p className="text-sm text-ink-muted">Um capítulo para cada dono, do primeiro registro até hoje.</p>

        <div className="mt-4 flex flex-col gap-6">
          {historia.capitulos.map((cap) => (
            <article key={cap.numero} className="rounded-brand border border-border bg-surface-raised p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-base font-bold text-ink">
                  Capítulo {cap.numero} · {cap.numero}º dono
                </h3>
                {cap.atual && <span className="rounded-full bg-brand-blue/10 px-2 py-0.5 text-[11px] font-bold text-brand-blue">Dono atual</span>}
              </div>
              <p className="mt-0.5 text-xs text-ink-muted">
                {[
                  cap.inicio ? `${mesAno(cap.inicio)} – ${cap.fim ? mesAno(cap.fim) : "hoje"}` : undefined,
                  cap.cidade,
                  cap.kmInicio !== undefined && cap.kmFim !== undefined && cap.kmFim !== cap.kmInicio
                    ? `${formatarKm(cap.kmInicio)} → ${formatarKm(cap.kmFim)}`
                    : cap.kmFim !== undefined
                      ? formatarKm(cap.kmFim)
                      : undefined,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <ol className="mt-4 flex flex-col gap-4 border-l-2 border-border pl-5">
                {cap.eventos.map((event) => (
                  <EventoItem key={event.id} event={event} />
                ))}
                {cap.eventos.length === 0 && <li className="text-sm text-ink-muted">Nenhum evento registrado ainda.</li>}
              </ol>
            </article>
          ))}
        </div>
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

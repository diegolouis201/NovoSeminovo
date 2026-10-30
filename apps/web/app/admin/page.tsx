import Link from "next/link";
import { redirect } from "next/navigation";
import type { ModerationLogEntry, PendingListing, PendingPartner, PendingReport } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { fetchModerationLog, fetchOpenReports, fetchPendingListings, fetchPendingPartners } from "@/lib/api";
import { moderateListingAction, setPartnerTypeAction, updateReportStatusAction, verifyPartnerAction } from "@/lib/actions/admin";

const PARTNER_TYPE_LABEL: Record<string, string> = {
  dealership: "Loja de veículos",
  real_estate_agency: "Imobiliária",
  builder: "Construtora",
  broker: "Corretor(a) autônomo(a)",
  workshop: "Oficina mecânica",
};

// Atalhos do admin em cartões (texto, sem números).
const ADMIN_AREAS = [
  { href: "/admin/operacao", title: "Operação com IA", hint: "Aprovações e rotinas" },
  { href: "/admin/anuncios", title: "Todos os anúncios", hint: "Veículos e imóveis, PF e PJ" },
  { href: "/admin/leads", title: "Todos os leads", hint: "Funil das lojas e imobiliárias" },
  { href: "/admin/financiamentos", title: "Financiamentos", hint: "Interessados e Credihome" },
  { href: "/admin/recompensas", title: "Cashback", hint: "Pagar clientes que financiaram" },
  { href: "/admin/painel", title: "Painel geral", hint: "Big numbers do site" },
  { href: "/admin/assinaturas", title: "Assinaturas", hint: "Planos dos parceiros" },
  { href: "/admin/afiliados", title: "Afiliados", hint: "Programa de afiliados" },
];

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

  const [listings, partners, reports, moderationLog] = await Promise.all([
    fetchPendingListings(session.accessToken),
    fetchPendingPartners(session.accessToken),
    fetchOpenReports(session.accessToken),
    fetchModerationLog(session.accessToken),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="font-display text-2xl font-semibold text-ink">Moderação</h1>
      <p className="text-sm text-ink-muted">
        Todo anúncio novo espera aqui antes de aparecer na busca; toda loja/imobiliária nova espera
        aqui antes de ganhar o selo de verificada.
      </p>
      <nav aria-label="Áreas do admin" className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ADMIN_AREAS.map((area) => (
          <Link
            key={area.href}
            href={area.href}
            className="flex flex-col justify-center rounded-brand border border-border bg-surface-raised px-4 py-3 text-center shadow-card transition-colors hover:border-brand-blue hover:bg-brand-blue/5"
          >
            <span className="text-sm font-bold text-ink">{area.title}</span>
            <span className="mt-0.5 text-xs text-ink-muted">{area.hint}</span>
          </Link>
        ))}
      </nav>

      <section className="mt-8">
        <h2 className="font-display text-xl font-semibold text-ink">
          Anúncios pendentes <span className="text-base font-normal text-ink-muted">({listings.length})</span>
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          A moderação automática (IA) analisa cada anúncio novo uns minutos depois do cadastro: aprova os normais, recusa os claramente
          irregulares e deixa aqui só os duvidosos, com o motivo.
        </p>
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

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold text-ink">
          Denúncias <span className="text-base font-normal text-ink-muted">({reports.length})</span>
        </h2>
        {reports.length === 0 ? (
          <p className="mt-3 text-ink-muted">Nenhuma denúncia esperando análise.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {reports.map((report) => (
              <PendingReportCard key={report.id} report={report} />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold text-ink">
          Histórico de moderação <span className="text-base font-normal text-ink-muted">(últimas {moderationLog.length})</span>
        </h2>
        {moderationLog.length === 0 ? (
          <p className="mt-3 text-ink-muted">Nenhuma aprovação ou recusa registrada ainda.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {moderationLog.map((entry) => (
              <ModerationLogRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

const ACTION_LABEL: Record<ModerationLogEntry["action"], string> = {
  approved: "Aprovado",
  rejected: "Recusado",
  suspended: "Suspenso",
  reactivated: "Reativado",
};

function ModerationLogRow({ entry }: { entry: ModerationLogEntry }) {
  const colorClass = entry.action === "approved" ? "text-brand-green" : "text-status-danger";

  return (
    <li className="flex flex-col gap-1 rounded-brand border border-border bg-surface-raised p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <Link href={`/anuncio/${entry.listingId}`} className="font-semibold text-ink hover:underline">
          {entry.listingTitle}
        </Link>
        {entry.reason && <p className="text-xs text-ink-muted">Motivo: {entry.reason}</p>}
      </div>
      <div className="shrink-0 text-right">
        <span className={`font-bold ${colorClass}`}>{ACTION_LABEL[entry.action]}</span>
        <p className="text-xs text-ink-muted">
          por {entry.automated ? "IA" : entry.adminName} · {new Date(entry.createdAt).toLocaleDateString("pt-BR")}
        </p>
      </div>
    </li>
  );
}

function PendingListingCard({ listing }: { listing: PendingListing }) {
  const action = moderateListingAction.bind(null, listing.id);

  return (
    <li className="flex flex-col gap-3 rounded-brand border border-border bg-surface-raised p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="font-semibold text-ink">
          {listing.paid && <span className="mr-2 rounded-full bg-brand-green px-2 py-0.5 align-middle text-[11px] font-bold text-on-green">Pago</span>}
          {listing.title}
        </p>
        <p className="text-sm text-ink-muted">
          {listing.priceLabel} · {listing.location}
        </p>
        <p className="text-xs text-ink-muted">
          {listing.ownerName} · {listing.ownerEmail}
        </p>
        {listing.autoReviewNote ? (
          <p className="mt-2 rounded-brand border border-border bg-surface-sober px-3 py-2 text-xs text-ink">
            <strong>IA pediu revisão:</strong> {listing.autoReviewNote}
          </p>
        ) : (
          <p className="mt-2 text-xs text-ink-muted">Aguardando a análise automática.</p>
        )}
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
  const typeAction = setPartnerTypeAction.bind(null, partner.id);

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
        {/* Tipo veio da consulta do CNPJ — corrige aqui se veio errado. */}
        <form action={typeAction} className="mt-2 flex items-center gap-2 text-xs">
          <label htmlFor={`type-${partner.id}`} className="text-ink-muted">
            Tipo:
          </label>
          <select
            id={`type-${partner.id}`}
            name="type"
            defaultValue={partner.type}
            className="rounded-brand border border-border bg-surface-page px-2 py-1 text-ink"
          >
            {Object.entries(PARTNER_TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button type="submit" className="font-semibold text-brand-blue hover:underline">
            Salvar tipo
          </button>
        </form>
      </div>
      <form action={action}>
        <Button type="submit" variant="primary">
          Verificar
        </Button>
      </form>
    </li>
  );
}

function PendingReportCard({ report }: { report: PendingReport }) {
  const action = updateReportStatusAction.bind(null, report.id);

  return (
    <li className="flex flex-col gap-3 rounded-brand border border-border bg-surface-raised p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="font-semibold text-ink">{report.listingTitle}</p>
        <p className="text-sm text-ink-muted">{report.reason}</p>
        <p className="text-xs text-ink-muted">
          Denunciado por {report.reporterName} · {report.reporterEmail}
        </p>
      </div>
      <form action={action} className="flex shrink-0 gap-2">
        <Button type="submit" name="status" value="reviewed" variant="primary" className="flex-1 justify-center">
          Marcar como revisada
        </Button>
        <Button type="submit" name="status" value="dismissed" variant="ghost" className="flex-1 justify-center">
          Descartar
        </Button>
      </form>
    </li>
  );
}

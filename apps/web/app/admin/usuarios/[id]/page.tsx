import Link from "next/link";
import { redirect } from "next/navigation";
import { ACQUISITION_SOURCES, ADMIN_LISTING_STATUS_LABELS, MARKETING_CONSENT_LABELS, type AdminUserProfile } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { AdminListingsTable } from "@/components/admin/AdminListingsTable";
import { adminDeleteAccountForm } from "@/lib/actions/admin-listings";
import { fetchAdminListings, fetchAdminUser } from "@/lib/api";

export const dynamic = "force-dynamic";

const PARTNER_TYPE_LABELS: Record<string, string> = {
  dealership: "Loja de veículos",
  real_estate_agency: "Imobiliária",
  broker: "Corretor",
  builder: "Construtora",
  workshop: "Oficina",
};
const ROLE_LABELS: Record<string, string> = { buyer: "Pessoa física", partner_owner: "Dono de loja/imobiliária", admin: "Administrador" };
const SUBSCRIPTION_LABELS: Record<string, string> = { active: "Em dia", past_due: "Pagamento atrasado", canceled: "Cancelada" };

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
}

export default async function AdminUserPage({ params, searchParams }: { params: { id: string }; searchParams: { tipo?: string; sucesso?: string; erro?: string } }) {
  const session = await auth();
  if (!session?.user) redirect("/entrar");
  if (session.user.role !== "admin") redirect("/conta");

  const tipo = searchParams.tipo === "property" ? "property" : "vehicle";
  const [profile, listings] = await Promise.all([
    fetchAdminUser(params.id, session.accessToken),
    fetchAdminListings({ tipo, dono: params.id }, session.accessToken),
  ]);
  const count = (assetType: string, status?: string) =>
    (profile?.stats.listingsByStatus ?? []).filter((row) => row.assetType === assetType && (!status || row.status === status)).reduce((sum, row) => sum + row.count, 0);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-12">
      <Link href="/admin/anuncios" className="text-sm font-semibold text-brand-blue hover:underline">
        ← Todos os anúncios
      </Link>

      {searchParams.erro && <p className="rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">{searchParams.erro}</p>}
      {searchParams.sucesso && <p className="rounded-brand bg-surface-sober px-4 py-3 text-sm text-ink">{searchParams.sucesso}</p>}

      {!profile ? (
        <p className="text-sm text-status-danger">Não foi possível carregar este cadastro.</p>
      ) : (
        <>
          <Header profile={profile} />

          <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Veículos" value={count("vehicle")} detail={`${count("vehicle", "active")} no ar`} />
            <Stat label="Imóveis" value={count("property")} detail={`${count("property", "active")} no ar`} />
            <Stat label="Visitas nos anúncios" value={profile.stats.views} />
            <Stat label="Conversas recebidas" value={profile.stats.conversations} />
            <Stat label={profile.partner ? "Leads da loja" : "Favoritos salvos"} value={profile.partner ? profile.stats.partnerLeads : profile.stats.favoritesGiven} />
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="mr-2 font-display text-lg font-semibold text-ink">Anúncios</h2>
              {(["vehicle", "property"] as const).map((key) => (
                <Link
                  key={key}
                  href={`/admin/usuarios/${profile.id}?tipo=${key}`}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tipo === key ? "bg-brand-blue text-on-blue" : "bg-surface-sober text-ink hover:opacity-80"}`}
                >
                  {key === "vehicle" ? "Veículos" : "Imóveis"} ({count(key)})
                </Link>
              ))}
            </div>
            {listings ? (
              <AdminListingsTable rows={listings.items} returnTo={`/admin/usuarios/${profile.id}?tipo=${tipo}`} />
            ) : (
              <p className="text-sm text-status-danger">Não foi possível carregar os anúncios.</p>
            )}
            {listings && listings.total > listings.items.length && (
              <p className="text-xs text-ink-muted">
                Mostrando {listings.items.length} de {listings.total}. Veja todos em{" "}
                <Link href={`/admin/anuncios?tipo=${tipo}&busca=${encodeURIComponent(profile.email)}`} className="text-brand-blue hover:underline">
                  Todos os anúncios
                </Link>
                .
              </p>
            )}
          </section>

          {!profile.deleted && <DeleteAccount profile={profile} />}
        </>
      )}
    </main>
  );
}

function Header({ profile }: { profile: AdminUserProfile }) {
  const partner = profile.partner;
  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="rounded-brand-lg border border-border bg-surface-raised p-5 text-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">{partner ? "Responsável (PJ)" : "Pessoa física (PF)"}</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-ink">{profile.name}</h1>
        {profile.deleted && <p className="mt-1 font-semibold text-status-danger">Conta excluída: dados pessoais apagados.</p>}
        {!profile.deleted && profile.status !== "active" && <p className="mt-1 font-semibold text-status-danger">Conta suspensa</p>}
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-ink-muted">E-mail</dt>
          <dd className="break-all text-ink">
            {profile.email} {profile.emailVerified ? "✓" : <span className="text-ink-muted">(não confirmado)</span>}
          </dd>
          {profile.phone && (
            <>
              <dt className="text-ink-muted">Telefone</dt>
              <dd className="text-ink">{profile.phone}</dd>
            </>
          )}
          {profile.cpfMasked && (
            <>
              <dt className="text-ink-muted">CPF</dt>
              <dd className="text-ink">{profile.cpfMasked}</dd>
            </>
          )}
          <dt className="text-ink-muted">Tipo</dt>
          <dd className="text-ink">{ROLE_LABELS[profile.role] ?? profile.role}</dd>
          <dt className="text-ink-muted">Cadastro</dt>
          <dd className="text-ink">
            {dateLabel(profile.createdAt)}
            {profile.acqSource ? ` · veio de ${ACQUISITION_SOURCES[profile.acqSource as keyof typeof ACQUISITION_SOURCES] ?? profile.acqSource}` : ""}
          </dd>
          {profile.marketingConsent && (
            <>
              <dt className="text-ink-muted">E-mails de marketing</dt>
              <dd className="text-ink">{MARKETING_CONSENT_LABELS[profile.marketingConsent] ?? profile.marketingConsent}</dd>
            </>
          )}
          {profile.affiliateStatus && (
            <>
              <dt className="text-ink-muted">Afiliado</dt>
              <dd className="text-ink">{profile.affiliateStatus}</dd>
            </>
          )}
        </dl>
      </div>
      {partner ? (
        <div className="rounded-brand-lg border border-border bg-surface-raised p-5 text-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Pessoa jurídica (PJ)</p>
          <h2 className="mt-1 font-display text-xl font-semibold text-ink">{partner.legalName}</h2>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-ink-muted">Tipo</dt>
            <dd className="text-ink">{PARTNER_TYPE_LABELS[partner.type] ?? partner.type}</dd>
            <dt className="text-ink-muted">CNPJ</dt>
            <dd className="text-ink">{partner.document}</dd>
            <dt className="text-ink-muted">Verificada</dt>
            <dd className="text-ink">{partner.verified ? "Sim" : "Ainda não"}</dd>
            <dt className="text-ink-muted">Desde</dt>
            <dd className="text-ink">{dateLabel(partner.createdAt)}</dd>
            <dt className="text-ink-muted">Assinatura</dt>
            <dd className="text-ink">
              {partner.subscription
                ? `${partner.subscription.plan} · ${SUBSCRIPTION_LABELS[partner.subscription.status] ?? partner.subscription.status} · até ${dateLabel(partner.subscription.currentPeriodEnd)}`
                : "Sem assinatura"}
            </dd>
          </dl>
          <Link href={`/lojas/${partner.slug}`} target="_blank" className="mt-3 inline-block text-sm font-semibold text-brand-blue hover:underline">
            Ver página pública da loja →
          </Link>
        </div>
      ) : (
        <div className="rounded-brand-lg border border-dashed border-border p-5 text-sm text-ink-muted">Pessoa física: não tem loja ou imobiliária cadastrada.</div>
      )}
    </section>
  );
}

function Stat({ label, value, detail }: { label: string; value: number; detail?: string }) {
  return (
    <div className="rounded-brand-lg border border-border bg-surface-raised p-4">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="font-display text-2xl font-semibold text-ink [font-variant-numeric:tabular-nums]">{value.toLocaleString("pt-BR")}</p>
      {detail && <p className="text-xs text-ink-muted">{detail}</p>}
    </div>
  );
}

function DeleteAccount({ profile }: { profile: AdminUserProfile }) {
  return (
    <section className="rounded-brand-lg border-2 border-status-danger/50 p-5">
      <h2 className="font-display text-lg font-semibold text-status-danger">Excluir conta</h2>
      <p className="mt-1 max-w-3xl text-sm text-ink">
        Apaga os dados pessoais (nome, e-mail, telefone, CPF, senha), favoritos, buscas salvas e o contato de marketing, e a pessoa perde o acesso na hora. Os
        anúncios sem pagamento são apagados; os que têm plano, destaque ou negócio de financiamento saem do ar e ficam guardados, porque registros financeiros
        precisam ser mantidos. Não dá para desfazer.
      </p>
      {profile.canDelete ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-status-danger">Quero excluir esta conta</summary>
          <form action={adminDeleteAccountForm.bind(null, profile.id)} className="mt-3 flex max-w-md flex-col gap-2">
            <textarea name="reason" required minLength={5} rows={2} placeholder="Motivo (fica registrado)" className="rounded-brand border border-border bg-surface-page px-3 py-2 text-sm text-ink" />
            <input name="password" type="password" required autoComplete="current-password" placeholder="Sua senha de administrador" className="rounded-brand border border-border bg-surface-page px-3 py-2 text-sm text-ink" />
            <button type="submit" className="rounded-brand bg-status-danger px-4 py-2 text-sm font-bold text-white hover:opacity-90">
              Excluir conta definitivamente
            </button>
          </form>
        </details>
      ) : (
        <p className="mt-3 rounded-brand bg-surface-sober px-3 py-2 text-sm text-ink">Não dá para excluir agora: {profile.deleteBlockedReason}</p>
      )}
      <p className="mt-3 text-xs text-ink-muted">
        Situações dos anúncios: {Object.entries(ADMIN_LISTING_STATUS_LABELS).map(([key, label]) => `${label} ${profile.stats.listingsByStatus.filter((row) => row.status === key).reduce((sum, row) => sum + row.count, 0)}`).join(" · ")}
      </p>
    </section>
  );
}

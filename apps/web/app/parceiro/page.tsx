import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { FormField, SelectField, TextAreaField } from "@/components/FormField";
import { PartnerNav } from "@/components/PartnerNav";
import { fetchMyPartner, resolveMediaUrl } from "@/lib/api";
import { createPartnerAction, uploadPartnerLogoAction } from "@/lib/actions/partners";

const PARTNER_TYPE_OPTIONS = [
  { value: "dealership", label: "Loja de veículos" },
  { value: "real_estate_agency", label: "Imobiliária" },
  { value: "broker", label: "Corretor(a) autônomo(a)" },
  { value: "workshop", label: "Oficina mecânica" },
];

const PARTNER_TYPE_LABEL: Record<string, string> = {
  dealership: "Loja de veículos",
  real_estate_agency: "Imobiliária",
  broker: "Corretor(a) autônomo(a)",
  workshop: "Oficina mecânica",
};

export default async function PartnerHomePage({ searchParams }: { searchParams: { error?: string } }) {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const partner = await fetchMyPartner(session.accessToken);

  if (!partner) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <h1 className="font-display text-2xl font-semibold text-ink">Torne-se um parceiro</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Cadastre sua loja de veículos, imobiliária ou atuação de corretor autônomo para ganhar um
          painel próprio: estoque, leads dos anúncios e uma vitrine pública.
        </p>

        {searchParams.error && (
          <p className="mt-4 rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
            {searchParams.error}
          </p>
        )}

        <form action={createPartnerAction} className="mt-6 flex flex-col gap-4">
          <SelectField label="Tipo" name="type" options={PARTNER_TYPE_OPTIONS} />
          <FormField label="Razão social / nome fantasia" name="legalName" placeholder="Autos Buritis Ltda" />
          <FormField label="CNPJ ou CPF" name="document" placeholder="00.000.000/0001-00" />
          <TextAreaField label="Descrição" name="description" required={false} />
          <FormField label="Endereço" name="address" required={false} />
          <Button type="submit" className="self-start">
            Cadastrar
          </Button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      {searchParams.error && (
        <p className="mb-6 rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
          {searchParams.error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {partner.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolveMediaUrl(partner.logoUrl)}
              alt={`Logo de ${partner.legalName}`}
              className="h-16 w-16 shrink-0 rounded-brand border border-border object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-brand border border-dashed border-border text-xs text-ink-muted">
              Sem logo
            </div>
          )}
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink">{partner.legalName}</h1>
            <p className="text-sm text-ink-muted">
              {PARTNER_TYPE_LABEL[partner.type] ?? partner.type} ·{" "}
              {partner.verified ? (
                <span className="font-semibold text-brand-green">Verificada</span>
              ) : (
                <span className="font-semibold text-brand-orange">Aguardando verificação</span>
              )}
            </p>
          </div>
        </div>
        <Link href={`/lojas/${partner.slug}`} className="text-sm font-semibold text-brand-blue hover:underline">
          Ver vitrine pública →
        </Link>
      </div>

      {partner.isOwner && (
        <form
          action={uploadPartnerLogoAction}
          encType="multipart/form-data"
          className="mt-4 flex flex-wrap items-center gap-3 rounded-brand border border-border bg-surface-raised p-3"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-ink">
              {partner.logoUrl ? "Trocar logo" : "Adicionar logo"}{" "}
              <span className="font-normal text-ink-muted">(JPEG, PNG ou WebP, até 5MB)</span>
            </span>
            <input
              type="file"
              name="logo"
              accept="image/jpeg,image/png,image/webp"
              required
              className="text-sm text-ink"
            />
          </label>
          <Button type="submit" variant="secondary" className="self-end">
            Enviar
          </Button>
        </form>
      )}

      <div className="mt-6">
        <PartnerNav active="geral" showEquipe={partner.isOwner} showServicos={partner.type === "workshop"} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Anúncios ativos" value={partner.stats.activeListings} />
        <StatCard label="Leads novos" value={partner.stats.leadsNew} tone="text-brand-orange" />
        <StatCard label="Vendidos este mês" value={partner.stats.soldThisMonth} tone="text-brand-blue" />
        <StatCardText label="Faturamento do mês" value={partner.stats.revenueThisMonthLabel} tone="text-brand-green" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total de anúncios" value={partner.stats.totalListings} />
        <StatCard label="Total vendido" value={partner.stats.soldTotal} tone="text-brand-blue" />
        <StatCardText
          label="Taxa de conversão de leads"
          value={partner.stats.conversionRatePercent !== undefined ? `${partner.stats.conversionRatePercent}%` : "—"}
        />
        <StatCardText label="Ticket médio" value={partner.stats.averageTicketLabel ?? "—"} />
      </div>

      <Link
        href="/parceiro/plano"
        className="mt-6 block rounded-brand border border-border bg-surface-raised p-4 hover:bg-surface-sober"
      >
        <p className="text-xs text-ink-muted">Plano</p>
        <p className="font-semibold text-ink">
          {partner.subscription
            ? `${partner.subscription.planName} · até ${partner.subscription.maxActiveListings} anúncios`
            : "Nenhum plano ativo ainda"}
        </p>
      </Link>
    </main>
  );
}

function StatCard({ label, value, tone = "text-ink" }: { label: string; value: number; tone?: string }) {
  return <StatCardText label={label} value={String(value)} tone={tone} />;
}

function StatCardText({ label, value, tone = "text-ink" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-brand border border-border bg-surface-raised p-4">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`text-2xl font-extrabold [font-variant-numeric:tabular-nums] ${tone}`}>{value}</p>
    </div>
  );
}

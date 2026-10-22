import Link from "next/link";
import { redirect } from "next/navigation";
import type { Icon } from "@phosphor-icons/react";
import { ArrowRight, CurrencyCircleDollar, Funnel, Package } from "@phosphor-icons/react/dist/ssr";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { FormField, SelectField, TextAreaField } from "@/components/FormField";
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

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DashboardPanel
          icon={Funnel}
          iconTone="text-brand-orange"
          title="CRM"
          headline={`${partner.stats.leadsTotal} lead${partner.stats.leadsTotal === 1 ? "" : "s"} recebido${partner.stats.leadsTotal === 1 ? "" : "s"}`}
          breakdown={[
            { label: "Novos", value: partner.stats.leadsNew },
            { label: "Negociando", value: partner.stats.leadsNegotiating },
            { label: "Ganhos", value: partner.stats.leadsWon },
          ]}
          ctaHref="/parceiro/leads"
          ctaLabel="Gerenciar leads"
        />
        <DashboardPanel
          icon={Package}
          iconTone="text-brand-blue"
          title="Estoque"
          headline={`${partner.stats.totalListings} anúncio${partner.stats.totalListings === 1 ? "" : "s"} no estoque`}
          breakdown={[
            { label: "Ativos", value: partner.stats.activeListings },
            { label: "Vendidos", value: partner.stats.soldTotal },
            {
              label: "Outros",
              value: Math.max(0, partner.stats.totalListings - partner.stats.activeListings - partner.stats.soldTotal),
            },
          ]}
          ctaHref="/parceiro/anuncios"
          ctaLabel="Consultar estoque"
        />
        <DashboardPanel
          icon={CurrencyCircleDollar}
          iconTone="text-brand-green"
          title="Vendas"
          headline={`${partner.stats.soldThisMonth} venda${partner.stats.soldThisMonth === 1 ? "" : "s"} este mês`}
          breakdownText={[
            { label: "Faturamento do mês", value: partner.stats.revenueThisMonthLabel },
            { label: "Ticket médio", value: partner.stats.averageTicketLabel ?? "—" },
            {
              label: "Conversão de leads",
              value: partner.stats.conversionRatePercent !== undefined ? `${partner.stats.conversionRatePercent}%` : "—",
            },
          ]}
          ctaHref="/parceiro/vendas"
          ctaLabel="Ver vendas"
        />
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
        {partner.offline && (
          <p className="mt-1 text-sm font-semibold text-status-danger">
            Período grátis encerrado: sua vitrine e seus anúncios estão fora do ar. Toque aqui para contratar um plano.
          </p>
        )}
        {!partner.offline && !partner.subscription && partner.trialEndsAt && new Date(partner.trialEndsAt) > new Date() && (
          <p className="mt-1 text-sm text-ink-muted">
            Período grátis, sem limite de anúncios, até{" "}
            {new Date(partner.trialEndsAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.
          </p>
        )}
        {partner.subscription?.status === "past_due" && (
          <p className="mt-1 text-sm font-semibold text-status-danger">
            O pagamento da renovação não passou — toque aqui para atualizar o cartão.
          </p>
        )}
      </Link>
    </main>
  );
}

// Painel no estilo "home" de CRM (número principal do módulo + detalhamento
// + atalho pra tela cheia) em vez de uma grade solta de cartõezinhos — cada
// módulo do painel do parceiro (CRM, Estoque, Vendas) vira um bloco só.
function DashboardPanel({
  icon: Icon,
  iconTone,
  title,
  headline,
  breakdown,
  breakdownText,
  ctaHref,
  ctaLabel,
}: {
  icon: Icon;
  iconTone: string;
  title: string;
  headline: string;
  breakdown?: { label: string; value: number }[];
  breakdownText?: { label: string; value: string }[];
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <div className="flex flex-col rounded-brand-lg border border-border bg-surface-raised p-5">
      <div className="flex items-center gap-2">
        <Icon size={20} weight="fill" className={iconTone} />
        <h3 className="font-display text-sm font-bold uppercase tracking-wide text-ink-muted">{title}</h3>
      </div>
      <p className="mt-3 text-xl font-extrabold text-ink [font-variant-numeric:tabular-nums]">{headline}</p>

      <dl className="mt-4 flex flex-col gap-1.5 text-sm">
        {breakdown?.map((item) => (
          <div key={item.label} className="flex items-center justify-between">
            <dt className="text-ink-muted">{item.label}</dt>
            <dd className="font-bold text-ink [font-variant-numeric:tabular-nums]">{item.value}</dd>
          </div>
        ))}
        {breakdownText?.map((item) => (
          <div key={item.label} className="flex items-center justify-between">
            <dt className="text-ink-muted">{item.label}</dt>
            <dd className="font-bold text-ink [font-variant-numeric:tabular-nums]">{item.value}</dd>
          </div>
        ))}
      </dl>

      <Link
        href={ctaHref}
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-brand-blue hover:underline"
      >
        {ctaLabel} <ArrowRight size={14} weight="bold" />
      </Link>
    </div>
  );
}

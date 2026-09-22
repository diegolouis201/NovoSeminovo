import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { FormField, SelectField, TextAreaField } from "@/components/FormField";
import { PartnerNav } from "@/components/PartnerNav";
import { fetchMyPartner } from "@/lib/api";
import { createPartnerAction } from "@/lib/actions/partners";

const PARTNER_TYPE_OPTIONS = [
  { value: "dealership", label: "Loja de veículos" },
  { value: "real_estate_agency", label: "Imobiliária" },
  { value: "broker", label: "Corretor(a) autônomo(a)" },
];

const PARTNER_TYPE_LABEL: Record<string, string> = {
  dealership: "Loja de veículos",
  real_estate_agency: "Imobiliária",
  broker: "Corretor(a) autônomo(a)",
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
      <div className="flex flex-wrap items-center justify-between gap-4">
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
        <Link href={`/lojas/${partner.slug}`} className="text-sm font-semibold text-brand-blue hover:underline">
          Ver vitrine pública →
        </Link>
      </div>

      <div className="mt-6">
        <PartnerNav active="geral" />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Anúncios ativos" value={partner.stats.activeListings} />
        <StatCard label="Total de anúncios" value={partner.stats.totalListings} />
        <StatCard label="Leads no total" value={partner.stats.leadsTotal} />
        <StatCard label="Leads novos" value={partner.stats.leadsNew} tone="text-brand-orange" />
      </div>

      <div className="mt-6 rounded-brand border border-border bg-surface-raised p-4">
        <p className="text-xs text-ink-muted">Plano</p>
        <p className="font-semibold text-ink">
          {partner.planName ?? "Nenhum plano ativo ainda"}
        </p>
      </div>
    </main>
  );
}

function StatCard({ label, value, tone = "text-ink" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-brand border border-border bg-surface-raised p-4">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`text-2xl font-extrabold [font-variant-numeric:tabular-nums] ${tone}`}>{value}</p>
    </div>
  );
}

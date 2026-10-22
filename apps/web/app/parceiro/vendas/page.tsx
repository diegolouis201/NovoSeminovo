import { redirect } from "next/navigation";
import { formatBRL } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { fetchMyPartner, fetchPartnerSales } from "@/lib/api";

const ASSET_TYPE_LABEL: Record<string, string> = {
  vehicle: "Veículo",
  property: "Imóvel",
};

export default async function PartnerSalesPage() {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const partner = await fetchMyPartner(session.accessToken);
  if (!partner) redirect("/parceiro");

  const sales = await fetchPartnerSales(session.accessToken);
  const revenueTotal = sales.reduce((sum, sale) => sum + sale.soldPriceValue, 0);
  const averageTicket = sales.length > 0 ? revenueTotal / sales.length : undefined;

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="font-display text-2xl font-semibold text-ink">{partner.legalName}</h1>

      <h2 className="mt-6 font-display text-xl font-semibold text-ink">Vendas</h2>
      <p className="text-sm text-ink-muted">
        Histórico de anúncios marcados como vendidos — ver "Marcar como vendido" em{" "}
        <span className="font-semibold">Anúncios</span>.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total de vendas" value={String(sales.length)} />
        <StatCard label="Faturamento total" value={formatBRL(revenueTotal)} />
        <StatCard label="Ticket médio" value={averageTicket !== undefined ? formatBRL(averageTicket) : "—"} />
      </div>

      {sales.length === 0 ? (
        <p className="mt-6 text-ink-muted">Nenhuma venda registrada ainda.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {sales.map((sale) => (
            <li
              key={sale.listingId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-brand border border-border bg-surface-raised p-4"
            >
              <div className="min-w-0">
                <p className="font-semibold text-ink">{sale.title}</p>
                <p className="text-sm text-ink-muted">
                  {ASSET_TYPE_LABEL[sale.assetType] ?? sale.assetType} · Anunciado por {sale.askingPriceLabel}
                  {sale.daysOnMarket !== undefined && ` · ${sale.daysOnMarket} dia${sale.daysOnMarket === 1 ? "" : "s"} em estoque`}
                </p>
              </div>
              <div className="text-right">
                <p className="font-extrabold text-brand-green">{sale.soldPriceLabel}</p>
                <p className="text-xs text-ink-muted">
                  {new Date(sale.soldAt).toLocaleDateString("pt-BR")}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-brand border border-border bg-surface-raised p-4">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="text-2xl font-extrabold text-ink [font-variant-numeric:tabular-nums]">{value}</p>
    </div>
  );
}

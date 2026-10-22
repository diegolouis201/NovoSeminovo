import { redirect } from "next/navigation";
import { formatBRL } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { fetchMyPartner, fetchPartnerSales } from "@/lib/api";
import { updateSaleAction } from "@/lib/actions/partners";

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
  // Lucro só das vendas com custo informado — sem custo não dá pra saber.
  const withCost = sales.filter((sale) => sale.profitValue !== undefined);
  const profitTotal = withCost.reduce((sum, sale) => sum + (sale.profitValue ?? 0), 0);
  const revenueWithCost = withCost.reduce((sum, sale) => sum + sale.soldPriceValue, 0);
  const margin = revenueWithCost > 0 ? (profitTotal / revenueWithCost) * 100 : undefined;

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="font-display text-2xl font-semibold text-ink">{partner.legalName}</h1>

      <h2 className="mt-6 font-display text-xl font-semibold text-ink">Vendas</h2>
      <p className="text-sm text-ink-muted">
        Anúncios marcados como vendidos (no Estoque ou no lead &quot;Vendido&quot;). Informe quanto cada um custou pra loja
        — compra + preparação — e veja o lucro de cada venda.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total de vendas" value={String(sales.length)} />
        <StatCard label="Faturamento total" value={formatBRL(revenueTotal)} />
        <StatCard
          label="Lucro"
          value={withCost.length > 0 ? formatBRL(profitTotal) : "—"}
          hint={
            withCost.length < sales.length
              ? `${sales.length - withCost.length} venda(s) sem custo informado`
              : margin !== undefined
                ? `margem de ${margin.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
                : undefined
          }
          tone={profitTotal < 0 ? "danger" : withCost.length > 0 ? "good" : undefined}
        />
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
                <p className="font-extrabold text-ink">{sale.soldPriceLabel}</p>
                {sale.profitValue !== undefined && (
                  <p className={`text-sm font-bold ${sale.profitValue < 0 ? "text-status-danger" : "text-brand-green"}`}>
                    Lucro {formatBRL(sale.profitValue)}
                    {sale.soldPriceValue > 0 &&
                      ` (${((sale.profitValue / sale.soldPriceValue) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)`}
                  </p>
                )}
                <p className="text-xs text-ink-muted">
                  {new Date(sale.soldAt).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <form
                action={updateSaleAction.bind(null, sale.listingId)}
                className="flex w-full flex-wrap items-end gap-2 border-t border-border pt-3"
              >
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-semibold text-ink-muted">Vendido por (R$)</span>
                  <input
                    name="soldPrice"
                    inputMode="numeric"
                    defaultValue={sale.soldPriceValue.toLocaleString("pt-BR")}
                    className="w-36 rounded-brand border border-border bg-surface-page px-2 py-1.5 text-sm text-ink"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-semibold text-ink-muted">Custo pra loja (compra + preparação)</span>
                  <input
                    name="costPrice"
                    inputMode="numeric"
                    defaultValue={sale.costPriceValue?.toLocaleString("pt-BR") ?? ""}
                    placeholder="Ex.: 82.000"
                    className="w-44 rounded-brand border border-border bg-surface-page px-2 py-1.5 text-sm text-ink"
                  />
                </label>
                <Button type="submit" variant="secondary" className="px-3 py-1.5 text-xs">
                  Salvar
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "danger";
}) {
  return (
    <div className="rounded-brand border border-border bg-surface-raised p-4">
      <p className="text-xs text-ink-muted">{label}</p>
      <p
        className={`text-2xl font-extrabold [font-variant-numeric:tabular-nums] ${
          tone === "good" ? "text-brand-green" : tone === "danger" ? "text-status-danger" : "text-ink"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

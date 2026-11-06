import Link from "next/link";
import { redirect } from "next/navigation";
import type { FinancingDeal } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { fetchFinancingDeals } from "@/lib/api";
import { markCommissionReceivedAction } from "@/lib/actions/financing-deals";

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const local = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return phone;
}

// Comissões de financiamento: o negócio nasce quando o lead vai para
// "Concluído" em /admin/financiamentos; aqui o admin marca quando o banco ou
// a Credihome pagou a comissão. A comissão fica toda com a empresa.
export default async function AdminFinancingCommissionsPage({ searchParams }: { searchParams: { error?: string } }) {
  const session = await auth();
  if (!session?.user) redirect("/entrar");
  if (session.user.role !== "admin") {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <h1 className="font-display text-2xl font-semibold text-ink">Acesso restrito</h1>
        <p className="mt-2 text-sm text-ink-muted">Esta área é só para administradores da plataforma.</p>
      </main>
    );
  }

  const [awaiting, received] = await Promise.all([
    fetchFinancingDeals("awaiting_commission", session.accessToken),
    fetchFinancingDeals("received", session.accessToken),
  ]);
  const total = (deals: FinancingDeal[]) => brl(deals.reduce((sum, deal) => sum + deal.commissionAmount, 0));

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <Link href="/admin" className="text-sm font-semibold text-brand-blue hover:underline">
        ← Moderação
      </Link>
      <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Comissões de financiamento</h1>
      <p className="text-sm text-ink-muted">
        Cada financiamento concluído em{" "}
        <Link href="/admin/financiamentos" className="font-semibold text-brand-blue hover:underline">
          Financiamentos
        </Link>{" "}
        aparece aqui com a comissão do banco. Quando o banco ou a Credihome pagar, marque &quot;Comissão recebida&quot; — ela entra
        no caixa e na receita do painel.
      </p>

      {searchParams.error && (
        <p className="mt-4 rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">{searchParams.error}</p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Stat label="Aguardando o banco pagar" value={total(awaiting)} count={awaiting.length} highlight />
        <Stat label="Comissão recebida" value={total(received)} count={received.length} />
      </div>

      <Section title="Aguardando o banco pagar a comissão" deals={awaiting} empty="Nenhum financiamento aguardando comissão." canReceive />
      <Section title="Comissão recebida" deals={received} empty="Nenhuma comissão recebida ainda." />
    </main>
  );
}

function Stat({ label, value, count, highlight = false }: { label: string; value: string; count: number; highlight?: boolean }) {
  return (
    <div className={`rounded-brand p-4 shadow-card ${highlight ? "bg-brand-green/10" : "bg-surface-raised"}`}>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="font-display text-xl font-semibold text-ink [font-variant-numeric:tabular-nums]">{value}</p>
      <p className="text-xs text-ink-muted">
        {count} {count === 1 ? "financiamento" : "financiamentos"}
      </p>
    </div>
  );
}

function Section({ title, deals, empty, canReceive = false }: { title: string; deals: FinancingDeal[]; empty: string; canReceive?: boolean }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-xl font-semibold text-ink">
        {title} <span className="text-base font-normal text-ink-muted">({deals.length})</span>
      </h2>
      {deals.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">{empty}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} canReceive={canReceive} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DealCard({ deal, canReceive }: { deal: FinancingDeal; canReceive: boolean }) {
  return (
    <li className="flex flex-col gap-3 rounded-brand border border-border bg-surface-raised p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="font-semibold text-ink">{deal.buyerName || "Registro antigo, sem cliente"}</p>
        <p className="text-xs text-ink-muted">{[deal.buyerPhone && formatPhone(deal.buyerPhone), deal.buyerEmail].filter(Boolean).join(" · ")}</p>
        {deal.listingId && (
          <Link href={`/anuncio/${deal.listingId}`} className="mt-1 block truncate text-xs font-semibold text-brand-blue hover:underline">
            {deal.listingTitle}
          </Link>
        )}
        <p className="mt-1 text-xs text-ink-muted">
          {deal.financingProvider} · financiado {deal.financedAmountLabel} · fechado em {new Date(deal.createdAt).toLocaleDateString("pt-BR")}
        </p>
        <p className="text-sm font-bold text-brand-green">
          Comissão {deal.commissionAmountLabel} <span className="text-xs font-normal text-ink-muted">({deal.commissionRateLabel} do financiado)</span>
        </p>
        {deal.commissionReceivedAt && (
          <p className="text-xs text-ink-muted">Recebida em {new Date(deal.commissionReceivedAt).toLocaleDateString("pt-BR")}</p>
        )}
      </div>
      {canReceive && (
        <form action={markCommissionReceivedAction.bind(null, deal.id)} className="flex shrink-0 flex-col gap-1 sm:w-56">
          <Button type="submit" variant="secondary">
            Comissão recebida
          </Button>
          <span className="text-[11px] text-ink-muted">Marque quando o banco ou a Credihome pagar você.</span>
        </form>
      )}
    </li>
  );
}

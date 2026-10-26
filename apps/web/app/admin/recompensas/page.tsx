import Link from "next/link";
import { redirect } from "next/navigation";
import { CASHBACK_DISCLAIMER, CASHBACK_PERCENT, type FinancingDeal } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { fetchFinancingDeals } from "@/lib/api";
import { markCommissionReceivedAction, markFinancingDealPaidAction } from "@/lib/actions/rebates";

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

function formatCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, "");
  return digits.length === 11 ? `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}` : cpf;
}

// Cashback no financiamento: quem contratou recebe CASHBACK_PERCENT da
// comissão bruta, só depois que o banco paga. O negócio nasce quando o lead
// vai para "Concluído" em /admin/financiamentos.
export default async function AdminCashbackPage({ searchParams }: { searchParams: { error?: string } }) {
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

  const [awaiting, toPay, paid] = await Promise.all([
    fetchFinancingDeals("awaiting_commission", session.accessToken),
    fetchFinancingDeals("to_pay", session.accessToken),
    fetchFinancingDeals("paid", session.accessToken),
  ]);
  const total = (deals: FinancingDeal[]) => brl(deals.reduce((sum, deal) => sum + deal.cashbackAmount, 0));

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <Link href="/admin" className="text-sm font-semibold text-brand-blue hover:underline">
        ← Moderação
      </Link>
      <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Cashback no financiamento</h1>
      <p className="text-sm text-ink-muted">
        Quem contrata o financiamento (carro ou imóvel) pelo NovoSeminovo recebe {CASHBACK_PERCENT}% da comissão bruta. O cashback
        nasce quando o interessado vai para &quot;Concluído&quot; em{" "}
        <Link href="/admin/financiamentos" className="font-semibold text-brand-blue hover:underline">
          Financiamentos
        </Link>
        . Quando o banco ou a Credihome pagar a comissão, marque &quot;Comissão recebida&quot;; depois do Pix no CPF do cliente,
        marque como pago. Nunca pague antes de receber.
      </p>

      {searchParams.error && (
        <p className="mt-4 rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">{searchParams.error}</p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Aguardando comissão do banco" value={total(awaiting)} count={awaiting.length} />
        <Stat label="Liberado — pagar agora" value={total(toPay)} count={toPay.length} highlight />
        <Stat label="Já pago" value={total(paid)} count={paid.length} />
      </div>

      <Section title="Liberado — pagar agora" deals={toPay} empty="Nenhum cashback liberado para pagar." mode="pay" />
      <Section
        title="Aguardando o banco pagar a comissão"
        deals={awaiting}
        empty="Nenhum financiamento aguardando comissão."
        mode="receive"
      />
      <Section title="Pagos" deals={paid} empty="Nenhum cashback pago ainda." mode="none" />

      <p className="mt-8 rounded-brand bg-surface-sober px-4 py-3 text-xs text-ink-muted">
        Texto mostrado ao cliente: {CASHBACK_DISCLAIMER}
      </p>
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

function Section({ title, deals, empty, mode }: { title: string; deals: FinancingDeal[]; empty: string; mode: "pay" | "receive" | "none" }) {
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
            <DealCard key={deal.id} deal={deal} mode={mode} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DealCard({ deal, mode }: { deal: FinancingDeal; mode: "pay" | "receive" | "none" }) {
  return (
    <li className="flex flex-col gap-3 rounded-brand border border-border bg-surface-raised p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="font-semibold text-ink">{deal.buyerName || "Registro antigo (antes do cashback), sem cliente"}</p>
        <p className="text-xs text-ink-muted">
          {[deal.buyerPhone && formatPhone(deal.buyerPhone), deal.buyerEmail].filter(Boolean).join(" · ")}
          {!deal.buyerLinked && " · sem conta no site"}
        </p>
        <p className="mt-1 text-xs">
          {deal.buyerCpf ? (
            <span className="text-ink">
              Pix no CPF: <strong className="[font-variant-numeric:tabular-nums]">{formatCpf(deal.buyerCpf)}</strong>
            </span>
          ) : (
            <span className="font-semibold text-status-danger">Sem CPF cadastrado — peça ao cliente antes do Pix.</span>
          )}
        </p>
        {deal.listingId && (
          <Link href={`/anuncio/${deal.listingId}`} className="mt-1 block truncate text-xs font-semibold text-brand-blue hover:underline">
            {deal.listingTitle}
          </Link>
        )}
        <p className="mt-1 text-xs text-ink-muted">
          {deal.financingProvider} · financiado {deal.financedAmountLabel} · comissão {deal.commissionAmountLabel} ({deal.commissionRateLabel})
        </p>
        <p className="text-sm font-bold text-brand-green">
          Cashback {deal.cashbackAmountLabel} <span className="text-xs font-normal text-ink-muted">({deal.cashbackPercentLabel} da comissão, bruto)</span>
        </p>
        {deal.commissionReceivedAt && (
          <p className="text-xs text-ink-muted">Comissão recebida em {new Date(deal.commissionReceivedAt).toLocaleDateString("pt-BR")}</p>
        )}
        {deal.paidAt && (
          <p className="text-xs text-ink-muted">
            Pago em {new Date(deal.paidAt).toLocaleDateString("pt-BR")}
            {deal.paidNote ? ` · ${deal.paidNote}` : ""}
          </p>
        )}
      </div>
      {mode === "receive" && (
        <form action={markCommissionReceivedAction.bind(null, deal.id)} className="flex shrink-0 flex-col gap-1 sm:w-56">
          <Button type="submit" variant="secondary">
            Comissão recebida
          </Button>
          <span className="text-[11px] text-ink-muted">Marque quando o banco ou a Credihome pagar você.</span>
        </form>
      )}
      {mode === "pay" && (
        <form action={markFinancingDealPaidAction.bind(null, deal.id)} className="flex shrink-0 flex-col gap-2 sm:w-56">
          <input
            name="note"
            placeholder="Nota (ex.: comprovante Pix, valor líquido)"
            className="rounded-brand border border-border bg-surface-page px-3 py-2 text-xs text-ink placeholder:text-ink-muted"
          />
          <Button type="submit" variant="primary">
            Marcar como pago
          </Button>
        </form>
      )}
    </li>
  );
}

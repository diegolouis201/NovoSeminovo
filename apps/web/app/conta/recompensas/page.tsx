import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkle } from "@phosphor-icons/react/dist/ssr";
import { auth } from "@/auth";
import { fetchMyRebates } from "@/lib/api";

export default async function MyRebatesPage() {
  const session = await auth();
  if (!session?.user) redirect("/entrar");

  const summary = await fetchMyRebates(session.accessToken!);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link href="/conta" className="text-sm font-semibold text-brand-blue hover:underline">
        ← Minha conta
      </Link>
      <h1 className="mt-2 flex items-center gap-2 font-display text-2xl font-semibold text-ink">
        <Sparkle size={22} weight="fill" className="text-brand-green" />
        Minhas recompensas
      </h1>
      <p className="mt-1 text-sm text-ink-muted">
        Quando o comprador de um anúncio seu fecha financiamento (imobiliário ou veicular) por um parceiro financeiro,
        você ganha uma parte da comissão de volta.
      </p>

      {!summary ? (
        <p className="mt-8 text-ink-muted">Não foi possível carregar suas recompensas agora. Tente de novo em instantes.</p>
      ) : (
        <>
          {summary.receiverType === "individual" ? (
            <div className="mt-6 rounded-brand border border-border bg-surface-raised p-5">
              <p className="text-sm font-semibold text-ink">Seu rebate: {summary.currentRebatePercentLabel} fixo</p>
              <p className="mt-1 text-sm text-ink-muted">
                Toda pessoa física que anuncia ganha essa fatia da comissão em todo financiamento fechado por
                indicação do seu anúncio.
              </p>
            </div>
          ) : (
            <div className="mt-6 flex flex-col gap-3 rounded-brand border border-border bg-surface-raised p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">
                  Nível atual: <span className="text-brand-green">{summary.currentTierName}</span>
                </p>
                <p className="text-lg font-extrabold text-ink">{summary.currentRebatePercentLabel}</p>
              </div>
              <p className="text-xs text-ink-muted">
                Volume financiado acumulado: {summary.cumulativeVolumeLabel}
              </p>
              {summary.nextTierName ? (
                <>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sober">
                    <div
                      className="h-full rounded-full bg-brand-green"
                      style={{ width: `${summary.progressToNextTierPct ?? 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-ink-muted">
                    Faltam negócios até <strong>{summary.nextTierMinVolumeLabel}</strong> financiados pra chegar no
                    nível {summary.nextTierName}.
                  </p>
                </>
              ) : (
                <p className="text-xs font-semibold text-brand-green">Você já está no nível máximo 🎉</p>
              )}
            </div>
          )}

          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="rounded-brand border border-border bg-surface-raised p-4 text-center">
              <p className="text-xs text-ink-muted">A receber</p>
              <p className="mt-1 text-xl font-extrabold text-ink">{summary.totalPendingLabel}</p>
            </div>
            <div className="rounded-brand border border-border bg-surface-raised p-4 text-center">
              <p className="text-xs text-ink-muted">Já recebido</p>
              <p className="mt-1 text-xl font-extrabold text-brand-green">{summary.totalPaidLabel}</p>
            </div>
          </div>

          <section className="mt-8">
            <h2 className="font-display text-lg font-semibold text-ink">Histórico</h2>
            {summary.deals.length === 0 ? (
              <p className="mt-3 text-ink-muted">
                Nenhum financiamento fechado por indicação sua ainda. Assim que acontecer, aparece aqui.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {summary.deals.map((deal) => (
                  <li
                    key={deal.id}
                    className="flex flex-col gap-1 rounded-brand border border-border bg-surface-raised p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <Link href={`/anuncio/${deal.listingId}`} className="font-semibold text-ink hover:underline">
                        {deal.listingTitle}
                      </Link>
                      <p className="text-xs text-ink-muted">
                        {deal.financingProvider} · financiado {deal.financedAmountLabel}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-bold text-ink">{deal.rebateAmountLabel}</p>
                      <p
                        className={`text-xs font-semibold ${
                          deal.status === "paid" ? "text-brand-green" : "text-brand-orange"
                        }`}
                      >
                        {deal.status === "paid" ? "Pago" : "A receber"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}

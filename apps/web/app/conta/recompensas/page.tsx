import Link from "next/link";
import { redirect } from "next/navigation";
import { CASHBACK_DISCLAIMER, CASHBACK_STAGE_LABELS } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { fetchMyCashback } from "@/lib/api";

export const metadata = { title: "Meu cashback" };

// Cashback de quem contratou financiamento pelo NovoSeminovo (ver
// RebatesService.myCashback na API).
export default async function MyCashbackPage() {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar?voltar=/conta/recompensas");
  const summary = await fetchMyCashback(session.accessToken);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/conta" className="text-sm font-semibold text-brand-blue hover:underline">
        ← Minha conta
      </Link>
      <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Meu cashback</h1>
      <p className="text-sm text-ink-muted">
        Contratou financiamento de carro ou imóvel pelo NovoSeminovo? Você recebe {summary?.percentLabel ?? "20%"} da nossa comissão
        de volta, por Pix no seu CPF.
      </p>

      {!summary ? (
        <p className="mt-6 rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">Não foi possível carregar agora.</p>
      ) : (
        <>
          {summary.cpfMissing && (
            <p className="mt-6 rounded-brand bg-brand-orange/10 px-4 py-3 text-sm text-ink">
              Cadastre seu CPF em{" "}
              <Link href="/conta/perfil" className="font-semibold text-brand-blue hover:underline">
                Meus dados
              </Link>{" "}
              — é a chave Pix para receber o cashback.
            </p>
          )}

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Total label="Aguardando o banco" value={summary.totalAwaitingLabel} />
            <Total label="Liberado para pagamento" value={summary.totalToPayLabel} />
            <Total label="Já recebido" value={summary.totalPaidLabel} />
          </div>
          <p className="mt-2 text-xs text-ink-muted">Valores brutos.</p>

          <section className="mt-8">
            <h2 className="font-display text-xl font-semibold text-ink">Meus financiamentos</h2>
            {summary.deals.length === 0 ? (
              <p className="mt-3 text-sm text-ink-muted">
                Nenhum financiamento fechado ainda. Simule nos anúncios de imóveis ou fale com o{" "}
                <Link href="/assistente-compra" className="font-semibold text-brand-blue hover:underline">
                  assistente de compra
                </Link>
                .
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {summary.deals.map((deal) => (
                  <li key={deal.id} className="rounded-brand border border-border bg-surface-raised p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">{deal.listingTitle ?? "Financiamento"}</p>
                        <p className="text-xs text-ink-muted">
                          {deal.financingProvider} · financiado {deal.financedAmountLabel} ·{" "}
                          {new Date(deal.createdAt).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-brand-green [font-variant-numeric:tabular-nums]">{deal.cashbackAmountLabel}</p>
                        <p className="text-[11px] text-ink-muted">cashback bruto</p>
                      </div>
                    </div>
                    <p
                      className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        deal.stage === "paid" ? "bg-brand-green text-on-green" : deal.stage === "to_pay" ? "bg-brand-orange text-on-orange" : "bg-surface-sober text-ink"
                      }`}
                    >
                      {CASHBACK_STAGE_LABELS[deal.stage]}
                      {deal.stage === "paid" && deal.paidAt ? ` em ${new Date(deal.paidAt).toLocaleDateString("pt-BR")}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <p className="mt-8 rounded-brand bg-surface-sober px-4 py-3 text-xs text-ink-muted">{CASHBACK_DISCLAIMER}</p>
    </main>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-brand bg-surface-raised p-4 shadow-card">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="font-display text-xl font-semibold text-ink [font-variant-numeric:tabular-nums]">{value}</p>
    </div>
  );
}

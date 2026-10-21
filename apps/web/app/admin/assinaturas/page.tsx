import Link from "next/link";
import { redirect } from "next/navigation";
import { PARTNER_TRIAL_DAYS, type SubscriptionBoardCard } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { SubscriptionBoard } from "@/components/SubscriptionBoard";
import { fetchSubscriptionBoard } from "@/lib/api";

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// "AAAA-MM" de uma data no horário de Brasília — pra contar o que mudou no mês.
function monthKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" })
    .format(date)
    .slice(0, 7);
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-brand bg-surface-raised p-4 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-1 text-xl font-extrabold text-ink [font-variant-numeric:tabular-nums]">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

function summarize(cards: SubscriptionBoardCard[]) {
  const paying = (column: SubscriptionBoardCard["column"]) =>
    cards.filter((card) => card.column === column && !card.simulated);
  const active = paying("active");
  const pastDue = paying("past_due");
  const thisMonth = monthKey(new Date());
  const changedThisMonth = (card: SubscriptionBoardCard) =>
    Boolean(card.statusChangedAt) && monthKey(new Date(card.statusChangedAt!)) === thisMonth;
  const byPlan = new Map<string, number>();
  for (const card of active) byPlan.set(card.planName ?? "—", (byPlan.get(card.planName ?? "—") ?? 0) + 1);
  return {
    mrr: active.reduce((total, card) => total + (card.priceMonth ?? 0), 0),
    activeCount: active.length,
    byPlan: [...byPlan.entries()].map(([name, count]) => `${count} ${name}`).join(" · "),
    pastDueCount: pastDue.length,
    pastDueValue: pastDue.reduce((total, card) => total + (card.priceMonth ?? 0), 0),
    newThisMonth: active.filter((card) => card.startedAt && monthKey(new Date(card.startedAt)) === thisMonth).length,
    canceledThisMonth: cards.filter((card) => card.column === "canceled" && changedThisMonth(card)).length,
    inTrial: cards.filter((card) => card.column === "trial").length,
    trialEndingSoon: cards.filter(
      (card) =>
        card.column === "trial" &&
        card.trialEndsAt &&
        new Date(card.trialEndsAt).getTime() - Date.now() <= 7 * 86_400_000,
    ).length,
    offline: cards.filter((card) => card.offline).length,
  };
}

export default async function AdminSubscriptionsPage() {
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

  const cards = await fetchSubscriptionBoard(session.accessToken);
  const stats = cards ? summarize(cards) : undefined;

  return (
    <main className="mx-auto max-w-7xl px-4 py-12">
      <Link href="/admin" className="text-sm font-semibold text-brand-blue hover:underline">
        ← Moderação
      </Link>
      <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Assinaturas dos parceiros</h1>
      <p className="text-sm text-ink-muted">
        Todas as lojas, imobiliárias e corretores cadastrados, na etapa do plano. Cada um tem {PARTNER_TRIAL_DAYS / 30}{" "}
        meses grátis sem limite a partir do cadastro; depois, sem plano, a vitrine e os anúncios saem do ar até assinar.
        Os cards mudam de coluna sozinhos (fim do período grátis e avisos do Stripe) — aqui você acompanha, chama no
        WhatsApp e anota.
      </p>

      {!cards || !stats ? (
        <p className="mt-6 rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
          Não foi possível carregar as assinaturas agora. Recarregue a página em instantes.
        </p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Receita mensal (MRR)"
              value={brl(stats.mrr)}
              hint={stats.activeCount > 0 ? `${stats.activeCount} ativo(s): ${stats.byPlan}` : "nenhuma assinatura paga ainda"}
            />
            <Stat
              label="Pagamento atrasado"
              value={String(stats.pastDueCount)}
              hint={stats.pastDueCount > 0 ? `${brl(stats.pastDueValue)}/mês em risco` : "tudo em dia"}
            />
            <Stat label="Novas no mês" value={String(stats.newThisMonth)} hint={`${stats.canceledThisMonth} cancelamento(s) no mês`} />
            <Stat
              label="Período grátis"
              value={String(stats.inTrial)}
              hint={`${stats.trialEndingSoon} termina(m) em até 7 dias · ${stats.offline} fora do ar`}
            />
          </div>

          <div className="mt-6">
            {cards.length === 0 ? (
              <p className="rounded-brand border border-dashed border-border px-4 py-8 text-center text-sm text-ink-muted">
                Nenhuma loja, imobiliária ou corretor cadastrado ainda.
              </p>
            ) : (
              <SubscriptionBoard cards={cards} />
            )}
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            A receita conta só assinaturas pagas pelo Stripe — as marcadas como “Simulação” foram ativadas sem cobrança e
            ficam de fora. O canto do card mostra há quantos dias ele está na etapa — no período grátis, quantos dias
            faltam. A loja recebe aviso 7 dias antes do fim.
          </p>
        </>
      )}
    </main>
  );
}

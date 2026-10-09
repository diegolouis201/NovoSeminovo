import { redirect } from "next/navigation";
import type { Plan } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { PartnerNav } from "@/components/PartnerNav";
import { fetchMyPartner, fetchPlans } from "@/lib/api";
import { cancelSubscriptionAction, subscribeToPlanAction } from "@/lib/actions/partners";

export default async function PartnerPlanPage({ searchParams }: { searchParams: { error?: string } }) {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const partner = await fetchMyPartner(session.accessToken);
  if (!partner) redirect("/parceiro");
  if (!partner.isOwner) redirect("/parceiro");

  const plans = await fetchPlans();

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-display text-2xl font-semibold text-ink">{partner.legalName}</h1>
      <div className="mt-6">
        <PartnerNav active="plano" showEquipe={partner.isOwner} />
      </div>

      <h2 className="mt-6 font-display text-xl font-semibold text-ink">Plano</h2>
      <p className="text-sm text-ink-muted">
        Contratar aqui não cobra nada de verdade — é uma simulação até a loja ligar um gateway de
        pagamento de verdade. O limite de anúncios do plano já vale pra criar anúncio novo.
      </p>

      {searchParams.error && (
        <p className="mt-4 rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
          {searchParams.error}
        </p>
      )}

      <div className="mt-6 rounded-brand border border-border bg-surface-raised p-4">
        {partner.subscription ? (
          <>
            <p className="text-xs text-ink-muted">Plano atual</p>
            <p className="font-semibold text-ink">
              {partner.subscription.planName} · {partner.subscription.priceLabel}/mês
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              Até {partner.subscription.maxActiveListings} anúncios · {partner.subscription.highlightCredits} destaque(s) ·
              renova em {new Date(partner.subscription.currentPeriodEnd).toLocaleDateString("pt-BR")}
            </p>
            <form action={cancelSubscriptionAction} className="mt-3">
              <Button type="submit" variant="ghost">
                Cancelar plano
              </Button>
            </form>
          </>
        ) : (
          <p className="text-ink-muted">Nenhum plano ativo ainda — escolha um abaixo.</p>
        )}
      </div>

      <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} isCurrent={partner.subscription?.planId === plan.id} />
        ))}
      </ul>
    </main>
  );
}

function PlanCard({ plan, isCurrent }: { plan: Plan; isCurrent: boolean }) {
  const action = subscribeToPlanAction.bind(null, plan.id);

  return (
    <li className="flex flex-col gap-2 rounded-brand border border-border bg-surface-raised p-4">
      <p className="font-display text-lg font-semibold text-ink">{plan.name}</p>
      <p className="text-2xl font-extrabold text-ink">
        {plan.priceLabel} <span className="text-sm font-normal text-ink-muted">/mês</span>
      </p>
      <p className="text-sm text-ink-muted">Até {plan.maxActiveListings} anúncios ativos</p>
      <p className="text-sm text-ink-muted">{plan.highlightCredits} destaque(s) na busca por mês</p>
      {isCurrent ? (
        <span className="mt-2 self-start rounded-full bg-brand-green/10 px-3 py-1 text-xs font-bold text-brand-green">
          Plano atual
        </span>
      ) : (
        <form action={action} className="mt-2">
          <Button type="submit" className="w-full justify-center">
            Contratar
          </Button>
        </form>
      )}
    </li>
  );
}

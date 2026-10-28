import { redirect } from "next/navigation";
import { allowedAssetTypes, type Partner, type Plan } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { fetchMyPartner, fetchPaymentsStatus, fetchPlans } from "@/lib/api";
import { COMPANY } from "@/lib/company";
import { isAppRequest } from "@/lib/app-context";
import {
  cancelSubscriptionAction,
  confirmCheckoutAction,
  openBillingPortalAction,
  startCheckoutAction,
  subscribeToPlanAction,
} from "@/lib/actions/partners";

export default async function PartnerPlanPage({
  searchParams,
}: {
  searchParams: { error?: string; checkout_session_id?: string; checkout?: string };
}) {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  // Voltou do Checkout do Stripe com sucesso — confirma e ativa antes de
  // renderizar qualquer coisa, depois redireciona pra URL limpa (ver
  // comentário em confirmCheckoutAction).
  if (searchParams.checkout_session_id) {
    await confirmCheckoutAction(searchParams.checkout_session_id);
  }

  const partner = await fetchMyPartner(session.accessToken);
  if (!partner) redirect("/parceiro");
  if (!partner.isOwner) redirect("/parceiro");

  // Dentro do app: só a situação do plano, sem preços nem botões de compra
  // (Apple e Google exigem o pagamento delas para isso; ver lib/app-context.ts).
  if (isAppRequest()) return <AppPlanStatus partner={partner} />;

  const audience = allowedAssetTypes(partner.type).includes("property") ? "property" : "vehicle";
  const [plans, paymentsStatus] = await Promise.all([fetchPlans(audience), fetchPaymentsStatus()]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-display text-2xl font-semibold text-ink">{partner.legalName}</h1>

      <h2 className="mt-6 font-display text-xl font-semibold text-ink">Plano</h2>
      <p className="text-sm text-ink-muted">
        {!paymentsStatus.stripeEnabled
          ? "Contratar aqui não cobra nada de verdade — é uma simulação até a loja ligar um gateway de pagamento de verdade. "
          : paymentsStatus.stripeTestMode
            ? "Contratar abre o checkout do Stripe (em modo de teste — nenhuma cobrança de verdade acontece). "
            : "O pagamento é feito com segurança pelo Stripe, no cartão de crédito, e renova todo mês. "}
        O limite de anúncios do plano já vale pra criar anúncio novo.
      </p>

      {searchParams.error && (
        <p className="mt-4 rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
          {searchParams.error}
        </p>
      )}
      {searchParams.checkout === "cancelado" && (
        <p className="mt-4 rounded-brand bg-surface-sober px-4 py-3 text-sm text-ink-muted">
          Checkout cancelado — nenhuma cobrança foi feita.
        </p>
      )}

      <TrialNotice partner={partner} />

      {partner.subscription?.status === "past_due" && (
        <div className="mt-4 rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
          <p className="font-semibold">Não conseguimos cobrar a renovação do seu plano.</p>
          <p className="mt-1">
            Seu plano continua valendo por enquanto e o cartão será cobrado de novo nos próximos dias. Atualize a forma de
            pagamento para não perder o plano.
          </p>
          {paymentsStatus.stripeEnabled && (
            <form action={openBillingPortalAction} className="mt-3">
              <Button type="submit">Atualizar cartão</Button>
            </form>
          )}
        </div>
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
            <div className="mt-3 flex flex-wrap gap-2">
              {paymentsStatus.stripeEnabled && (
                <form action={openBillingPortalAction}>
                  <Button type="submit" variant="ghost">
                    Cartão e faturas
                  </Button>
                </form>
              )}
              <form action={cancelSubscriptionAction}>
                <Button type="submit" variant="ghost">
                  Cancelar plano
                </Button>
              </form>
            </div>
          </>
        ) : (
          <p className="text-ink-muted">Nenhum plano ativo ainda — escolha um abaixo.</p>
        )}
      </div>

      <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isCurrent={partner.subscription?.planId === plan.id}
            stripeEnabled={paymentsStatus.stripeEnabled}
          />
        ))}
        {(
          <li className="flex flex-col gap-2 rounded-brand border border-dashed border-border bg-surface-raised p-4">
            <p className="font-display text-lg font-semibold text-ink">Enterprise</p>
            <p className="text-2xl font-extrabold text-ink">Sob consulta</p>
            <p className="text-sm text-ink-muted">
              Mais de {audience === "vehicle" ? 100 : 50} anúncios, {audience === "vehicle" ? "várias lojas" : "lançamentos, várias unidades"} ou condições especiais.
            </p>
            <a
              href={`${COMPANY.whatsappLink}?text=${encodeURIComponent(`Olá! Sou da ${partner.legalName} e quero saber do plano Enterprise.`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-auto rounded-brand border border-brand-green px-4 py-2.5 text-center text-sm font-bold text-brand-green hover:bg-brand-green/10"
            >
              Falar no WhatsApp
            </a>
          </li>
        )}
      </ul>
    </main>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// Período grátis (3 meses sem limite a partir do cadastro) e o que acontece
// depois — ver PARTNER_TRIAL_DAYS no shared-types.
function TrialNotice({ partner }: { partner: Partner }) {
  if (partner.offline) {
    return (
      <div className="mt-4 rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
        <p className="font-semibold">Sua vitrine e seus anúncios estão fora do ar.</p>
        <p className="mt-1">
          O período grátis terminou em {partner.trialEndsAt ? formatDate(partner.trialEndsAt) : "—"}. Nada foi apagado:
          contrate um plano abaixo e seus anúncios voltam ao ar na hora.
        </p>
      </div>
    );
  }
  if (!partner.trialEndsAt || new Date(partner.trialEndsAt) <= new Date()) return null;
  const daysLeft = Math.ceil((new Date(partner.trialEndsAt).getTime() - Date.now()) / 86_400_000);
  return (
    <div className="mt-4 rounded-brand border border-brand-blue/40 bg-brand-blue/10 px-4 py-3 text-sm text-ink">
      <p className="font-semibold">
        Período grátis até {formatDate(partner.trialEndsAt)} ({daysLeft} dia{daysLeft === 1 ? "" : "s"})
      </p>
      <p className="mt-1 text-ink-muted">
        Até lá, anuncie sem limite. Depois, para a vitrine e os anúncios continuarem no ar, é preciso ter um plano
        {partner.subscription ? " — o seu já está garantido." : "."}
      </p>
    </div>
  );
}

function PlanCard({ plan, isCurrent, stripeEnabled }: { plan: Plan; isCurrent: boolean; stripeEnabled: boolean }) {
  const action = (stripeEnabled ? startCheckoutAction : subscribeToPlanAction).bind(null, plan.id);

  return (
    <li className="flex flex-col gap-2 rounded-brand border border-border bg-surface-raised p-4">
      <p className="font-display text-lg font-semibold text-ink">{plan.name}</p>
      <p className="text-2xl font-extrabold text-ink">
        {plan.priceLabel} <span className="text-sm font-normal text-ink-muted">/mês</span>
      </p>
      <p className="text-sm text-ink-muted">Até {plan.maxActiveListings} anúncios no ar</p>
      <p className="text-sm text-ink-muted">
        {plan.highlightCredits > 0
          ? `${plan.highlightCredits} anúncio${plan.highlightCredits === 1 ? "" : "s"} em destaque`
          : "Sem destaques na busca"}
      </p>
      {(plan.superHighlightCredits ?? 0) > 0 && (
        <p className="text-sm text-ink-muted">
          {plan.superHighlightCredits} em super destaque (topo da busca)
        </p>
      )}
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

function AppPlanStatus({ partner }: { partner: Partner }) {
  const subscription = partner.subscription;
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-display text-2xl font-semibold text-ink">{partner.legalName}</h1>
      <h2 className="mt-6 font-display text-xl font-semibold text-ink">Plano</h2>
      <div className="mt-4 rounded-brand border border-border bg-surface-raised p-4">
        {subscription ? (
          <>
            <p className="text-xs text-ink-muted">Plano atual</p>
            <p className="font-semibold text-ink">{subscription.planName}</p>
            <p className="mt-1 text-sm text-ink-muted">
              Até {subscription.maxActiveListings} anúncios · {subscription.highlightCredits} destaque(s) · renova em{" "}
              {new Date(subscription.currentPeriodEnd).toLocaleDateString("pt-BR")}
            </p>
          </>
        ) : (
          <p className="text-ink-muted">Nenhum plano ativo.</p>
        )}
      </div>
    </main>
  );
}

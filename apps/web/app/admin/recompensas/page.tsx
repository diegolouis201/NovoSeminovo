import Link from "next/link";
import { redirect } from "next/navigation";
import type { FinancingDeal, RebateTier } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { FormField } from "@/components/FormField";
import { fetchFinancingDeals, fetchRebateTiers } from "@/lib/api";
import {
  markFinancingDealPaidAction,
  registerFinancingDealAction,
  updateRebateTierAction,
} from "@/lib/actions/rebates";

const PARTNER_TYPE_LABEL: Record<string, string> = {
  dealership: "Loja de veículos (lojista)",
  real_estate_agency: "Imobiliária",
  broker: "Corretor(a) autônomo(a)",
};

export default async function AdminRebatesPage({
  searchParams,
}: {
  searchParams: { error?: string; sucesso?: string };
}) {
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

  const [pending, paid, tiers] = await Promise.all([
    fetchFinancingDeals("registered", session.accessToken),
    fetchFinancingDeals("paid", session.accessToken),
    fetchRebateTiers(session.accessToken),
  ]);

  const tiersByPartnerType = tiers.reduce<Record<string, RebateTier[]>>((acc, tier) => {
    (acc[tier.partnerType] ??= []).push(tier);
    return acc;
  }, {});

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <Link href="/admin" className="text-sm font-semibold text-brand-blue hover:underline">
        ← Moderação
      </Link>
      <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Programa de recompensa por financiamento</h1>
      <p className="text-sm text-ink-muted">
        Quando o comprador de um anúncio fecha financiamento (imobiliário ou veicular) por um parceiro financeiro,
        parte da sua comissão volta pra quem anunciou. Registre aqui cada negócio fechado — o cálculo é automático.
      </p>

      {searchParams.error && (
        <p className="mt-4 rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">{searchParams.error}</p>
      )}
      {searchParams.sucesso && (
        <p className="mt-4 rounded-brand bg-brand-green/10 px-4 py-3 text-sm font-semibold text-brand-green">
          {searchParams.sucesso}
        </p>
      )}

      <section className="mt-8 rounded-brand border border-border bg-surface-raised p-5">
        <h2 className="font-display text-lg font-semibold text-ink">Registrar negócio fechado</h2>
        <form action={registerFinancingDealAction} className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <FormField
              label="ID ou link do anúncio"
              name="listingRef"
              placeholder="Ex.: cku... ou https://novoseminovo.com.br/anuncio/cku..."
            />
            <p className="text-xs text-ink-muted">
              Copie da barra de endereço quando estiver vendo o anúncio (<code>/anuncio/&lt;id&gt;</code>).
            </p>
          </div>
          <FormField
            label="Parceiro financeiro"
            name="financingProvider"
            placeholder="Ex.: Credihome by Loft"
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Valor do bem (R$)" name="assetValue" type="number" min={0} step={0.01} />
            <FormField label="Valor financiado (R$)" name="financedAmount" type="number" min={0} step={0.01} />
            <FormField
              label="Sua comissão (%)"
              name="commissionRate"
              type="number"
              min={0}
              step={0.01}
              required={false}
              defaultValue={1}
            />
          </div>
          <Button type="submit" className="self-start">
            Registrar negócio
          </Button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold text-ink">
          Pendentes de pagamento <span className="text-base font-normal text-ink-muted">({pending.length})</span>
        </h2>
        {pending.length === 0 ? (
          <p className="mt-3 text-ink-muted">Nenhum negócio esperando pagamento.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {pending.map((deal) => (
              <DealCard key={deal.id} deal={deal} showPayForm />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold text-ink">
          Histórico de pagos <span className="text-base font-normal text-ink-muted">({paid.length})</span>
        </h2>
        {paid.length === 0 ? (
          <p className="mt-3 text-ink-muted">Nenhum pagamento registrado ainda.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {paid.map((deal) => (
              <DealCard key={deal.id} deal={deal} />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold text-ink">Níveis de recompensa</h2>
        <p className="mt-1 text-sm text-ink-muted">
          PF recebe sempre 20% (fixo). Corretor/imobiliária e lojista evoluem de nível conforme o volume financiado
          acumulado — ajuste os números abaixo quando quiser, sem precisar de nenhum deploy.
        </p>
        <div className="mt-4 flex flex-col gap-6">
          {Object.entries(tiersByPartnerType).map(([partnerType, partnerTiers]) => (
            <div key={partnerType} className="rounded-brand border border-border bg-surface-raised p-4">
              <h3 className="font-semibold text-ink">{PARTNER_TYPE_LABEL[partnerType] ?? partnerType}</h3>
              <div className="mt-3 flex flex-col gap-3">
                {partnerTiers
                  .sort((a, b) => a.tierOrder - b.tierOrder)
                  .map((tier) => (
                    <TierRow key={tier.id} tier={tier} />
                  ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function DealCard({ deal, showPayForm = false }: { deal: FinancingDeal; showPayForm?: boolean }) {
  const action = markFinancingDealPaidAction.bind(null, deal.id);

  return (
    <li className="flex flex-col gap-3 rounded-brand border border-border bg-surface-raised p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <Link href={`/anuncio/${deal.listingId}`} className="font-semibold text-ink hover:underline">
          {deal.listingTitle}
        </Link>
        <p className="text-sm text-ink-muted">
          {deal.receiverLabel} · {deal.financingProvider}
        </p>
        <p className="text-xs text-ink-muted">
          Financiado {deal.financedAmountLabel} · comissão {deal.commissionAmountLabel} ({deal.commissionRateLabel}) ·
          rebate {deal.rebatePercentLabel}
        </p>
        <p className="text-sm font-bold text-brand-green">{deal.rebateAmountLabel}</p>
        {deal.paidAt && (
          <p className="text-xs text-ink-muted">
            Pago em {new Date(deal.paidAt).toLocaleDateString("pt-BR")}
            {deal.paidNote ? ` · ${deal.paidNote}` : ""}
          </p>
        )}
      </div>
      {showPayForm && (
        <form action={action} className="flex shrink-0 flex-col gap-2 sm:w-56">
          <input
            name="note"
            placeholder="Nota (opcional, ex.: comprovante Pix)"
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

function TierRow({ tier }: { tier: RebateTier }) {
  const action = updateRebateTierAction.bind(null, tier.id);

  return (
    <form action={action} className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
      <FormField label="Nome do nível" name="tierName" defaultValue={tier.tierName} required={false} />
      <FormField
        label="A partir de (R$ financiados)"
        name="minVolume"
        type="number"
        min={0}
        step={1}
        required={false}
        defaultValue={tier.minVolume}
      />
      <FormField
        label="Rebate (%)"
        name="rebatePercent"
        type="number"
        min={0}
        step={0.01}
        required={false}
        defaultValue={tier.rebatePercent}
      />
      <Button type="submit" variant="secondary">
        Salvar
      </Button>
    </form>
  );
}

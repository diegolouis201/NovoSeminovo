import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AFFILIATE_RULES, formatBRL, type AffiliateCommissionView, type AffiliateDashboard } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { fetchAffiliateDashboard } from "@/lib/api";
import { SITE_URL } from "@/lib/company";
import { AffiliateApplyForm } from "@/components/affiliates/AffiliateApplyForm";
import { CopyField } from "@/components/affiliates/CopyField";

export const metadata: Metadata = { title: "Painel do afiliado", robots: { index: false } };

const STATUS_LABEL: Record<AffiliateCommissionView["status"], string> = {
  pending: "Em análise",
  available: "Disponível",
  paid: "Pago",
  canceled: "Cancelado",
};

const STATUS_CLASS: Record<AffiliateCommissionView["status"], string> = {
  pending: "text-ink-muted",
  available: "text-brand-green",
  paid: "text-brand-blue",
  canceled: "text-status-danger",
};

function date(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default async function AffiliateDashboardPage() {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar?voltar=/afiliado");
  const affiliate = await fetchAffiliateDashboard(session.accessToken);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-1">
        <Link href="/afiliados" className="text-sm font-semibold text-brand-blue hover:underline">
          ← Como funciona o programa
        </Link>
        <h1 className="font-display text-3xl font-bold text-ink">Painel do afiliado</h1>
      </header>

      {affiliate === undefined && (
        <p className="rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
          Não foi possível carregar o painel agora. Tente de novo em instantes.
        </p>
      )}

      {affiliate === null && (
        <section className="flex max-w-2xl flex-col gap-4">
          <p className="text-ink-muted">
            Inscreva-se para ganhar {AFFILIATE_RULES.partnerSubscriptionRate}% das mensalidades das lojas e imobiliárias que você indicar (por{" "}
            {AFFILIATE_RULES.partnerSubscriptionMonths} meses) e {AFFILIATE_RULES.listingPlanRate}% dos planos de anúncio pagos. A equipe analisa a
            inscrição e libera o seu link.
          </p>
          <AffiliateApplyForm submitLabel="Enviar inscrição" />
        </section>
      )}

      {affiliate && affiliate.status !== "approved" && <PendingState affiliate={affiliate} />}
      {affiliate?.status === "approved" && <ApprovedState affiliate={affiliate} />}
    </main>
  );
}

function PendingState({ affiliate }: { affiliate: AffiliateDashboard }) {
  const text = {
    pending: "Sua inscrição está em análise. Você recebe uma notificação e um e-mail quando for aprovada — normalmente em poucos dias.",
    rejected: "Sua inscrição não foi aprovada.",
    suspended: "Sua conta de afiliado está suspensa. Fale com a gente pela página de contato.",
    approved: "",
  }[affiliate.status];
  return (
    <section className="flex max-w-2xl flex-col gap-4">
      <p className="rounded-brand-lg border border-border bg-surface-raised px-4 py-3 text-ink">
        {text}
        {affiliate.adminNote && <span className="mt-1 block text-sm text-ink-muted">Observação da equipe: {affiliate.adminNote}</span>}
      </p>
      {affiliate.status !== "suspended" && (
        <>
          <h2 className="font-display text-xl font-semibold text-ink">{affiliate.status === "rejected" ? "Enviar de novo" : "Seus dados"}</h2>
          <AffiliateApplyForm
            defaults={affiliate}
            submitLabel={affiliate.status === "rejected" ? "Enviar inscrição de novo" : "Atualizar dados"}
            showTerms={affiliate.status === "rejected"}
          />
        </>
      )}
    </section>
  );
}

function ApprovedState({ affiliate }: { affiliate: AffiliateDashboard }) {
  const link = `${SITE_URL}/?ref=${affiliate.code}`;
  const caption = `Vendendo ou comprando carro ou imóvel? Eu uso o NovoSeminovo: anúncios, chat e simulação de financiamento num lugar só. Cadastre-se pelo meu link: ${link} (ou use o código ${affiliate.code}) #publi`;
  const stats = [
    { label: "Cliques no link (30 dias)", value: affiliate.stats.clicks30d.toLocaleString("pt-BR") },
    { label: "Cadastros indicados", value: affiliate.stats.signups.toLocaleString("pt-BR") },
    { label: "Clientes que pagaram", value: affiliate.stats.payingCustomers.toLocaleString("pt-BR") },
  ];
  const money = [
    { label: "Em análise", value: affiliate.totals.pending, hint: `Libera ${AFFILIATE_RULES.holdDays} dias depois do pagamento do cliente` },
    { label: "Disponível", value: affiliate.totals.available, hint: `Pago por Pix a partir de ${formatBRL(AFFILIATE_RULES.minPayout)}` },
    { label: "Já recebido", value: affiliate.totals.paid, hint: "Total pago até hoje" },
  ];

  return (
    <>
      <section className="grid grid-cols-1 gap-4 rounded-brand-lg border border-border bg-surface-raised p-5 md:grid-cols-2">
        <CopyField label="Seu link" value={link} />
        <CopyField label="Seu código" value={affiliate.code} />
        <p className="text-xs text-ink-muted md:col-span-2">
          O link funciona em qualquer página do site (ex.: {SITE_URL}/imoveis?ref={affiliate.code}). Vale por {AFFILIATE_RULES.cookieDays} dias depois do clique.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-brand-lg border border-border bg-surface-raised p-4">
            <p className="text-sm text-ink-muted">{stat.label}</p>
            <p className="font-display text-3xl font-bold text-ink [font-variant-numeric:tabular-nums]">{stat.value}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold text-ink">Comissões</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {money.map((item) => (
            <div key={item.label} className="rounded-brand-lg bg-surface-sober p-4">
              <p className="text-sm font-semibold text-ink">{item.label}</p>
              <p className="font-display text-2xl font-bold text-ink [font-variant-numeric:tabular-nums]">{formatBRL(item.value)}</p>
              <p className="text-xs text-ink-muted">{item.hint}</p>
            </div>
          ))}
        </div>
        {affiliate.commissions.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Ainda não há comissões. Elas aparecem aqui quando alguém que você indicou paga uma mensalidade ou um plano de anúncio.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-brand-lg border border-border">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="bg-surface-sober text-xs uppercase text-ink-muted">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Origem</th>
                  <th className="px-3 py-2">Valor pago pelo cliente</th>
                  <th className="px-3 py-2">Sua comissão</th>
                  <th className="px-3 py-2">Situação</th>
                </tr>
              </thead>
              <tbody>
                {affiliate.commissions.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-3 py-2 [font-variant-numeric:tabular-nums]">{date(row.createdAt)}</td>
                    <td className="px-3 py-2">{row.description}</td>
                    <td className="px-3 py-2 [font-variant-numeric:tabular-nums]">{formatBRL(row.baseAmount)}</td>
                    <td className="px-3 py-2 font-semibold [font-variant-numeric:tabular-nums]">
                      {formatBRL(row.amount)} <span className="text-xs font-normal text-ink-muted">({row.rate}%)</span>
                    </td>
                    <td className={`px-3 py-2 font-semibold ${STATUS_CLASS[row.status]}`}>
                      {STATUS_LABEL[row.status]}
                      {row.status === "pending" && <span className="block text-xs font-normal text-ink-muted">libera em {date(row.availableAt)}</span>}
                      {row.status === "paid" && row.paidAt && <span className="block text-xs font-normal text-ink-muted">em {date(row.paidAt)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold text-ink">Material de divulgação</h2>
        <CopyField label="Legenda pronta (ajuste com o seu jeito)" value={caption} multiline />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-semibold text-ink">Logo oficial:</span>
          <a href="/marca/novoseminovo-logo-transparente.png" target="_blank" className="font-semibold text-brand-blue underline">
            PNG transparente
          </a>
          <a href="/marca/novoseminovo-logo.png" target="_blank" className="font-semibold text-brand-blue underline">
            PNG com fundo branco
          </a>
        </div>
        <p className="text-xs text-ink-muted">
          Sinalize a parceria nas publicações (#publi) e não use o nome NovoSeminovo em anúncios pagos. Veja as{" "}
          <Link href="/afiliados#regras" className="underline">
            regras
          </Link>
          .
        </p>
      </section>

      <section className="flex max-w-2xl flex-col gap-3">
        <h2 className="font-display text-xl font-semibold text-ink">Seus dados</h2>
        <AffiliateApplyForm defaults={affiliate} submitLabel="Salvar dados" showTerms={false} />
      </section>
    </>
  );
}

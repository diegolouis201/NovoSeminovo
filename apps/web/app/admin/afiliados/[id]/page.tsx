import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AFFILIATE_RULES, formatBRL, type AdminAffiliateDetail, type AffiliateCommissionView } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { fetchAdminAffiliateDetail } from "@/lib/api";
import { adminAffiliateActionAction, adminAffiliatePayoutAction } from "@/lib/actions/affiliates";

// Gestão de um afiliado: quem entrou pelo código, quanto cada indicado pagou
// e gerou de comissão, cliques por dia, comissões e pagamentos (Pix).

const STATUS_LABEL: Record<AdminAffiliateDetail["affiliate"]["status"], string> = {
  pending: "Aguardando aprovação",
  approved: "Ativo",
  rejected: "Recusado",
  suspended: "Suspenso",
};

const COMMISSION_STATUS: Record<AffiliateCommissionView["status"], { label: string; className: string }> = {
  pending: { label: "Em análise", className: "text-ink-muted" },
  available: { label: "A pagar", className: "text-brand-green" },
  paid: { label: "Pago", className: "text-brand-blue" },
  canceled: { label: "Cancelado", className: "text-status-danger" },
};

function date(iso?: string): string {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
}

export default async function AdminAffiliateDetailPage({ params, searchParams }: { params: { id: string }; searchParams: { error?: string; sucesso?: string } }) {
  const session = await auth();
  if (!session?.user) redirect("/entrar");
  if (session.user.role !== "admin") redirect("/admin");

  const detail = await fetchAdminAffiliateDetail(params.id, session.accessToken);
  if (!detail) notFound();
  const { affiliate, referrals, commissions, payouts, clicksByDay } = detail;
  const maxClicks = Math.max(1, ...clicksByDay.map((row) => row.count));
  const payingReferrals = referrals.filter((row) => row.revenue > 0).length;
  const conversion = affiliate.signups > 0 ? Math.round((payingReferrals / affiliate.signups) * 100) : 0;

  const cards = [
    { label: "Cliques (30 dias)", value: affiliate.clicks30d.toLocaleString("pt-BR"), hint: `${affiliate.clicksTotal.toLocaleString("pt-BR")} no total` },
    { label: "Cadastros indicados", value: affiliate.signups.toLocaleString("pt-BR"), hint: `${payingReferrals} pagaram (${conversion}%)` },
    { label: "Receita gerada", value: formatBRL(affiliate.revenue), hint: "Pago pelos indicados" },
    { label: "Em análise", value: formatBRL(affiliate.totals.pending), hint: `Libera após ${AFFILIATE_RULES.holdDays} dias` },
    { label: "A pagar", value: formatBRL(affiliate.totals.available), hint: `Pix mínimo ${formatBRL(AFFILIATE_RULES.minPayout)}` },
    { label: "Já pago", value: formatBRL(affiliate.totals.paid), hint: `${payouts.length} pagamento(s)` },
  ];

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12">
      <header className="flex flex-col gap-2">
        <Link href="/admin/afiliados" className="text-sm font-semibold text-brand-blue hover:underline">
          ← Todos os afiliados
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-display text-2xl font-semibold text-ink">{affiliate.name}</h1>
          <span className="rounded-full bg-surface-sober px-3 py-0.5 text-sm font-semibold text-ink">{affiliate.code}</span>
          <span className="text-sm text-ink-muted">{STATUS_LABEL[affiliate.status]}</span>
        </div>
        <p className="text-sm text-ink-muted">
          {affiliate.email} · Pix: <strong className="text-ink">{affiliate.pixKey}</strong> · inscrito em {date(affiliate.createdAt)}
          {affiliate.approvedAt && ` · aprovado em ${date(affiliate.approvedAt)}`}
        </p>
        <p className="whitespace-pre-wrap text-sm text-ink">
          <span className="text-ink-muted">Divulga em:</span> {affiliate.channels}
          {affiliate.audience && <span className="text-ink-muted"> · público: {affiliate.audience}</span>}
        </p>
      </header>

      {searchParams.error && <p className="rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">{searchParams.error}</p>}
      {searchParams.sucesso && <p className="rounded-brand bg-surface-sober px-4 py-3 text-sm text-ink">{searchParams.sucesso}</p>}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6" aria-label="Resumo do afiliado">
        {cards.map((card) => (
          <div key={card.label} className="rounded-brand-lg border border-border bg-surface-raised p-4">
            <p className="text-xs text-ink-muted">{card.label}</p>
            <p className="font-display text-xl font-bold text-ink [font-variant-numeric:tabular-nums]">{card.value}</p>
            <p className="text-xs text-ink-muted">{card.hint}</p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="rounded-brand-lg border border-border bg-surface-raised p-4">
          <h2 className="font-display text-lg font-semibold text-ink">Cliques no link — últimos 30 dias</h2>
          <div className="mt-3 flex h-32 items-end gap-[3px]" role="img" aria-label={`Cliques por dia nos últimos 30 dias, máximo de ${maxClicks} em um dia`}>
            {clicksByDay.map((row) => (
              <div key={row.day} className="flex h-full flex-1 flex-col justify-end" title={`${date(row.day + "T12:00:00")}: ${row.count} clique(s)`}>
                <div className="rounded-t-sm bg-brand-blue" style={{ height: `${row.count === 0 ? 2 : Math.max(6, (row.count / maxClicks) * 100)}%`, opacity: row.count === 0 ? 0.25 : 1 }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-xs text-ink-muted">
            <span>{date(clicksByDay[0]?.day + "T12:00:00")}</span>
            <span>máx. {maxClicks}/dia</span>
            <span>hoje</span>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-brand-lg border border-border bg-surface-raised p-4">
          <h2 className="font-display text-lg font-semibold text-ink">Pagar comissão</h2>
          {affiliate.totals.available > 0 ? (
            <>
              <p className="text-sm text-ink">
                Faça o Pix de <strong className="text-brand-green">{formatBRL(affiliate.totals.available)}</strong> para <strong>{affiliate.pixKey}</strong> e registre o comprovante.
              </p>
              <form action={adminAffiliatePayoutAction.bind(null, affiliate.id)} className="flex flex-col gap-2">
                <input type="hidden" name="voltar" value="detalhe" />
                <input name="note" required minLength={3} placeholder="Comprovante do Pix (id da transação)" className="rounded-brand border border-border bg-surface-page px-3 py-2 text-sm text-ink placeholder:text-ink-muted" />
                <Button type="submit" variant="primary" className="justify-center">
                  Registrar pagamento
                </Button>
              </form>
            </>
          ) : (
            <p className="text-sm text-ink-muted">Nada disponível para pagar agora.</p>
          )}
          <a href={`/admin/afiliados/${affiliate.id}/comissoes.csv`} className="text-sm font-semibold text-brand-blue hover:underline">
            Baixar comissões em planilha (CSV)
          </a>
          <form action={adminAffiliateActionAction.bind(null, affiliate.id)} className="border-t border-border pt-3">
            {affiliate.status === "approved" && (
              <button type="submit" name="action" value="suspend" className="text-sm font-semibold text-status-danger hover:underline">
                Suspender afiliado
              </button>
            )}
            {affiliate.status === "suspended" && (
              <button type="submit" name="action" value="reactivate" className="text-sm font-semibold text-brand-blue hover:underline">
                Reativar afiliado
              </button>
            )}
          </form>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold text-ink">
          Quem entrou pelo código <span className="text-base font-normal text-ink-muted">({referrals.length})</span>
        </h2>
        {referrals.length === 0 ? (
          <p className="text-sm text-ink-muted">Ninguém se cadastrou pelo link ou código ainda.</p>
        ) : (
          <div className="overflow-x-auto rounded-brand-lg border border-border">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-surface-sober text-xs uppercase text-ink-muted">
                <tr>
                  <th className="px-3 py-2">Cadastro</th>
                  <th className="px-3 py-2">Pessoa</th>
                  <th className="px-3 py-2">Conta</th>
                  <th className="px-3 py-2 text-right">Já pagou</th>
                  <th className="px-3 py-2 text-right">Comissão gerada</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((row) => (
                  <tr key={row.userId} className="border-t border-border align-top [font-variant-numeric:tabular-nums]">
                    <td className="px-3 py-2">{date(row.referredAt)}</td>
                    <td className="px-3 py-2">
                      <span className="block font-semibold text-ink">{row.name}</span>
                      <span className="text-xs text-ink-muted">{row.email}</span>
                    </td>
                    <td className="px-3 py-2">{row.account}</td>
                    <td className="px-3 py-2 text-right">{row.revenue > 0 ? formatBRL(row.revenue) : <span className="text-ink-muted">ainda não</span>}</td>
                    <td className="px-3 py-2 text-right font-semibold">{row.commission > 0 ? formatBRL(row.commission) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold text-ink">
          Comissões <span className="text-base font-normal text-ink-muted">({commissions.length})</span>
        </h2>
        {commissions.length === 0 ? (
          <p className="text-sm text-ink-muted">As comissões aparecem aqui quando um indicado paga mensalidade ou plano de anúncio.</p>
        ) : (
          <div className="overflow-x-auto rounded-brand-lg border border-border">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-surface-sober text-xs uppercase text-ink-muted">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Indicado</th>
                  <th className="px-3 py-2">Origem</th>
                  <th className="px-3 py-2 text-right">Valor pago</th>
                  <th className="px-3 py-2 text-right">Comissão</th>
                  <th className="px-3 py-2">Situação</th>
                </tr>
              </thead>
              <tbody>
                {commissions.map((row) => (
                  <tr key={row.id} className="border-t border-border align-top [font-variant-numeric:tabular-nums]">
                    <td className="px-3 py-2">{date(row.createdAt)}</td>
                    <td className="px-3 py-2">{row.referredName}</td>
                    <td className="px-3 py-2">{row.description}</td>
                    <td className="px-3 py-2 text-right">{formatBRL(row.baseAmount)}</td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {formatBRL(row.amount)} <span className="text-xs font-normal text-ink-muted">({row.rate}%)</span>
                    </td>
                    <td className={`px-3 py-2 font-semibold ${COMMISSION_STATUS[row.status].className}`}>
                      {COMMISSION_STATUS[row.status].label}
                      {row.status === "pending" && <span className="block text-xs font-normal text-ink-muted">libera em {date(row.availableAt)}</span>}
                      {row.status === "paid" && <span className="block text-xs font-normal text-ink-muted">em {date(row.paidAt)}{row.paidNote ? ` · ${row.paidNote}` : ""}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold text-ink">Pagamentos feitos</h2>
        {payouts.length === 0 ? (
          <p className="text-sm text-ink-muted">Nenhum Pix registrado ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {payouts.map((payout) => (
              <li key={`${payout.paidAt}-${payout.note}`} className="flex flex-wrap justify-between gap-2 rounded-brand border border-border bg-surface-raised px-4 py-2 text-sm">
                <span>
                  {date(payout.paidAt)} · <span className="text-ink-muted">{payout.note}</span>
                </span>
                <span className="font-semibold [font-variant-numeric:tabular-nums]">
                  {formatBRL(payout.amount)} <span className="font-normal text-ink-muted">({payout.count} comissão(ões))</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { AFFILIATE_RULES, formatBRL, type AdminAffiliateRow } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { fetchAdminAffiliates } from "@/lib/api";
import { adminAffiliateActionAction, adminAffiliatePayoutAction } from "@/lib/actions/affiliates";

const STATUS_LABEL: Record<AdminAffiliateRow["status"], string> = {
  pending: "Aguardando aprovação",
  approved: "Ativo",
  rejected: "Recusado",
  suspended: "Suspenso",
};

export default async function AdminAffiliatesPage({ searchParams }: { searchParams: { error?: string; sucesso?: string } }) {
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

  const affiliates = await fetchAdminAffiliates(session.accessToken);
  const pending = affiliates?.filter((row) => row.status === "pending") ?? [];
  const toPay = affiliates?.filter((row) => row.totals.available > 0) ?? [];
  const others = affiliates?.filter((row) => row.status !== "pending") ?? [];

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-12">
      <header>
        <Link href="/admin" className="text-sm font-semibold text-brand-blue hover:underline">
          ← Moderação
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Programa de afiliados</h1>
        <p className="text-sm text-ink-muted">
          {AFFILIATE_RULES.partnerSubscriptionRate}% das mensalidades de lojas/imobiliárias indicadas (por {AFFILIATE_RULES.partnerSubscriptionMonths}{" "}
          meses) e {AFFILIATE_RULES.listingPlanRate}% dos planos de anúncio. Comissão fica {AFFILIATE_RULES.holdDays} dias em análise antes de
          ficar disponível. <Link href="/afiliados" className="underline">Página pública do programa</Link>.
        </p>
      </header>

      {searchParams.error && <p className="rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">{searchParams.error}</p>}
      {searchParams.sucesso && <p className="rounded-brand bg-surface-sober px-4 py-3 text-sm text-ink">{searchParams.sucesso}</p>}
      {!affiliates && <p className="text-sm text-status-danger">Não foi possível carregar os afiliados agora.</p>}

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold text-ink">
          Inscrições para aprovar <span className="text-base font-normal text-ink-muted">({pending.length})</span>
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-ink-muted">Nenhuma inscrição esperando.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map((row) => (
              <li key={row.id} className="flex flex-col gap-3 rounded-brand border border-border bg-surface-raised p-4 sm:flex-row sm:items-start sm:justify-between">
                <AffiliateInfo row={row} />
                <form action={adminAffiliateActionAction.bind(null, row.id)} className="flex shrink-0 flex-col gap-2 sm:w-64">
                  <input name="note" placeholder="Observação (vai para o afiliado)" className="rounded-brand border border-border bg-surface-page px-3 py-2 text-xs text-ink placeholder:text-ink-muted" />
                  <div className="flex gap-2">
                    <Button type="submit" name="action" value="approve" variant="primary" className="flex-1 justify-center">
                      Aprovar
                    </Button>
                    <Button type="submit" name="action" value="reject" variant="ghost" className="flex-1 justify-center">
                      Recusar
                    </Button>
                  </div>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold text-ink">
          Comissões a pagar <span className="text-base font-normal text-ink-muted">({toPay.length})</span>
        </h2>
        <p className="text-sm text-ink-muted">
          Faça o Pix para a chave do afiliado e registre aqui com o comprovante — tudo o que está disponível passa para “pago”.
          {` Pagamento mínimo: ${formatBRL(AFFILIATE_RULES.minPayout)}.`}
        </p>
        {toPay.length === 0 ? (
          <p className="text-sm text-ink-muted">Nada disponível para pagar agora.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {toPay.map((row) => (
              <li key={row.id} className="flex flex-col gap-3 rounded-brand border border-border bg-surface-raised p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">
                    {row.name} · <span className="text-brand-green">{formatBRL(row.totals.available)}</span>
                  </p>
                  <p className="text-sm text-ink-muted">Pix: {row.pixKey}</p>
                  {row.totals.available < AFFILIATE_RULES.minPayout && (
                    <p className="text-xs text-ink-muted">Abaixo do mínimo de {formatBRL(AFFILIATE_RULES.minPayout)} — pode esperar acumular.</p>
                  )}
                </div>
                <form action={adminAffiliatePayoutAction.bind(null, row.id)} className="flex shrink-0 flex-col gap-2 sm:w-72">
                  <input name="note" required minLength={3} placeholder="Comprovante do Pix (id da transação)" className="rounded-brand border border-border bg-surface-page px-3 py-2 text-xs text-ink placeholder:text-ink-muted" />
                  <Button type="submit" variant="primary" className="justify-center">
                    Registrar pagamento
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold text-ink">
          Afiliados <span className="text-base font-normal text-ink-muted">({others.length})</span>
        </h2>
        {others.length === 0 ? (
          <p className="text-sm text-ink-muted">Nenhum afiliado ainda.</p>
        ) : (
          <div className="overflow-x-auto rounded-brand-lg border border-border">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-surface-sober text-xs uppercase text-ink-muted">
                <tr>
                  <th className="px-3 py-2">Afiliado</th>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Situação</th>
                  <th className="px-3 py-2">Cadastros</th>
                  <th className="px-3 py-2">Em análise</th>
                  <th className="px-3 py-2">Pago</th>
                  <th className="px-3 py-2">Ação</th>
                </tr>
              </thead>
              <tbody>
                {others.map((row) => (
                  <tr key={row.id} className="border-t border-border align-top">
                    <td className="px-3 py-2">
                      <span className="block font-semibold text-ink">{row.name}</span>
                      <span className="text-xs text-ink-muted">{row.email}</span>
                    </td>
                    <td className="px-3 py-2 font-semibold">{row.code}</td>
                    <td className="px-3 py-2">{STATUS_LABEL[row.status]}</td>
                    <td className="px-3 py-2 [font-variant-numeric:tabular-nums]">{row.signups}</td>
                    <td className="px-3 py-2 [font-variant-numeric:tabular-nums]">{formatBRL(row.totals.pending)}</td>
                    <td className="px-3 py-2 [font-variant-numeric:tabular-nums]">{formatBRL(row.totals.paid)}</td>
                    <td className="px-3 py-2">
                      <form action={adminAffiliateActionAction.bind(null, row.id)}>
                        {row.status === "approved" && (
                          <button type="submit" name="action" value="suspend" className="text-xs font-semibold text-status-danger hover:underline">
                            Suspender
                          </button>
                        )}
                        {(row.status === "suspended" || row.status === "rejected") && (
                          <button type="submit" name="action" value={row.status === "rejected" ? "approve" : "reactivate"} className="text-xs font-semibold text-brand-blue hover:underline">
                            {row.status === "rejected" ? "Aprovar" : "Reativar"}
                          </button>
                        )}
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function AffiliateInfo({ row }: { row: AdminAffiliateRow }) {
  return (
    <div className="min-w-0 text-sm">
      <p className="font-semibold text-ink">
        {row.name} <span className="font-normal text-ink-muted">· {row.email}</span>
      </p>
      <p className="mt-1 whitespace-pre-wrap text-ink">{row.channels}</p>
      {row.audience && <p className="text-ink-muted">Público: {row.audience}</p>}
      <p className="text-xs text-ink-muted">
        Código reservado: {row.code} · Pix: {row.pixKey} · inscrito em {new Date(row.createdAt).toLocaleDateString("pt-BR")}
      </p>
    </div>
  );
}

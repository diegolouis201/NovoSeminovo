import Link from "next/link";
import { ADMIN_LISTING_STATUS_LABELS, type AdminListingRow } from "@novoseminovo/shared-types";
import { adminDeleteListingForm, adminListingActionForm } from "@/lib/actions/admin-listings";
import { resolveMediaUrl } from "@/lib/api";

// Tabela de anúncios do admin: usada em /admin/anuncios e na página de cada pessoa/loja.
function statusTone(status: string): string {
  if (status === "active") return "bg-brand-green text-on-green";
  if (status === "pending_review") return "bg-brand-orange text-on-orange";
  if (status === "rejected") return "bg-status-danger text-white";
  return "bg-surface-sober text-ink";
}

function dateLabel(iso: string | undefined): string {
  return iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";
}

export function AdminListingsTable({ rows, returnTo }: { rows: AdminListingRow[]; returnTo: string }) {
  if (!rows.length) return <p className="rounded-brand-lg border border-border bg-surface-raised p-6 text-center text-sm text-ink-muted">Nenhum anúncio com esses filtros.</p>;
  return (
    <div className="overflow-x-auto rounded-brand-lg border border-border">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="bg-surface-sober text-xs uppercase text-ink-muted">
          <tr>
            <th className="px-3 py-2">Anúncio</th>
            <th className="px-3 py-2">Vendedor</th>
            <th className="px-3 py-2">Situação</th>
            <th className="px-3 py-2 text-right">Visitas</th>
            <th className="px-3 py-2 text-right">Conversas</th>
            <th className="px-3 py-2">Criado</th>
            <th className="px-3 py-2">Ação</th>
          </tr>
        </thead>
        <tbody className="[font-variant-numeric:tabular-nums]">
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-border align-top">
              <td className="px-3 py-3">
                <div className="flex gap-3">
                  {row.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={resolveMediaUrl(row.photoUrl)} alt="" className="h-14 w-20 shrink-0 rounded-brand object-cover" />
                  ) : (
                    <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-brand bg-surface-sober text-xs text-ink-muted">sem foto</div>
                  )}
                  <div className="min-w-0">
                    <Link href={`/anuncio/${row.id}`} target="_blank" className="line-clamp-2 font-semibold text-ink hover:text-brand-blue hover:underline">
                      {row.title}
                    </Link>
                    <p className="text-xs text-ink">
                      {row.priceLabel} · {row.location}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {row.photos} foto(s){row.highlighted ? " · em destaque" : ""}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-3 py-3">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${row.sellerType === "pj" ? "bg-brand-blue/10 text-brand-blue" : "bg-surface-sober text-ink"}`}>
                  {row.sellerType === "pj" ? "PJ" : "PF"}
                </span>
                {row.partnerName && (
                  <Link href={`/admin/usuarios/${row.ownerUserId}`} className="mt-1 block font-semibold text-ink hover:text-brand-blue hover:underline">
                    {row.partnerName}
                  </Link>
                )}
                <Link href={`/admin/usuarios/${row.ownerUserId}`} className="block text-ink hover:text-brand-blue hover:underline">
                  {row.ownerName}
                </Link>
                <p className="break-all text-xs text-ink-muted">{row.ownerEmail}</p>
              </td>
              <td className="px-3 py-3">
                <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${statusTone(row.status)}`}>{ADMIN_LISTING_STATUS_LABELS[row.status] ?? row.status}</span>
              </td>
              <td className="px-3 py-3 text-right text-ink">{row.views.toLocaleString("pt-BR")}</td>
              <td className="px-3 py-3 text-right text-ink">{row.leads}</td>
              <td className="px-3 py-3 text-ink-muted">
                {dateLabel(row.createdAt)}
                {row.publishedAt && <span className="block text-xs">no ar {dateLabel(row.publishedAt)}</span>}
              </td>
              <td className="w-56 px-3 py-3">
                <RowAction row={row} returnTo={returnTo} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RowAction({ row, returnTo }: { row: AdminListingRow; returnTo: string }) {
  return (
    <div className="flex flex-col gap-2">
      <StatusAction row={row} returnTo={returnTo} />
      <details>
        <summary className="cursor-pointer text-xs font-semibold text-ink-muted hover:text-status-danger">Excluir anúncio</summary>
        <form action={adminDeleteListingForm.bind(null, row.id, returnTo)} className="mt-2 flex flex-col gap-2 rounded-brand border border-status-danger/40 p-2">
          <p className="text-xs text-ink">Apaga o anúncio, as fotos e as conversas sobre ele. Não dá para desfazer. Anúncio com pagamento só pode ser suspenso.</p>
          <textarea name="reason" required minLength={5} rows={2} placeholder="Motivo (vai para o dono)" className="rounded-brand border border-border bg-surface-page px-2 py-1 text-xs text-ink" />
          <input name="password" type="password" required autoComplete="current-password" placeholder="Sua senha de administrador" className="rounded-brand border border-border bg-surface-page px-2 py-1 text-xs text-ink" />
          <button type="submit" className="rounded-brand bg-status-danger px-3 py-1.5 text-xs font-bold text-white hover:opacity-90">
            Excluir definitivamente
          </button>
        </form>
      </details>
    </div>
  );
}

function StatusAction({ row, returnTo }: { row: AdminListingRow; returnTo: string }) {
  const action = adminListingActionForm.bind(null, row.id, returnTo);
  if (row.status === "pending_review") {
    return (
      <Link href="/admin" className="text-xs font-semibold text-brand-blue hover:underline">
        Aprovar ou recusar na Moderação →
      </Link>
    );
  }
  if (row.status === "active") {
    return (
      <details>
        <summary className="cursor-pointer text-xs font-semibold text-status-danger">Suspender</summary>
        <form action={action} className="mt-2 flex flex-col gap-2">
          <textarea name="reason" required rows={2} placeholder="Motivo (vai para o dono)" className="rounded-brand border border-border bg-surface-page px-2 py-1 text-xs text-ink" />
          <button type="submit" name="action" value="suspend" className="rounded-brand bg-status-danger px-3 py-1.5 text-xs font-bold text-white hover:opacity-90">
            Confirmar suspensão
          </button>
        </form>
      </details>
    );
  }
  if (["paused", "rejected", "expired"].includes(row.status)) {
    return (
      <form action={action}>
        <button type="submit" name="action" value="reactivate" className="text-xs font-semibold text-brand-green hover:underline">
          Colocar de volta no ar
        </button>
      </form>
    );
  }
  return null;
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { ADMIN_LISTING_STATUS_LABELS, type AdminListingsPage } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { AdminListingsTable } from "@/components/admin/AdminListingsTable";
import { fetchAdminListings } from "@/lib/api";

export const dynamic = "force-dynamic";

type Params = { tipo?: string; vendedor?: string; situacao?: string; busca?: string; pagina?: string; sucesso?: string; erro?: string };

const ASSET_TABS = [
  { key: "vehicle", label: "Veículos" },
  { key: "property", label: "Imóveis" },
] as const;
const SELLER_TABS = [
  { key: "", label: "Todos os vendedores" },
  { key: "pf", label: "Pessoa física (PF)" },
  { key: "pj", label: "Pessoa jurídica (PJ)" },
] as const;
const STATUS_ORDER = ["active", "pending_review", "paused", "sold", "rejected", "expired", "draft"];



export default async function AdminListingsPageView({ searchParams }: { searchParams: Params }) {
  const session = await auth();
  if (!session?.user) redirect("/entrar");
  if (session.user.role !== "admin") redirect("/conta");

  const tipo = searchParams.tipo === "property" ? "property" : "vehicle";
  const vendedor = searchParams.vendedor === "pf" || searchParams.vendedor === "pj" ? searchParams.vendedor : "";
  const situacao = searchParams.situacao ?? "";
  const busca = searchParams.busca ?? "";
  const pagina = Math.max(1, Number(searchParams.pagina) || 1);
  const data = await fetchAdminListings({ tipo, vendedor, situacao, busca, pagina: String(pagina) }, session.accessToken);

  // Monta o link mantendo os filtros atuais e trocando só o que mudou.
  const href = (changes: Partial<Record<"tipo" | "vendedor" | "situacao" | "busca" | "pagina", string>>) => {
    const next = { tipo, vendedor, situacao, busca, pagina: "1", ...changes };
    const query = new URLSearchParams(Object.entries(next).filter(([key, value]) => value && !(key === "pagina" && value === "1")));
    return `/admin/anuncios?${query}`;
  };
  const currentQuery = new URLSearchParams(
    Object.entries({ tipo, vendedor, situacao, busca, pagina: String(pagina) }).filter(([, value]) => value),
  ).toString();

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-12">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <Link href="/admin" className="text-sm font-semibold text-brand-blue hover:underline">
            ← Moderação
          </Link>
          <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Todos os anúncios</h1>
          <p className="text-sm text-ink-muted">Anúncios de todos os usuários, separados por veículos e imóveis e por pessoa física ou jurídica.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/anunciar?tipo=vehicle" className="rounded-brand bg-brand-green px-4 py-2 text-sm font-bold text-on-green hover:opacity-90">
            + Novo veículo
          </Link>
          <Link href="/anunciar?tipo=property" className="rounded-brand bg-brand-blue px-4 py-2 text-sm font-bold text-on-blue hover:opacity-90">
            + Novo imóvel
          </Link>
        </div>
      </header>

      {searchParams.erro && <p className="rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">{searchParams.erro}</p>}
      {searchParams.sucesso && <p className="rounded-brand bg-surface-sober px-4 py-3 text-sm text-ink">{searchParams.sucesso}</p>}

      {!data ? (
        <p className="text-sm text-status-danger">Não foi possível carregar os anúncios agora. Tente de novo em instantes.</p>
      ) : (
        <>
          <nav className="flex flex-wrap gap-2" aria-label="Tipo de bem">
            {ASSET_TABS.map((tab) => (
              <Link
                key={tab.key}
                href={href({ tipo: tab.key, situacao: "" })}
                className={`rounded-full px-5 py-2 text-sm font-semibold ${tipo === tab.key ? "bg-brand-blue text-on-blue" : "bg-surface-sober text-ink hover:opacity-80"}`}
              >
                {tab.label} <span className="opacity-80">({total(data, { assetType: tab.key })})</span>
              </Link>
            ))}
          </nav>

          <nav className="flex flex-wrap gap-2" aria-label="Tipo de vendedor">
            {SELLER_TABS.map((tab) => (
              <Link
                key={tab.key || "todos"}
                href={href({ vendedor: tab.key })}
                className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${vendedor === tab.key ? "border-brand-blue bg-brand-blue/10 text-brand-blue" : "border-border text-ink hover:opacity-80"}`}
              >
                {tab.label} <span className="text-ink-muted">({total(data, { assetType: tipo, sellerType: tab.key || undefined })})</span>
              </Link>
            ))}
          </nav>

          <div className="flex flex-col gap-3 rounded-brand-lg border border-border bg-surface-raised p-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-1.5">
              <Link href={href({ situacao: "" })} className={chip(situacao === "")}>
                Todas ({total(data, { assetType: tipo, sellerType: vendedor || undefined })})
              </Link>
              {STATUS_ORDER.map((status) => {
                const count = total(data, { assetType: tipo, sellerType: vendedor || undefined, status });
                if (!count && situacao !== status) return null;
                return (
                  <Link key={status} href={href({ situacao: status })} className={chip(situacao === status)}>
                    {ADMIN_LISTING_STATUS_LABELS[status]} ({count})
                  </Link>
                );
              })}
            </div>
            <form action="/admin/anuncios" className="flex gap-2">
              <input type="hidden" name="tipo" value={tipo} />
              {vendedor && <input type="hidden" name="vendedor" value={vendedor} />}
              {situacao && <input type="hidden" name="situacao" value={situacao} />}
              <input
                name="busca"
                defaultValue={busca}
                placeholder="Título, cidade, dono, e-mail, loja ou ID"
                className="w-64 rounded-brand border border-border bg-surface-page px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
              />
              <button type="submit" className="rounded-brand bg-brand-blue px-4 py-2 text-sm font-bold text-on-blue hover:opacity-90">
                Buscar
              </button>
            </form>
          </div>

          <AdminListingsTable rows={data.items} returnTo={`/admin/anuncios?${currentQuery}`} />

          <Pagination data={data} href={href} />
        </>
      )}
    </main>
  );
}

function chip(active: boolean): string {
  return `rounded-full px-3 py-1 text-xs font-semibold ${active ? "bg-ink text-surface-page" : "bg-surface-sober text-ink hover:opacity-80"}`;
}

function total(data: AdminListingsPage, filter: { assetType: string; sellerType?: string; status?: string }): number {
  return data.counts
    .filter((row) => row.assetType === filter.assetType && (!filter.sellerType || row.sellerType === filter.sellerType) && (!filter.status || row.status === filter.status))
    .reduce((sum, row) => sum + row.count, 0);
}

function Pagination({ data, href }: { data: AdminListingsPage; href: (changes: { pagina: string }) => string }) {
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  if (pages <= 1) return <p className="text-xs text-ink-muted">{data.total} anúncio(s).</p>;
  return (
    <div className="flex items-center justify-between text-sm">
      <p className="text-xs text-ink-muted">
        {data.total} anúncio(s) · página {data.page} de {pages}
      </p>
      <div className="flex gap-2">
        {data.page > 1 && (
          <Link href={href({ pagina: String(data.page - 1) })} className="rounded-brand border border-border px-3 py-1.5 font-semibold text-ink hover:opacity-80">
            ← Anterior
          </Link>
        )}
        {data.page < pages && (
          <Link href={href({ pagina: String(data.page + 1) })} className="rounded-brand border border-border px-3 py-1.5 font-semibold text-ink hover:opacity-80">
            Próxima →
          </Link>
        )}
      </div>
    </div>
  );
}

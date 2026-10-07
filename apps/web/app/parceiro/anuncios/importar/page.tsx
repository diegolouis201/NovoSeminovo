import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { PartnerNav } from "@/components/PartnerNav";
import { fetchMyPartner } from "@/lib/api";
import { importListingsCsvAction, type ImportListingsSummary } from "@/lib/actions/listings";

export default async function ImportListingsPage({
  searchParams,
}: {
  searchParams: { error?: string; resultado?: string };
}) {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const partner = await fetchMyPartner(session.accessToken);
  if (!partner) redirect("/parceiro");

  const summary = parseSummary(searchParams.resultado);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-display text-2xl font-semibold text-ink">{partner.legalName}</h1>
      <div className="mt-6">
        <PartnerNav active="importar" showEquipe={partner.isOwner} />
      </div>

      <h2 className="mt-6 font-display text-xl font-semibold text-ink">Importar anúncios por CSV</h2>
      <p className="text-sm text-ink-muted">
        Cada linha do arquivo vira um anúncio novo, exatamente como preencher{" "}
        <Link href="/anunciar" className="font-semibold text-brand-blue">
          o formulário
        </Link>{" "}
        um por um: nasce aguardando aprovação da moderação. Baixe o modelo, preencha e envie de volta.
      </p>

      <a
        href="/modelo-anuncios.csv"
        download
        className="mt-3 inline-block text-sm font-semibold text-brand-blue hover:underline"
      >
        Baixar modelo CSV
      </a>

      {searchParams.error && (
        <p className="mt-4 rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
          {searchParams.error}
        </p>
      )}

      {summary && <ImportSummaryCard summary={summary} />}

      <form action={importListingsCsvAction} className="mt-6 flex flex-col gap-3 rounded-brand border border-border bg-surface-raised p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-ink">Arquivo CSV</span>
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            className="rounded-brand border border-border bg-surface-page px-3 py-2 text-ink"
          />
        </label>
        <Button type="submit" className="self-start">
          Importar
        </Button>
      </form>
    </main>
  );
}

function parseSummary(raw: string | undefined): ImportListingsSummary | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as ImportListingsSummary;
  } catch {
    return undefined;
  }
}

function ImportSummaryCard({ summary }: { summary: ImportListingsSummary }) {
  const failedCount = summary.total - summary.success;

  return (
    <div className="mt-4 rounded-brand border border-border bg-surface-raised p-4">
      <p className="font-semibold text-ink">
        {summary.success} de {summary.total} {summary.total === 1 ? "anúncio importado" : "anúncios importados"} com
        sucesso
        {failedCount > 0 && ` · ${failedCount} com erro`}
      </p>
      {summary.errors.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-sm">
          {summary.errors.map((error, index) => (
            <li key={index} className="text-status-danger">
              Linha {error.row}
              {error.title ? ` (${error.title})` : ""}: {error.error ?? "erro desconhecido"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

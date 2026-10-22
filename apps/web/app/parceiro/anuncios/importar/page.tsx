import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { ArrowsClockwise, Code, FileXls } from "@phosphor-icons/react/dist/ssr";
import { allowedAssetTypes } from "@novoseminovo/shared-types";
import { fetchIntegrationOverview, fetchMyPartner } from "@/lib/api";
import { importListingsCsvAction, type ImportListingsSummary } from "@/lib/actions/listings";

// "Anunciar em escala": os três jeitos de subir muitos anúncios de uma vez
// — integração com o CRM (feed sincronizado), API em tempo real e planilha.
// A integração e a API são configuradas em /parceiro/integracoes (só o dono).
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
  const overview = partner.isOwner ? await fetchIntegrationOverview(session.accessToken) : undefined;
  const sellsProperty = allowedAssetTypes(partner.type).includes("property");
  const model = sellsProperty
    ? { href: "/modelo-anuncios-imoveis.csv", label: "Baixar modelo de imóveis" }
    : { href: "/modelo-anuncios-veiculos.csv", label: "Baixar modelo de veículos" };
  // Imóvel: CRMs que geram o feed XML dos portais ZAP/VivaReal (mesma lista
  // de /parceiro/integracoes). Veículo: sem nomes até testar cada sistema.
  const crmExamples = sellsProperty
    ? "Jetimob, Vista, Kenlo/InGaia, Imoview, Tecimob, Univen e outros"
    : "o sistema que gera o catálogo do Facebook/Instagram da loja";

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="font-display text-2xl font-semibold text-ink">Anunciar em escala</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Três jeitos de colocar muitos anúncios de uma vez — escolha o que combina com a sua operação. Prefere um por um?{" "}
        <Link href="/anunciar" className="font-semibold text-brand-blue hover:underline">
          Novo anúncio
        </Link>
        .
      </p>

      {searchParams.error && (
        <p className="mt-4 rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">{searchParams.error}</p>
      )}

      <ul className="mt-6 grid gap-4 md:grid-cols-3">
        <li className="flex flex-col gap-2 rounded-brand border-2 border-brand-green bg-surface-raised p-5">
          <span className="self-start rounded-full bg-brand-green px-2 py-0.5 text-[11px] font-bold text-on-green">Recomendado</span>
          <ArrowsClockwise size={32} weight="duotone" className="text-brand-blue" />
          <h2 className="font-display text-lg font-semibold text-ink">Integração com seu CRM</h2>
          <p className="flex-1 text-sm text-ink-muted">
            Conecte o sistema de gestão que você já usa ({crmExamples}). O estoque entra e se atualiza sozinho: mudou preço ou foto
            no CRM, muda aqui; saiu de lá, pausa aqui.
          </p>
          {overview && (
            <p className="text-xs font-semibold text-ink">
              {overview.feeds.length} CRM conectado(s) · {overview.importedListings} anúncio(s) vindos do CRM
            </p>
          )}
          {partner.isOwner ? (
            <Link href="/parceiro/integracoes" className="mt-2 rounded-brand bg-brand-green px-4 py-2.5 text-center text-sm font-bold text-on-green hover:opacity-90">
              {overview?.feeds.length ? "Ver integração" : "Conectar meu CRM"}
            </Link>
          ) : (
            <p className="text-xs text-ink-muted">Só o dono da conta configura a integração.</p>
          )}
        </li>

        <li className="flex flex-col gap-2 rounded-brand border border-border bg-surface-raised p-5">
          <Code size={32} weight="duotone" className="text-brand-blue" />
          <h2 className="font-display text-lg font-semibold text-ink">API em tempo real</h2>
          <p className="flex-1 text-sm text-ink-muted">
            Para o seu CRM, site ou programador enviar cada alteração na hora: anúncio novo, preço, vendido. Você cria a chave e
            manda junto com a documentação.
          </p>
          {overview && <p className="text-xs font-semibold text-ink">{overview.apiKeys.length} chave(s) de API ativa(s)</p>}
          <div className="mt-2 flex flex-col gap-2">
            {partner.isOwner && (
              <Link href="/parceiro/integracoes#api" className="rounded-brand border border-brand-green px-4 py-2.5 text-center text-sm font-bold text-brand-green hover:bg-surface-sober">
                Criar chave de API
              </Link>
            )}
            <Link href="/integracoes/api" className="text-center text-sm font-semibold text-brand-blue hover:underline">
              Ver documentação
            </Link>
          </div>
        </li>

        <li className="flex flex-col gap-2 rounded-brand border border-border bg-surface-raised p-5">
          <FileXls size={32} weight="duotone" className="text-brand-blue" />
          <h2 className="font-display text-lg font-semibold text-ink">Planilha</h2>
          <p className="flex-1 text-sm text-ink-muted">
            Sem CRM? Preencha o modelo no Excel ou no Google Planilhas, salve como CSV e envie. Cada linha vira um anúncio.
          </p>
          <a href="#planilha" className="mt-2 rounded-brand border border-brand-green px-4 py-2.5 text-center text-sm font-bold text-brand-green hover:bg-surface-sober">
            Enviar planilha
          </a>
        </li>
      </ul>

      <section id="planilha" className="mt-10 scroll-mt-6">
        <h2 className="font-display text-xl font-semibold text-ink">Importar por planilha</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink">
          <li>
            <a href={model.href} download className="font-semibold text-brand-blue hover:underline">
              {model.label}
            </a>{" "}
            e abra no Excel ou no Google Planilhas.
          </li>
          <li>Apague as linhas de exemplo e preencha uma linha por anúncio (pode usar os nomes em português, como no modelo).</li>
          <li>
            Salve como <strong>CSV</strong> (no Excel: &quot;Salvar como&quot; → &quot;CSV&quot;; no Google: Arquivo → Fazer download → CSV) e envie abaixo.
          </li>
        </ol>
        <p className="mt-2 text-xs text-ink-muted">
          Preço pode ser escrito do jeito normal (650.000 ou 650000). Fotos você adiciona depois em cada anúncio — ou use a
          integração com o CRM, que já traz as fotos. {partner.verified ? "Sua conta é verificada: os anúncios entram no ar direto." : "Os anúncios passam pela aprovação antes de aparecer na busca."}
        </p>

        {summary && <ImportSummaryCard summary={summary} />}

        <form action={importListingsCsvAction} className="mt-4 flex flex-col gap-3 rounded-brand border border-border bg-surface-raised p-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-ink">Arquivo da planilha (.csv)</span>
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
      </section>
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

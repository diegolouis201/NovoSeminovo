import Link from "next/link";
import { redirect } from "next/navigation";
import type { IntegrationFeed } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { ApiKeyCreator } from "@/components/ApiKeyCreator";
import { Button } from "@/components/Button";
import { fetchIntegrationOverview, fetchMyPartner } from "@/lib/api";
import {
  createIntegrationFeedAction,
  deleteIntegrationFeedAction,
  revokePartnerApiKeyAction,
  syncIntegrationFeedAction,
} from "@/lib/actions/integrations";

const FORMAT_LABEL: Record<IntegrationFeed["format"], string> = {
  vrsync: "XML padrão ZAP/VivaReal (VRSync)",
  meta_vehicles: "Catálogo de veículos Facebook/Meta",
  novoseminovo_json: "JSON NovoSeminovo",
};

const STATUS: Record<IntegrationFeed["lastStatus"], { label: string; tone: string }> = {
  never: { label: "Aguardando", tone: "bg-surface-sober text-ink-muted" },
  running: { label: "Sincronizando…", tone: "bg-brand-blue text-on-blue" },
  ok: { label: "Funcionando", tone: "bg-brand-green text-on-green" },
  error: { label: "Com erro", tone: "bg-status-danger text-white" },
};

function formatDate(iso?: string): string {
  return iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
}

function FeedCard({ feed }: { feed: IntegrationFeed }) {
  const report = feed.lastReport;
  const status = STATUS[feed.lastStatus];
  return (
    <li className="rounded-brand bg-surface-raised p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{FORMAT_LABEL[feed.format]}</p>
          <p className="mt-1 break-all text-sm text-ink">{feed.url}</p>
          <p className="mt-1 text-xs text-ink-muted">
            Última sincronização: {formatDate(feed.lastSyncAt)} · {feed.listingsCount} anúncio(s) no ar vindos deste feed
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${status.tone}`}>{status.label}</span>
      </div>

      {feed.lastStatus === "error" && feed.lastError && (
        <p className="mt-3 rounded-brand bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{feed.lastError}</p>
      )}

      {report && feed.lastStatus !== "running" && (
        <div className="mt-3">
          <dl className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
            {[
              ["No feed", report.total],
              ["Novos", report.created],
              ["Atualizados", report.updated + report.reactivated],
              ["Sem mudança", report.unchanged],
              ["Pausados", report.paused],
              ["Com erro", report.errors.length],
            ].map(([label, value]) => (
              <div key={label} className="rounded-sober bg-surface-sober px-2 py-2">
                <dt className="text-[11px] text-ink-muted">{label}</dt>
                <dd className="text-base font-bold text-ink [font-variant-numeric:tabular-nums]">{value}</dd>
              </div>
            ))}
          </dl>
          {report.warnings.map((warning) => (
            <p key={warning} className="mt-2 text-sm text-ink">
              ⚠️ {warning}
            </p>
          ))}
          {report.errors.length > 0 && (
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer font-semibold text-ink">
                Ver {report.errors.length} anúncio(s) que não puderam ser importados
              </summary>
              <ul className="mt-2 flex flex-col gap-1">
                {report.errors.map((error) => (
                  <li key={error.externalId} className="text-ink-muted">
                    <span className="font-semibold text-ink">Código {error.externalId}:</span> {error.message}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-muted">Corrija esses dados no seu CRM — na próxima sincronização eles entram.</p>
            </details>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <form action={syncIntegrationFeedAction.bind(null, feed.id)}>
          <Button type="submit" variant="ghost" disabled={feed.lastStatus === "running"}>
            Sincronizar agora
          </Button>
        </form>
        <form action={deleteIntegrationFeedAction.bind(null, feed.id)}>
          <Button type="submit" variant="ghost">
            Remover feed
          </Button>
        </form>
      </div>
    </li>
  );
}

export default async function PartnerIntegrationsPage({
  searchParams,
}: {
  searchParams: { error?: string; sucesso?: string };
}) {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");
  const partner = await fetchMyPartner(session.accessToken);
  if (!partner) redirect("/parceiro");
  if (!partner.isOwner) redirect("/parceiro");

  const overview = await fetchIntegrationOverview(session.accessToken);
  const isRealEstate = partner.type === "real_estate_agency" || partner.type === "broker" || partner.type === "builder";

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/parceiro/anuncios/importar" className="text-sm font-semibold text-brand-blue hover:underline">
        ← Anunciar em escala
      </Link>
      <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Integração com seu CRM</h1>
      <p className="text-sm text-ink-muted">
        Conecte o sistema que você já usa e seus anúncios entram e se atualizam aqui sozinhos — sem cadastrar nada à
        mão. Mudou o preço ou as fotos no CRM? Atualiza aqui. Saiu do CRM? Pausa aqui. Voltou? Reativa.
      </p>

      {searchParams.error && (
        <p className="mt-4 rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">{searchParams.error}</p>
      )}
      {searchParams.sucesso && (
        <p className="mt-4 rounded-brand bg-brand-green/15 px-4 py-3 text-sm text-ink">{searchParams.sucesso}</p>
      )}

      {!overview ? (
        <p className="mt-6 text-sm text-ink-muted">Não foi possível carregar as integrações agora. Atualize a página.</p>
      ) : (
        <>
          <p className="mt-4 text-sm text-ink">
            <strong>{overview.importedListings}</strong> anúncio(s) do seu estoque vieram do CRM.
          </p>

          <section className="mt-8">
            <h3 className="font-display text-lg font-semibold text-ink">1. Link de feed do CRM (recomendado)</h3>
            <p className="mt-1 text-sm text-ink-muted">
              {isRealEstate
                ? "Quase todo CRM imobiliário (Jetimob, Vista, Kenlo/InGaia, Imoview, Tecimob, Univen, Code49 e outros) gera um link de “feed XML” para publicar nos portais ZAP Imóveis e VivaReal. Peça esse link ao seu CRM (ou procure em Integrações/Portais) e cole aqui."
                : "A maioria dos sistemas de loja de veículos gera um link de “catálogo de veículos” para anunciar o estoque no Facebook e Instagram (às vezes chamado de feed do Facebook, catálogo Meta ou feed do Google). Peça esse link ao suporte do seu sistema e cole aqui. Se ele não gera, use a API logo abaixo."}{" "}
              Sincronizamos a cada {overview.syncIntervalMinutes} minutos, e você pode sincronizar na hora quando quiser.
            </p>

            {overview.feeds.length > 0 && (
              <ul className="mt-4 flex flex-col gap-4">
                {overview.feeds.map((feed) => (
                  <FeedCard key={feed.id} feed={feed} />
                ))}
              </ul>
            )}

            <form action={createIntegrationFeedAction} className="mt-4 flex flex-col gap-3 rounded-brand border border-border bg-surface-raised p-4">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-ink">Link do feed</span>
                <input
                  name="url"
                  type="url"
                  required
                  placeholder="https://..."
                  className="rounded-brand border border-border bg-surface-page px-3 py-2 text-ink placeholder:text-ink-muted"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-ink">Formato</span>
                <select
                  name="format"
                  defaultValue={isRealEstate ? "vrsync" : "meta_vehicles"}
                  className="rounded-brand border border-border bg-surface-page px-3 py-2 text-ink"
                >
                  <option value="vrsync">XML padrão ZAP/VivaReal (VRSync) — imóveis</option>
                  <option value="meta_vehicles">Catálogo de veículos Facebook/Meta ou Google (XML ou CSV) — veículos</option>
                  <option value="novoseminovo_json">JSON NovoSeminovo — veículos e imóveis</option>
                </select>
              </label>
              <div>
                <Button type="submit">Conectar feed</Button>
              </div>
              <p className="text-xs text-ink-muted">
                {partner.verified
                  ? "Sua loja é verificada: os anúncios importados entram no ar direto."
                  : "Enquanto sua loja não for verificada, os anúncios novos passam pela aprovação do NovoSeminovo antes de aparecer na busca."}
              </p>
            </form>
          </section>

          <section id="api" className="mt-10 scroll-mt-6">
            <h3 className="font-display text-lg font-semibold text-ink">2. API em tempo real (para o seu CRM ou integrador)</h3>
            <p className="mt-1 text-sm text-ink-muted">
              Para atualização instantânea: seu sistema envia cada alteração na hora (novo anúncio, preço, vendido). Crie
              uma chave e envie para o suporte do seu CRM junto com a{" "}
              <Link href="/integracoes/api" className="font-semibold text-brand-blue hover:underline">
                documentação da API
              </Link>
              .
            </p>

            {overview.apiKeys.length > 0 && (
              <ul className="mt-4 flex flex-col gap-2">
                {overview.apiKeys.map((key) => (
                  <li
                    key={key.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-brand border border-border bg-surface-raised px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-ink">{key.name}</p>
                      <p className="text-xs text-ink-muted">
                        <code>{key.prefix}…</code> · criada em {formatDate(key.createdAt)} · último uso{" "}
                        {formatDate(key.lastUsedAt)}
                      </p>
                    </div>
                    <form action={revokePartnerApiKeyAction.bind(null, key.id)}>
                      <Button type="submit" variant="ghost">
                        Revogar
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 rounded-brand border border-border bg-surface-raised p-4">
              <ApiKeyCreator />
            </div>
          </section>

          <section className="mt-10">
            <h3 className="font-display text-lg font-semibold text-ink">3. Planilha</h3>
            <p className="mt-1 text-sm text-ink-muted">
              Sem CRM? Importe vários anúncios de uma vez por planilha em{" "}
              <Link href="/parceiro/anuncios/importar#planilha" className="font-semibold text-brand-blue hover:underline">
                Anunciar em escala → Planilha
              </Link>
              .
            </p>
          </section>

          <section className="mt-10">
            <h3 className="font-display text-lg font-semibold text-ink">4. Link de um anúncio</h3>
            <p className="mt-1 text-sm text-ink-muted">
              Tem um anúncio na OLX, Webmotors, ZAP, VivaReal ou outro site? Cole o link e o anúncio abre pronto no passo a passo, no
              padrão do NovoSeminovo — é só revisar e publicar.{" "}
              <Link href="/anunciar/importar" className="font-semibold text-brand-blue hover:underline">
                Importar pelo link →
              </Link>
            </p>
          </section>
        </>
      )}
    </main>
  );
}

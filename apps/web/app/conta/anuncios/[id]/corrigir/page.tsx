import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { SubmitButton } from "@/components/SubmitButton";
import { fetchListing, fetchListingModeration } from "@/lib/api";
import { resubmitListingAction } from "@/lib/actions/listings";

export const dynamic = "force-dynamic";

// Anúncio recusado: mostra o motivo, deixa corrigir texto e preço (fotos na
// página de fotos) e reenviar para a moderação — no máximo 3 vezes.
export default async function FixListingPage({ params, searchParams }: { params: { id: string }; searchParams: { erro?: string } }) {
  const session = await auth();
  if (!session?.user) redirect(`/entrar?voltar=/conta/anuncios/${params.id}/corrigir`);

  const [listing, moderation] = await Promise.all([
    fetchListing(params.id, session.accessToken),
    fetchListingModeration(params.id, session.accessToken),
  ]);
  if (!listing || !moderation) notFound();
  if (listing.ownerUserId !== session.user.id) redirect("/conta/anuncios");

  const action = resubmitListingAction.bind(null, listing.id);
  const field = "rounded-brand border border-border bg-surface-page px-3 py-2 text-ink";

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-12">
      <header>
        <Link href="/conta/anuncios" className="text-sm font-semibold text-brand-blue hover:underline">
          ← Meus anúncios
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Corrigir e reenviar</h1>
        <p className="text-sm text-ink-muted">{listing.title}</p>
      </header>

      {moderation.status !== "rejected" ? (
        <p className="rounded-brand bg-surface-sober px-4 py-3 text-sm text-ink">
          Este anúncio não está recusado, então não há nada para corrigir aqui.
        </p>
      ) : (
        <>
          <section className="rounded-brand border-2 border-status-danger/40 bg-status-danger/5 p-4">
            <h2 className="text-sm font-bold text-status-danger">Por que o anúncio foi recusado</h2>
            <p className="mt-1 text-sm text-ink">{moderation.reason ?? "O motivo não foi registrado. Fale com o suporte."}</p>
          </section>

          {searchParams.erro && (
            <p role="alert" className="rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
              {searchParams.erro}
            </p>
          )}

          {moderation.canResubmit ? (
            <form action={action} className="flex flex-col gap-4 rounded-brand border border-border bg-surface-raised p-4">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-ink">Título</span>
                <input name="title" defaultValue={listing.title} required minLength={5} maxLength={150} className={field} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-ink">Descrição</span>
                <textarea name="description" defaultValue={listing.description} required minLength={20} maxLength={10000} rows={8} className={field} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-ink">Preço (R$)</span>
                <input name="price" defaultValue={String(listing.price)} required inputMode="decimal" className={field} />
              </label>
              <p className="text-sm text-ink-muted">
                Precisa trocar fotos?{" "}
                <Link href={`/anuncio/${listing.id}/fotos`} className="font-semibold text-brand-blue hover:underline">
                  Gerenciar fotos
                </Link>{" "}
                antes de reenviar. O contato é sempre pelo site: não escreva telefone, e-mail ou links.
              </p>
              <SubmitButton pendingLabel="Reenviando...">Reenviar para análise</SubmitButton>
              <p className="text-xs text-ink-muted">
                Você pode reenviar mais {moderation.resubmitsLeft} {moderation.resubmitsLeft === 1 ? "vez" : "vezes"}. Se o anúncio tinha
                plano pago, ele continua valendo.
              </p>
            </form>
          ) : (
            <p className="rounded-brand bg-surface-sober px-4 py-3 text-sm text-ink">
              Este anúncio já foi reenviado 3 vezes. Fale com o suporte pelo{" "}
              <Link href="/contato" className="font-semibold text-brand-blue hover:underline">
                Contato
              </Link>
              .
            </p>
          )}
        </>
      )}
    </main>
  );
}

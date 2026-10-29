import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { ChatCircleDots, Info } from "@phosphor-icons/react/dist/ssr";
import { ArchitectStudio } from "@/components/architect/ArchitectStudio";
import { startConversationAction } from "@/lib/actions/conversations";
import { PUBLIC_API_URL, openArchitectSession } from "@/lib/api";

export const metadata: Metadata = {
  title: "Arquiteto NovoSeminovo",
  robots: { index: false },
};

// Só logado (pedido do Diego): sem sessão vai pro login e volta pra cá.
export default async function ArchitectPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.accessToken) redirect(`/entrar?voltar=${encodeURIComponent(`/anuncio/${params.id}/arquiteto`)}`);

  const opened = await openArchitectSession(params.id, session.accessToken);
  if (!opened.ok) {
    if (/não encontrado/i.test(opened.error)) notFound();
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <h1 className="font-display text-2xl font-semibold text-ink">Arquiteto NovoSeminovo</h1>
        <p className="mt-3 rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">{opened.error}</p>
        <Link href={`/anuncio/${params.id}`} className="mt-4 inline-block text-sm font-semibold text-brand-blue hover:underline">
          ← Voltar ao anúncio
        </Link>
      </main>
    );
  }

  const view = opened.value;
  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <Link href={`/anuncio/${view.listing.id}`} className="text-sm font-semibold text-brand-blue hover:underline print:hidden">
        ← {view.listing.title}
      </Link>
      <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Arquiteto NovoSeminovo</h1>
      <p className="mt-1 text-sm text-ink-muted print:hidden">
        Veja o potencial deste imóvel: converse sobre suas ideias de reforma, veja como os ambientes poderiam ficar e leve uma lista de compras com
        estimativa de custo. {view.listing.location} · {view.listing.priceLabel}
      </p>
      {/* Aviso pedido pelo Diego: deixar claro que é só inspiração. Também sai na impressão. */}
      <div role="note" className="mt-4 flex gap-3 rounded-brand border border-brand-orange bg-brand-orange/10 p-4 text-sm text-ink">
        <Info size={22} weight="fill" className="mt-0.5 shrink-0 text-brand-orange" />
        <p>
          <strong>Isto é só uma ideia.</strong> As imagens, sugestões e a lista de compras são criadas por inteligência artificial para inspirar, a partir
          das fotos do anúncio. Não levamos em consideração as medidas reais do imóvel, a estrutura nem as instalações, e os valores são estimativas.
          Antes de reformar ou comprar, confirme tudo com um profissional (arquiteto ou engenheiro) e meça o imóvel.
        </p>
      </div>
      {/* Quem se empolgou com a reforma já fala com o anunciante daqui. */}
      <div className="mt-4 flex flex-col gap-3 rounded-brand border border-brand-green bg-brand-green/10 p-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <p className="font-semibold text-ink">Gostou do potencial deste imóvel?</p>
          <p className="text-sm text-ink-muted">Fale com o anunciante para tirar dúvidas ou agendar uma visita.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <form action={startConversationAction.bind(null, view.listing.id)}>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-brand bg-brand-green px-4 py-2.5 text-sm font-bold text-on-green hover:opacity-90"
            >
              <ChatCircleDots size={18} weight="bold" /> Mandar mensagem ao anunciante
            </button>
          </form>
          <Link
            href={`/anuncio/${view.listing.id}`}
            className="inline-flex items-center rounded-brand border border-border bg-surface-raised px-4 py-2.5 text-sm font-bold text-ink hover:bg-surface-sober"
          >
            Ver anúncio e WhatsApp
          </Link>
        </div>
      </div>
      <div className="mt-6">
        <ArchitectStudio initial={view} apiBase={PUBLIC_API_URL} />
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { ArchitectStudio } from "@/components/architect/ArchitectStudio";
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
      <div className="mt-6">
        <ArchitectStudio initial={view} apiBase={PUBLIC_API_URL} />
      </div>
    </main>
  );
}

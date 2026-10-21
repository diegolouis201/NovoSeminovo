import Link from "next/link";
import { Car, House, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";

// Corpo comum das páginas "não encontrado" — sempre com um caminho de volta
// (busca + atalhos), porque quem cai aqui quase sempre veio de um link
// compartilhado de anúncio que já saiu do ar.
export function NotFoundContent({ title, message }: { title: string; message: string }) {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-16 text-center">
      <p className="font-display text-6xl font-bold text-brand-green">Ops!</p>
      <h1 className="mt-4 font-display text-2xl font-semibold text-ink">{title}</h1>
      <p className="mt-2 text-sm text-ink-muted">{message}</p>

      <form action="/busca" method="get" className="mt-8 flex w-full gap-2">
        <input
          name="q"
          placeholder="Busque um carro ou imóvel…"
          aria-label="Buscar"
          className="min-w-0 flex-1 rounded-brand border border-border bg-surface-raised px-4 py-3 text-base text-ink placeholder:text-ink-muted sm:text-sm"
        />
        <button
          type="submit"
          className="flex items-center gap-2 rounded-brand bg-brand-green px-4 py-3 text-sm font-bold text-on-green"
        >
          <MagnifyingGlass size={18} weight="bold" />
          Buscar
        </button>
      </form>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/carros" className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-sober">
          <Car size={18} weight="duotone" /> Ver carros
        </Link>
        <Link href="/imoveis" className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-sober">
          <House size={18} weight="duotone" /> Ver imóveis
        </Link>
        <Link href="/" className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-sober">
          Página inicial
        </Link>
      </div>
    </main>
  );
}

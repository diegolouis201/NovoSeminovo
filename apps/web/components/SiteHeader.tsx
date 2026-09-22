import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface-raised">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-3">
        <Link href="/" className="font-display text-xl font-bold text-ink">
          NovoSeminovo
        </Link>

        <nav className="flex items-center gap-1 rounded-full bg-surface-sober p-1">
          <Link
            href="/busca?assetType=vehicle"
            className="rounded-full px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-raised"
          >
            🚗 Carros
          </Link>
          <Link
            href="/busca?assetType=property"
            className="rounded-full px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-raised"
          >
            🏠 Imóveis
          </Link>
        </nav>

        <div className="flex items-center gap-3 text-sm font-semibold">
          <Link href="/anunciar" className="text-ink hover:text-brand-blue">
            Anunciar
          </Link>
          <Link
            href="/conta"
            className="rounded-brand bg-brand-green px-4 py-2 text-on-green hover:opacity-90"
          >
            Entrar
          </Link>
        </div>
      </div>
    </header>
  );
}

import Link from "next/link";
import { auth } from "@/auth";
import { fetchUnreadNotificationsCount } from "@/lib/api";

export async function SiteHeader() {
  const session = await auth();
  const unreadCount = session?.accessToken ? await fetchUnreadNotificationsCount(session.accessToken) : 0;

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
          {session?.user ? (
            <>
              <Link href="/conta/notificacoes" className="relative px-1 text-ink hover:text-brand-blue" aria-label="Notificações">
                🔔
                {unreadCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-danger px-1 text-[10px] font-bold text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Link>
              <Link
                href="/conta"
                className="rounded-brand bg-brand-green px-4 py-2 text-on-green hover:opacity-90"
              >
                {session.user.name?.split(" ")[0] ?? "Minha conta"}
              </Link>
            </>
          ) : (
            <Link
              href="/entrar"
              className="rounded-brand bg-brand-green px-4 py-2 text-on-green hover:opacity-90"
            >
              Entrar
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, MagnifyingGlass, PlusCircle, UserCircle } from "@phosphor-icons/react";

// Menu fixo embaixo, só dentro do app do celular (layout.tsx decide pelo
// user agent "NovoSeminovoApp"). Some no passo a passo de anunciar, que já
// tem a própria barra de "Continuar" no rodapé, e nos painéis de gestão.
const TABS = [
  { href: "/", label: "Início", icon: House, match: (path: string) => path === "/" },
  { href: "/busca", label: "Buscar", icon: MagnifyingGlass, match: (path: string) => /^\/(busca|carros|imoveis|anuncio|veiculo)/.test(path) },
  { href: "/anunciar", label: "Anunciar", icon: PlusCircle, match: (path: string) => path.startsWith("/anunciar") },
  { href: "/conta", label: "Conta", icon: UserCircle, match: (path: string) => /^\/(conta|entrar|cadastro)/.test(path) },
] as const;

export const HIDE_TAB_BAR_PREFIXES = ["/anunciar", "/admin", "/parceiro"];

export function AppTabBar() {
  const pathname = usePathname() ?? "/";
  if (HIDE_TAB_BAR_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;

  return (
    <nav
      aria-label="Menu do app"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface-raised pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-lg">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          const highlight = href === "/anunciar";
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${
                  highlight ? "text-brand-green" : active ? "text-brand-blue" : "text-ink-muted"
                }`}
              >
                <Icon size={24} weight={active || highlight ? "fill" : "regular"} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

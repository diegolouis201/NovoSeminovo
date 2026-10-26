"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell, List, X } from "@phosphor-icons/react/dist/ssr";
import { VerticalNav } from "@/components/VerticalNav";

// Menu de celular do cabeçalho (ver SiteHeader.tsx): em telas largas os links
// cabem numa linha só, mas em celular (Carros + Imóveis + Anunciar + sino +
// conta, tudo junto) não cabe e quebrava o layout. Esse botão de hambúrguer
// só aparece abaixo do breakpoint md (ver "md:hidden" em quem usa isso) e
// abre um painel com os mesmos links, um por linha.
export function MobileNav({
  userFirstName,
  unreadCount,
}: {
  userFirstName: string | null;
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        aria-expanded={open}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-surface-sober"
      >
        {open ? <X size={22} weight="bold" /> : <List size={22} weight="bold" />}
        {!open && unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-status-danger" />
        )}
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full z-20 flex flex-col gap-1 border-b border-border bg-surface-raised px-4 py-3 shadow-sm">
          <VerticalNav variant="mobile" onNavigate={() => setOpen(false)} />
          {userFirstName ? (
            <>
              <Link
                href="/anunciar"
                onClick={() => setOpen(false)}
                className="rounded-brand px-3 py-2.5 text-sm font-semibold text-ink hover:bg-surface-sober"
              >
                Anunciar
              </Link>
              <Link
                href="/conta/notificacoes"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-brand px-3 py-2.5 text-sm font-semibold text-ink hover:bg-surface-sober"
              >
                <Bell size={18} weight="bold" />
                Notificações
                {unreadCount > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-status-danger px-1 text-[10px] font-bold text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Link>
              <Link
                href="/conta"
                onClick={() => setOpen(false)}
                className="mt-1 rounded-brand bg-brand-green px-3 py-2.5 text-center text-sm font-bold text-on-green"
              >
                {userFirstName}
              </Link>
            </>
          ) : (
            <Link
              href="/entrar"
              onClick={() => setOpen(false)}
              className="mt-1 rounded-brand bg-brand-green px-3 py-2.5 text-center text-sm font-bold text-on-green"
            >
              Entrar
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

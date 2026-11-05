"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bell,
  Buildings,
  CalendarCheck,
  ChartLineUp,
  CurrencyCircleDollar,
  Funnel,
  House,
  List,
  Ruler,
  SignOut,
  Star,
  UsersThree,
  X,
} from "@phosphor-icons/react";
import type { HubPermission } from "@novoseminovo/shared-types";

type Item = { href: string; label: string; icon: typeof House; need?: HubPermission; badge?: number };

export function Sidebar({ name, profile, permissions, badges, sair }: { name: string; profile: string; permissions: HubPermission[]; badges: Record<string, number>; sair: () => Promise<void> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const groups: { title?: string; items: Item[] }[] = [
    { items: [{ href: "/", label: "Início", icon: House, need: "crm.ver" }] },
    {
      title: "Vendas",
      items: [
        { href: "/vendas", label: "Dashboard de vendas", icon: ChartLineUp, need: "crm.ver" },
        { href: "/funil", label: "Funil", icon: Funnel, need: "crm.ver" },
        { href: "/empresas", label: "Empresas", icon: Buildings, need: "crm.ver" },
      ],
    },
    {
      title: "Relacionamento",
      items: [
        { href: "/avisos", label: "Avisos do dia", icon: Bell, need: "crm.ver", badge: badges.avisos },
        { href: "/regua", label: "Régua de relacionamento", icon: Ruler, need: "crm.ver", badge: badges.regua },
        { href: "/tarefas", label: "Tarefas e agenda", icon: CalendarCheck, need: "crm.ver", badge: badges.tarefas },
        { href: "/nps", label: "NPS", icon: Star, need: "crm.ver" },
      ],
    },
    { title: "Financeiro", items: [{ href: "/receitas", label: "Receitas", icon: CurrencyCircleDollar, need: "financeiro" }] },
    { title: "Administração", items: [{ href: "/equipe", label: "Equipe e acessos", icon: UsersThree, need: "equipe" }] },
  ];
  const can = (p?: HubPermission) => !p || permissions.includes(p);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  const nav = (
    <nav className="flex h-full flex-col gap-5 overflow-y-auto px-3 py-5">
      <Link href="/" className="flex items-center gap-2 px-2" onClick={() => setOpen(false)}>
        <img src="/logo.png" alt="NovoSeminovo" className="h-12 w-auto rounded-lg bg-white p-1" />
        <span className="font-display text-lg font-semibold tracking-wide text-orange">HUB</span>
      </Link>
      {groups.map((g, i) => {
        const items = g.items.filter((it) => can(it.need));
        if (!items.length) return null;
        return (
          <div key={i}>
            {g.title ? <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-white/50">{g.title}</p> : null}
            {items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold ${active(it.href) ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"}`}
              >
                <it.icon size={20} weight={active(it.href) ? "fill" : "regular"} />
                <span className="flex-1">{it.label}</span>
                {it.badge ? <span className="rounded-full bg-orange px-2 text-xs text-white">{it.badge}</span> : null}
              </Link>
            ))}
          </div>
        );
      })}
      <div className="mt-auto border-t border-white/15 px-3 pt-4 text-sm text-white/80">
        <p className="font-semibold text-white">{name}</p>
        <p className="text-xs text-white/60">{profile}</p>
        <form action={sair}>
          <button className="mt-3 flex items-center gap-2 text-xs font-semibold text-white/80 hover:text-white">
            <SignOut size={16} /> Sair
          </button>
        </form>
      </div>
    </nav>
  );

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between bg-navy px-4 py-3 lg:hidden">
        <img src="/logo.png" alt="NovoSeminovo" className="h-9 w-auto rounded bg-white p-0.5" />
        <button aria-label="Abrir menu" onClick={() => setOpen(true)} className="text-white">
          <List size={28} />
        </button>
      </div>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 bg-navy lg:block">{nav}</aside>
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-navy">
            <button aria-label="Fechar menu" onClick={() => setOpen(false)} className="absolute right-3 top-3 text-white">
              <X size={24} />
            </button>
            {nav}
          </aside>
        </div>
      ) : null}
    </>
  );
}

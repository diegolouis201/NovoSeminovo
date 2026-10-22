"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell,
  CaretDown,
  Car,
  ChartLineUp,
  ChatCircleDots,
  CreditCard,
  FileCsv,
  Gauge,
  Gift,
  Globe,
  Heart,
  House,
  IdentificationCard,
  List,
  MagnifyingGlass,
  PlusCircle,
  ShieldCheck,
  SignOut,
  Storefront,
  UserGear,
  UsersThree,
  Wrench,
  X,
  type Icon,
} from "@phosphor-icons/react";

// Menu lateral do painel (particular e lojista/imobiliária), no molde dos
// painéis dos grandes portais: botão "Novo Anúncio" em destaque, menu, e
// contadores do plano/anúncios embaixo. No celular vira uma barra com botão
// de menu. Quem monta os itens por tipo de conta é DashboardShell (servidor).

const ICONS = {
  bell: Bell,
  car: Car,
  chart: ChartLineUp,
  chat: ChatCircleDots,
  card: CreditCard,
  csv: FileCsv,
  gauge: Gauge,
  gift: Gift,
  globe: Globe,
  heart: Heart,
  house: House,
  id: IdentificationCard,
  search: MagnifyingGlass,
  shield: ShieldCheck,
  store: Storefront,
  user: UserGear,
  team: UsersThree,
  wrench: Wrench,
} satisfies Record<string, Icon>;

export type SidebarIcon = keyof typeof ICONS;
export type SidebarItem = { href: string; label: string; icon: SidebarIcon };
export type SidebarCounter = { label: string; value: string; tone?: "default" | "good" | "warn" | "danger"; href?: string };
export type NewListingOption = { href: string; label: string; icon: SidebarIcon };

const TONE: Record<NonNullable<SidebarCounter["tone"]>, string> = {
  default: "text-on-blue",
  good: "rounded-full bg-brand-green px-2 text-on-green",
  warn: "rounded-full bg-brand-orange px-2 text-on-orange",
  danger: "rounded-full bg-surface-raised px-2 text-status-danger",
};

export function DashboardSidebar({
  name,
  accountLabel,
  items,
  counters,
  newListing,
  signOutAction,
}: {
  name: string;
  accountLabel: string;
  items: SidebarItem[];
  counters: SidebarCounter[];
  newListing: NewListingOption[];
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [chooser, setChooser] = useState(false);

  useEffect(() => {
    setOpen(false);
    setChooser(false);
  }, [pathname]);

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
  // Item ativo = o de prefixo mais longo que casa com a URL (pra
  // /parceiro/anuncios/importar não acender também "Estoque").
  const active = items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  const newButton =
    newListing.length === 1 ? (
      <Link
        href={newListing[0]!.href}
        className="flex w-full items-center justify-center gap-2 rounded-brand bg-brand-green px-4 py-3 text-sm font-bold text-on-green hover:opacity-90"
      >
        Novo anúncio <PlusCircle size={18} weight="fill" />
      </Link>
    ) : (
      <div>
        <button
          type="button"
          onClick={() => setChooser((value) => !value)}
          aria-expanded={chooser}
          className="flex w-full items-center justify-center gap-2 rounded-brand bg-brand-green px-4 py-3 text-sm font-bold text-on-green hover:opacity-90"
        >
          Novo anúncio <CaretDown size={16} weight="bold" className={chooser ? "rotate-180" : ""} />
        </button>
        {chooser && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {newListing.map((option) => {
              const OptionIcon = ICONS[option.icon];
              return (
                <Link
                  key={option.href}
                  href={option.href}
                  className="flex flex-col items-center gap-1 rounded-brand bg-black/15 px-3 py-3 text-sm font-semibold text-on-blue hover:bg-black/25"
                >
                  <OptionIcon size={26} weight="duotone" />
                  {option.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );

  const body = (
    <div className="flex h-full flex-col gap-5 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-orange font-bold text-on-orange">
          {initials || "?"}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold text-on-blue">{name}</span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-on-blue opacity-80">{accountLabel}</span>
        </span>
      </div>

      {newButton}

      <nav aria-label="Painel" className="flex flex-col gap-0.5">
        {items.map((item) => {
          const ItemIcon = ICONS[item.icon];
          const isActive = active === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center gap-3 rounded-brand px-3 py-2.5 text-sm font-semibold ${
                isActive ? "bg-black/20 text-on-blue" : "text-on-blue opacity-80 hover:bg-black/15 hover:opacity-100"
              }`}
            >
              <ItemIcon size={20} weight={isActive ? "fill" : "regular"} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {counters.length > 0 && (
        <ul className="flex flex-col gap-2">
          {counters.map((counter) => {
            const content = (
              <>
                <span className="text-on-blue opacity-80">{counter.label}</span>
                <strong className={`[font-variant-numeric:tabular-nums] ${TONE[counter.tone ?? "default"]}`}>{counter.value}</strong>
              </>
            );
            return (
              <li key={counter.label}>
                {counter.href ? (
                  <Link href={counter.href} className="flex items-center justify-between gap-2 rounded-brand border border-black/15 bg-black/10 px-3 py-2.5 text-sm hover:bg-black/15">
                    {content}
                  </Link>
                ) : (
                  <span className="flex items-center justify-between gap-2 rounded-brand border border-black/15 bg-black/10 px-3 py-2.5 text-sm">{content}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-auto flex flex-col gap-0.5 border-t border-black/15 pt-3">
        <Link href="/" className="flex items-center gap-3 rounded-brand px-3 py-2 text-sm text-on-blue opacity-80 hover:bg-black/15 hover:opacity-100">
          <Globe size={18} /> Ir para o site
        </Link>
        <form action={signOutAction}>
          <button type="submit" className="flex w-full items-center gap-3 rounded-brand px-3 py-2 text-left text-sm text-on-blue hover:bg-black/15">
            <SignOut size={18} /> Sair
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Celular: barra com o tipo de conta e botão de menu. */}
      <div className="flex items-center justify-between gap-3 bg-brand-blue px-4 py-3 md:hidden">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-on-blue">{name}</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-on-blue opacity-80">{accountLabel}</span>
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-brand bg-black/15 px-3 py-2 text-sm font-semibold text-on-blue"
          aria-expanded={open}
        >
          <List size={20} /> Menu
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu do painel">
          <button type="button" aria-label="Fechar menu" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/50" />
          <div className="absolute inset-y-0 left-0 w-[85%] max-w-xs overflow-y-auto bg-brand-blue">
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="absolute right-3 top-3 rounded-full p-1.5 text-on-blue opacity-80 hover:bg-black/15">
              <X size={20} />
            </button>
            {body}
          </div>
        </div>
      )}

      {/* Computador: coluna fixa à esquerda. */}
      <aside className="hidden w-64 shrink-0 md:block">
        <div className="sticky top-4 m-4 mr-0 min-h-[calc(100vh-8rem)] overflow-hidden rounded-brand-lg bg-brand-blue">{body}</div>
      </aside>
    </>
  );
}

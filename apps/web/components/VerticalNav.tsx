"use client";

import Link from "next/link";
import { Car, House } from "@phosphor-icons/react";
import { useActiveVertical } from "@/components/ActiveVertical";

// Botões Carros / Imóveis do topo (computador e menu do celular), com o da
// seção atual marcado.
export function VerticalNav({ variant, onNavigate }: { variant: "desktop" | "mobile"; onNavigate?: () => void }) {
  const active = useActiveVertical();
  const items = [
    { key: "vehicle", href: "/carros", label: "Carros", icon: Car },
    { key: "property", href: "/imoveis", label: "Imóveis", icon: House },
  ] as const;
  return (
    <>
      {items.map((item) => {
        const isActive = active === item.key;
        const base =
          variant === "desktop"
            ? "flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold"
            : "flex items-center gap-2 rounded-brand px-3 py-2.5 text-sm font-semibold";
        const tone = isActive ? "bg-brand-blue text-on-blue shadow-sm" : "text-ink hover:bg-surface-raised";
        return (
          <Link
            key={item.key}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={`${base} ${variant === "mobile" && !isActive ? "text-ink hover:bg-surface-sober" : tone}`}
          >
            <item.icon size={18} weight="bold" /> {item.label}
          </Link>
        );
      })}
    </>
  );
}

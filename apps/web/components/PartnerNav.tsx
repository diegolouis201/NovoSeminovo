import Link from "next/link";

const TABS = [
  { key: "geral", href: "/parceiro", label: "Visão geral" },
  { key: "anuncios", href: "/parceiro/anuncios", label: "Anúncios" },
  { key: "leads", href: "/parceiro/leads", label: "Leads" },
] as const;

export function PartnerNav({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav className="inline-flex gap-1 rounded-full bg-surface-sober p-1">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${
            active === tab.key ? "bg-brand-green text-on-green" : "text-ink"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

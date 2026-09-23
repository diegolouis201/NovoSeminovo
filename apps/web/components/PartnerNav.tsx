import Link from "next/link";

const TABS = [
  { key: "geral", href: "/parceiro", label: "Visão geral" },
  { key: "anuncios", href: "/parceiro/anuncios", label: "Anúncios" },
  { key: "leads", href: "/parceiro/leads", label: "Leads" },
  { key: "equipe", href: "/parceiro/equipe", label: "Equipe" },
] as const;

export function PartnerNav({
  active,
  showEquipe = true,
}: {
  active: (typeof TABS)[number]["key"];
  // Só o dono convida/remove gente da equipe — some pra quem entra como
  // agente (ver Partner.isOwner).
  showEquipe?: boolean;
}) {
  return (
    <nav className="inline-flex gap-1 rounded-full bg-surface-sober p-1">
      {TABS.filter((tab) => tab.key !== "equipe" || showEquipe).map((tab) => (
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

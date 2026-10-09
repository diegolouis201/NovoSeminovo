import Link from "next/link";

const TABS = [
  { key: "geral", href: "/parceiro", label: "Visão geral" },
  { key: "anuncios", href: "/parceiro/anuncios", label: "Anúncios" },
  { key: "importar", href: "/parceiro/anuncios/importar", label: "Importar CSV" },
  { key: "leads", href: "/parceiro/leads", label: "Leads" },
  { key: "plano", href: "/parceiro/plano", label: "Plano" },
  { key: "equipe", href: "/parceiro/equipe", label: "Equipe" },
] as const;

// Equipe e Plano são decisão do dono (ver Partner.isOwner) — um agente opera
// o resto do painel igual, mas essas duas abas somem pra ele.
const OWNER_ONLY_TABS = new Set(["equipe", "plano"]);

export function PartnerNav({
  active,
  showEquipe = true,
}: {
  active: (typeof TABS)[number]["key"];
  showEquipe?: boolean;
}) {
  return (
    <nav className="inline-flex gap-1 rounded-full bg-surface-sober p-1">
      {TABS.filter((tab) => !OWNER_ONLY_TABS.has(tab.key) || showEquipe).map((tab) => (
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

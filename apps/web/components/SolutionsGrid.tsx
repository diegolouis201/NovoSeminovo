import Link from "next/link";
import { BookmarkSimple, Heart, MegaphoneSimple, Storefront } from "@phosphor-icons/react/dist/ssr";

const SOLUTIONS = [
  {
    href: "/anunciar",
    label: "Anuncie seu carro ou imóvel",
    description: "Publique em minutos, sem enrolação.",
    icon: MegaphoneSimple,
    bg: "bg-brand-green/15",
    fg: "text-brand-green",
  },
  {
    href: "/para-lojas",
    label: "Vire um parceiro verificado",
    description: "Loja ou imobiliária com selo de confiança.",
    icon: Storefront,
    bg: "bg-brand-blue/15",
    fg: "text-brand-blue",
  },
  {
    href: "/conta/buscas-salvas",
    label: "Salve sua busca",
    description: "A gente avisa quando surgir um anúncio novo.",
    icon: BookmarkSimple,
    bg: "bg-brand-orange/15",
    fg: "text-brand-orange",
  },
  {
    href: "/conta/favoritos",
    label: "Seus favoritos",
    description: "Tudo que você curtiu, num lugar só.",
    icon: Heart,
    bg: "bg-brand-purple/15",
    fg: "text-brand-purple",
  },
];

export function SolutionsGrid() {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-2xl font-semibold text-ink">O que você precisa, a gente resolve</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {SOLUTIONS.map(({ href, label, description, icon: Icon, bg, fg }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col gap-3 rounded-brand border border-border bg-surface-raised p-5 shadow-card transition-transform hover:-translate-y-0.5"
          >
            <span className={`flex h-12 w-12 items-center justify-center rounded-full ${bg}`}>
              <Icon size={24} weight="bold" className={fg} />
            </span>
            <span className="font-display text-base font-semibold text-ink">{label}</span>
            <span className="text-sm text-ink-muted">{description}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

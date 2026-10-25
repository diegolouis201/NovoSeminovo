import Link from "next/link";
import { InstagramLogo, YoutubeLogo } from "@phosphor-icons/react/dist/ssr";
import { Logo } from "@/components/Logo";
import { NewsletterForm } from "@/components/NewsletterForm";
import { COMPANY, CORBAN } from "@/lib/company";

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "NovoSeminovo",
    links: [
      { href: "/quem-somos", label: "Quem somos" },
      { href: "/como-funciona", label: "Como funciona" },
      { href: "/perguntas-frequentes", label: "Perguntas frequentes" },
      { href: "/contato", label: "Contato" },
    ],
  },
  {
    title: "Para você",
    links: [
      { href: "/anunciar", label: "Anunciar grátis" },
      { href: "/assistente-compra", label: "Assistente de compra" },
      { href: "/consultar-veiculo", label: "Passaporte Digital do veículo" },
      { href: "/recompensas", label: "Recompensa por financiamento" },
      { href: "/afiliados", label: "Programa de afiliados" },
    ],
  },
  {
    title: "Para empresas",
    links: [
      { href: "/para-lojas", label: "Lojas, imobiliárias e corretores" },
      { href: "/parceiro", label: "Painel do parceiro" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacidade", label: "Política de Privacidade" },
      { href: "/termos", label: "Termos de Uso" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-surface-raised">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-[1.2fr_repeat(4,1fr)]">
        <div className="flex flex-col gap-3">
          <Logo variant="stacked" className="text-sm" />
          <p className="text-sm text-ink-muted">Carros e imóveis, sem enrolação.</p>
          <div className="flex gap-2">
            <Link
              href={COMPANY.instagram}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="NovoSeminovo no Instagram"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-ink transition-colors hover:border-brand-pink hover:text-brand-pink"
            >
              <InstagramLogo size={20} weight="bold" />
            </Link>
            <Link
              href={COMPANY.youtube}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="NovoSeminovo no YouTube"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-ink transition-colors hover:border-status-danger hover:text-status-danger"
            >
              <YoutubeLogo size={20} weight="bold" />
            </Link>
          </div>
        </div>

        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <h2 className="text-xs font-bold uppercase tracking-wide text-ink-muted">{column.title}</h2>
            <ul className="mt-3 space-y-2">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-ink hover:text-brand-blue hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-8">
        <div className="max-w-2xl">
          <NewsletterForm />
        </div>
      </div>

      <div className="border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-ink-muted">
          © {new Date().getFullYear()} {COMPANY.brand} · {COMPANY.legalName} · CNPJ {COMPANY.cnpj}
          <br />
          Financiamentos: correspondente bancário parceiro {CORBAN.brand} ({CORBAN.legalName}, CNPJ {CORBAN.cnpj}). O{" "}
          {COMPANY.brand} não é instituição financeira e não concede crédito.
        </p>
      </div>
    </footer>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ChatCircleDots, InstagramLogo, Storefront, WhatsappLogo } from "@phosphor-icons/react/dist/ssr";
import { PageHero, Section } from "@/components/marketing/PageHero";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = {
  title: "Contato",
  description: "Fale com o NovoSeminovo pelo WhatsApp, Instagram ou pelo assistente do site.",
  alternates: { canonical: "/contato" },
};

function wa(text: string): string {
  return `${COMPANY.whatsappLink}?text=${encodeURIComponent(text)}`;
}

const CHANNELS = [
  {
    icon: WhatsappLogo,
    title: "WhatsApp",
    text: `${COMPANY.whatsappDisplay} — dúvidas, anúncios e financiamento.`,
    href: wa("Olá! Vim pelo site do NovoSeminovo."),
    cta: "Chamar no WhatsApp",
  },
  {
    icon: Storefront,
    title: "Sou loja, imobiliária ou corretor",
    text: "Quer anunciar seu estoque e conhecer o painel do parceiro?",
    href: wa("Olá! Tenho uma loja/imobiliária e quero anunciar no NovoSeminovo."),
    cta: "Falar com a equipe comercial",
  },
  {
    icon: InstagramLogo,
    title: "Instagram",
    text: "@novoseminovooficial — novidades e anúncios em destaque.",
    href: "https://instagram.com/novoseminovooficial",
    cta: "Seguir no Instagram",
  },
];

export default function ContactPage() {
  return (
    <main className="pb-16">
      <PageHero eyebrow="Contato" title="Fale com a gente">
        Escolha o canal que preferir. Para buscar anúncios e simular financiamento a qualquer hora, use o assistente no
        canto da tela.
      </PageHero>

      <Section>
        <ul className="mt-2 grid gap-4 md:grid-cols-3">
          {CHANNELS.map(({ icon: Icon, title, text, href, cta }) => (
            <li key={title} className="flex flex-col rounded-brand bg-surface-raised p-5 shadow-card">
              <Icon size={30} weight="duotone" className="text-brand-green" />
              <h2 className="mt-3 text-base font-bold text-ink">{title}</h2>
              <p className="mt-1 flex-1 text-sm text-ink-muted">{text}</p>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 rounded-brand bg-brand-green px-4 py-2.5 text-center text-sm font-bold text-on-green"
              >
                {cta}
              </a>
            </li>
          ))}
        </ul>
      </Section>

      <Section>
        <div className="mt-4 flex items-start gap-3 rounded-brand border border-border bg-surface-raised p-5 text-sm">
          <ChatCircleDots size={24} weight="duotone" className="shrink-0 text-brand-blue" />
          <p className="text-ink-muted">
            Antes de chamar, talvez a resposta já esteja nas{" "}
            <Link href="/perguntas-frequentes" className="font-semibold text-brand-blue hover:underline">
              perguntas frequentes
            </Link>
            . Pedidos sobre dados pessoais (LGPD): veja a{" "}
            <Link href="/privacidade#exclusao-de-dados" className="font-semibold text-brand-blue hover:underline">
              Política de Privacidade
            </Link>
            .
          </p>
        </div>
        <p className="mt-4 text-xs text-ink-muted">
          {COMPANY.legalName} · CNPJ {COMPANY.cnpj} · {COMPANY.city}
        </p>
      </Section>
    </main>
  );
}

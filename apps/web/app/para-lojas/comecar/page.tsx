import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle, Kanban, LinkSimple, QrCode, Storefront } from "@phosphor-icons/react/dist/ssr";
import { CampaignLeadForm } from "@/components/CampaignLeadForm";

export const metadata: Metadata = {
  title: "Comece grátis: lojas, imobiliárias e corretores",
  description:
    "3 meses grátis, sem limite de anúncios. Vitrine para Instagram, WhatsApp e cartaz com QR, e importação dos seus anúncios pelo link. Deixe seu contato que a equipe chama no WhatsApp.",
  alternates: { canonical: "/para-lojas/comecar" },
};

// Página de campanha (anúncio pago): curta, com o formulário na primeira
// tela. Os textos repetem o que já está no ar em /para-lojas — nada de
// prometer número de visitas ou de vendas.
const BENEFITS = [
  { icon: Storefront, title: "3 meses grátis", text: "Sem limite de anúncios a partir do cadastro. Depois, escolha um plano para continuar no ar — sem fidelidade." },
  { icon: QrCode, title: "Vitrine pronta", text: "Cada anúncio vira imagem para o Instagram e o WhatsApp, e cartaz para imprimir com QR que leva direto ao anúncio." },
  { icon: LinkSimple, title: "Importe pelo link", text: "Já anuncia em outro site? Cole o link do anúncio e a gente organiza tudo no padrão do NovoSeminovo. Você só revisa." },
  { icon: Kanban, title: "Leads organizados", text: "Todo contato pelo chat e pelo WhatsApp vira um lead no seu painel, com as etapas novo, em contato, visita, proposta, vendido ou perdido." },
];

export default function CampaignStartPage() {
  return (
    <main className="pb-16">
      <div className="mx-auto grid max-w-5xl gap-8 px-4 pt-10 md:grid-cols-[1.1fr_1fr] md:items-start">
        <section>
          <p className="text-sm font-bold uppercase tracking-wide text-brand-green">Lojas de veículos, imobiliárias e corretores</p>
          <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-ink md:text-4xl">Anuncie seu estoque no NovoSeminovo com 3 meses grátis</h1>
          <p className="mt-4 text-base text-ink-muted">
            Deixe seu contato e a nossa equipe te chama no WhatsApp para mostrar o painel e ajudar a subir seus anúncios.
          </p>
          <ul className="mt-6 space-y-4">
            {BENEFITS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <Icon size={28} weight="duotone" className="shrink-0 text-brand-blue" />
                <div>
                  <h2 className="text-base font-bold text-ink">{title}</h2>
                  <p className="text-sm text-ink-muted">{text}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-6 flex items-center gap-2 text-sm text-ink-muted">
            <CheckCircle size={18} weight="fill" className="text-brand-green" />
            Prefere fazer sozinho?{" "}
            <Link href="/parceiro" className="font-semibold text-brand-blue hover:underline">
              Cadastre sua empresa
            </Link>
          </p>
        </section>
        <CampaignLeadForm />
      </div>
      <p className="mx-auto mt-10 max-w-5xl px-4 text-sm text-ink-muted">
        Quer ver planos e tudo o que o painel faz?{" "}
        <Link href="/para-lojas" className="font-semibold text-brand-blue hover:underline">
          Conheça o NovoSeminovo para lojas
        </Link>
        .
      </p>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import { PageHero, Section, Steps } from "@/components/marketing/PageHero";
import { CORBAN } from "@/lib/company";

export const metadata: Metadata = {
  title: "Como funciona",
  description:
    "Como comprar, vender e financiar carros e imóveis no NovoSeminovo: busca, chat com o anunciante, simulação e atendimento de financiamento.",
  alternates: { canonical: "/como-funciona" },
};

const BUY = [
  {
    title: "Encontre",
    text: "Busque por modelo, bairro ou faixa de preço — ou converse com o nosso assistente, que entende o que você procura e mostra as opções que cabem no seu bolso.",
  },
  {
    title: "Converse",
    text: "Fale com o anunciante pelo chat do site ou pelo WhatsApp. Lojas e imobiliárias verificadas têm selo no anúncio.",
  },
  {
    title: "Simule e feche",
    text: "Veja a parcela na hora na página do anúncio. Se quiser, um especialista em financiamento te ajuda a conseguir o crédito com os bancos.",
  },
];

const SELL = [
  {
    title: "Anuncie",
    text: "Conte com suas palavras o que você está vendendo — a IA monta o anúncio pra você revisar. Depois é só subir as fotos.",
  },
  {
    title: "Receba contatos",
    text: "Depois da aprovação, seu anúncio aparece na busca. Os interessados falam com você pelo chat ou WhatsApp, e você é avisado de cada mensagem.",
  },
  {
    title: "Financie e ganhe cashback",
    text: "Quem compra e financia pelo NovoSeminovo recebe de volta 20% da nossa comissão do financiamento, por Pix (valor líquido, pago depois que o banco paga a comissão).",
  },
];

const FINANCE = [
  {
    title: "Simule",
    text: "Na página de cada anúncio, ou com o assistente: entrada, número de parcelas e valor estimado da parcela, em segundos.",
  },
  {
    title: "Peça contato",
    text: `Com a sua autorização, o pedido vai para a ${CORBAN.brand}, correspondente bancário parceiro do NovoSeminovo.`,
  },
  {
    title: "Análise e contrato",
    text: "O especialista cuida da documentação e da análise de crédito com bancos e financeiras e te acompanha até a assinatura.",
  },
];

export default function HowItWorksPage() {
  return (
    <main className="pb-16">
      <PageHero eyebrow="Como funciona" title="Comprar, vender e financiar, sem enrolação">
        Carros e imóveis em um só lugar, com conversa direta com quem vende e financiamento com acompanhamento de
        verdade.
      </PageHero>

      <nav className="mx-auto mt-6 flex max-w-3xl flex-wrap justify-center gap-2 px-4" aria-label="Seções">
        {[
          ["#comprar", "Quero comprar"],
          ["#vender", "Quero vender"],
          ["#financiar", "Quero financiar"],
        ].map(([href, label]) => (
          <a key={href} href={href} className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-sober">
            {label}
          </a>
        ))}
      </nav>

      <Section id="comprar" title="Para quem quer comprar">
        <Steps items={BUY} />
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/carros" className="rounded-brand bg-brand-green px-5 py-3 text-sm font-bold text-on-green">
            Ver carros
          </Link>
          <Link href="/imoveis" className="rounded-brand border border-border px-5 py-3 text-sm font-bold text-ink hover:bg-surface-sober">
            Ver imóveis
          </Link>
        </div>
      </Section>

      <Section id="vender" title="Para quem quer vender">
        <Steps items={SELL} />
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/anunciar" className="rounded-brand bg-brand-green px-5 py-3 text-sm font-bold text-on-green">
            Anunciar agora
          </Link>
          <Link href="/recompensas" className="rounded-brand border border-border px-5 py-3 text-sm font-bold text-ink hover:bg-surface-sober">
            Como funciona o cashback
          </Link>
          <Link href="/para-lojas" className="rounded-brand border border-border px-5 py-3 text-sm font-bold text-ink hover:bg-surface-sober">
            Sou loja ou imobiliária
          </Link>
        </div>
      </Section>

      <Section id="financiar" title="Para quem precisa de financiamento">
        <Steps items={FINANCE} />
        <p className="mt-4 text-sm text-ink-muted">
          O NovoSeminovo não é banco e não concede crédito. As simulações são estimativas com taxas médias de mercado; a
          aprovação, a taxa e a parcela final dependem da análise da instituição financeira.
        </p>
      </Section>

      <Section title="Dicas de segurança">
        <div className="mt-4 rounded-brand border border-border bg-surface-raised p-5">
          <ul className="space-y-2 text-sm text-ink">
            {[
              "Veja o carro ou o imóvel pessoalmente antes de fechar negócio.",
              "Desconfie de preço muito abaixo do mercado e de pressa para fechar.",
              "Nunca faça pagamento antecipado, sinal ou depósito sem contrato e garantias.",
              "Confira a documentação: no carro, use a consulta do Passaporte Digital; no imóvel, peça a matrícula atualizada.",
              "O NovoSeminovo nunca pede senha, código de verificação ou dados bancários por mensagem.",
            ].map((tip) => (
              <li key={tip} className="flex gap-2">
                <ShieldCheck size={20} weight="fill" className="mt-0.5 shrink-0 text-brand-green" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
          <Link href="/consultar-veiculo" className="mt-4 inline-block text-sm font-semibold text-brand-blue hover:underline">
            Consultar o Passaporte Digital de um veículo →
          </Link>
        </div>
      </Section>

      <Section>
        <p className="mt-2 text-sm text-ink-muted">
          Ficou alguma dúvida? Veja as{" "}
          <Link href="/perguntas-frequentes" className="font-semibold text-brand-blue hover:underline">
            perguntas frequentes
          </Link>{" "}
          ou{" "}
          <Link href="/contato" className="font-semibold text-brand-blue hover:underline">
            fale com a gente
          </Link>
          .
        </p>
      </Section>
    </main>
  );
}

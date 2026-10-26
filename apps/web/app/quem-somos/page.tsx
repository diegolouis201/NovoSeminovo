import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Section } from "@/components/marketing/PageHero";
import { COMPANY, CORBAN } from "@/lib/company";

export const metadata: Metadata = {
  title: "Quem somos",
  description:
    "A NovoSeminovo nasceu para desmistificar o mercado automotivo e imobiliário, tornando a compra e a venda mais transparentes, seguras e conscientes.",
  alternates: { canonical: "/quem-somos" },
};

// Missão, visão e valores definidos pelo Diego (fundador) — mudar só com ele.
const MISSION =
  "Tornar a compra, a venda e o financiamento de veículos e imóveis mais transparentes, seguros e conscientes, oferecendo informação de qualidade para que cada pessoa faça a escolha certa para a sua vida.";
const VISION =
  "Ser referência no Brasil em transparência na compra e venda de veículos e imóveis, tornando o histórico de cada bem tão importante quanto o seu preço.";

const VALUES = [
  { title: "Transparência", text: "Preço claro, informação completa e nada escondido — nem do comprador, nem do vendedor." },
  {
    title: "Informação gera confiança",
    text: "Quanto mais se sabe sobre o bem — histórico, conservação, procedência —, melhor a decisão. É a razão de existir do Passaporte do Carro.",
  },
  {
    title: "Escolha consciente",
    text: "Ajudar cada pessoa a escolher o que cabe nas suas necessidades e possibilidades, inclusive no financiamento — não vender a qualquer custo.",
  },
  { title: "Segurança", text: "Moderação de anúncios, lojas verificadas e cuidado com os dados de cada pessoa." },
  { title: "Simplicidade", text: "Tirar a complicação de mercados que costumam ser confusos. Comprar e vender não precisa ser chato." },
  {
    title: "Proximidade",
    text: "Aproximar pessoas, lojas, imobiliárias e corretores — com atendimento humano quando ele faz diferença.",
  },
];

export default function AboutPage() {
  return (
    <main className="pb-16">
      <PageHero eyebrow="Quem somos" title="Simplificar mercados, aproximar pessoas">
        Transformar decisões importantes em escolhas mais seguras e conscientes.
      </PageHero>

      {/* Texto do Diego (fundador) — manter como ele escreveu; mudanças só com ele. */}
      <Section title="Nossa história">
        <div className="mt-4 max-w-3xl space-y-4 text-base leading-relaxed text-ink">
          <p>
            A NovoSeminovo nasceu com o propósito de desmistificar o mercado automotivo, tornando a compra e a venda de
            veículos um processo mais transparente, seguro e consciente.
          </p>
          <p>
            Nosso objetivo é ajudar cada cliente a escolher o carro ideal de acordo com suas necessidades, preferências
            e possibilidades, oferecendo o máximo de informações para que possa tomar decisões com confiança.
          </p>
          <p>
            Foi com esse propósito que criamos o{" "}
            <Link href="/consultar-veiculo" className="font-semibold text-brand-blue hover:underline">
              Passaporte do Carro
            </Link>
            , uma solução que reúne informações importantes sobre o histórico, os cuidados e a conservação do veículo. A
            ferramenta ajuda tanto o comprador, que busca mais segurança na hora de escolher seu próximo carro, quanto o
            vendedor, que pode demonstrar a procedência e o cuidado dedicado ao veículo.
          </p>
          <p>
            Além do mercado automotivo, também atuamos no setor imobiliário, conectando pessoas a oportunidades e
            buscando tornar os processos de compra, venda e negociação de imóveis mais transparentes, acessíveis e
            seguros.
          </p>
          <p>
            Acreditamos que, tanto no mercado automotivo quanto no imobiliário, a informação é essencial para construir
            confiança, facilitar decisões e proporcionar melhores experiências para todos os envolvidos.
          </p>
          <p className="font-display text-xl font-semibold text-brand-green">
            Nosso propósito é simplificar mercados, aproximar pessoas e transformar decisões importantes em escolhas mais
            seguras e conscientes.
          </p>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/consultar-veiculo" className="rounded-brand bg-brand-green px-5 py-3 text-sm font-bold text-on-green">
            Consultar o Passaporte de um carro
          </Link>
          <Link href="/como-funciona" className="rounded-brand border border-border px-5 py-3 text-sm font-bold text-ink hover:bg-surface-sober">
            Como funciona
          </Link>
        </div>
      </Section>

      <Section title="Financiamento com acompanhamento">
        <p className="mt-4 max-w-3xl text-base text-ink">
          O financiamento é feito com a <strong>{CORBAN.brand}</strong>, correspondente bancário parceiro, que leva o
          pedido aos bancos e financeiras e acompanha o cliente até a assinatura. E quem financia pelo NovoSeminovo ainda recebe
          cashback: 20% da nossa comissão volta para o cliente.
        </p>
      </Section>

      <Section title="Missão e visão">
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-brand bg-brand-green p-6 text-on-green">
            <h3 className="text-sm font-bold uppercase tracking-wide opacity-80">Missão</h3>
            <p className="mt-2 text-base font-semibold leading-relaxed">{MISSION}</p>
          </div>
          <div className="rounded-brand bg-brand-blue p-6 text-on-blue">
            <h3 className="text-sm font-bold uppercase tracking-wide opacity-80">Visão</h3>
            <p className="mt-2 text-base font-semibold leading-relaxed">{VISION}</p>
          </div>
        </div>
      </Section>

      <Section title="Nossos valores">
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {VALUES.map((value) => (
            <li key={value.title} className="rounded-brand bg-surface-raised p-5 shadow-card">
              <h3 className="text-base font-bold text-ink">{value.title}</h3>
              <p className="mt-1 text-sm text-ink-muted">{value.text}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Dados da empresa">
        <dl className="mt-4 grid gap-3 rounded-brand border border-border bg-surface-raised p-5 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-muted">Marketplace</dt>
            <dd className="font-semibold text-ink">
              {COMPANY.brand} — {COMPANY.legalName}
              <br />
              CNPJ {COMPANY.cnpj}
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Correspondente bancário parceiro</dt>
            <dd className="font-semibold text-ink">
              {CORBAN.brand} — {CORBAN.legalName}
              <br />
              CNPJ {CORBAN.cnpj}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-ink-muted">
          Quer falar com a gente?{" "}
          <Link href="/contato" className="font-semibold text-brand-blue hover:underline">
            Veja os canais de contato
          </Link>
          .
        </p>
      </Section>
    </main>
  );
}

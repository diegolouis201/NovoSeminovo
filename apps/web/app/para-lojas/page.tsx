import type { Metadata } from "next";
import Link from "next/link";
import {
  ChartLineUp,
  ChatCircleDots,
  CheckCircle,
  FileCsv,
  InstagramLogo,
  Kanban,
  SealCheck,
  Sparkle,
  Storefront,
  UsersThree,
  WhatsappLogo,
} from "@phosphor-icons/react/dist/ssr";
import { PageHero, Section } from "@/components/marketing/PageHero";
import { fetchPlans, fetchPublicRebateTiers } from "@/lib/api";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = {
  title: "Para lojas, imobiliárias e corretores",
  description:
    "Anuncie seu estoque no NovoSeminovo: vitrine com a sua marca, leads organizados, assistente de IA, posts prontos pro Instagram e recompensa por financiamento.",
  alternates: { canonical: "/para-lojas" },
};

// Só o que já está no ar pro parceiro — nada de "em breve" aqui. A
// integração com CRM existe, mas está escondida até o primeiro teste real
// (ver HANDOFF.md, item 8); quando liberar, entra nesta lista.
const FEATURES = [
  {
    icon: Storefront,
    title: "Vitrine com a sua marca",
    text: "Página própria com logo, todos os seus anúncios e destaques escolhidos por IA — um link pra divulgar.",
  },
  {
    icon: SealCheck,
    title: "Selo de loja verificada",
    text: "Depois da verificação, seus anúncios mostram o selo — mais confiança pro comprador.",
  },
  {
    icon: Kanban,
    title: "Leads organizados",
    text: "Todo contato pelo chat e pelo WhatsApp vira um lead no seu painel, com etapas de novo, negociando, ganho ou perdido.",
  },
  {
    icon: ChartLineUp,
    title: "Estoque e vendas",
    text: "Visão geral com anúncios ativos, vendas do mês, faturamento, ticket médio e conversão.",
  },
  {
    icon: Sparkle,
    title: "Assistente de IA da loja",
    text: "Pergunte “quais anúncios estão parados?” ou “quem preciso responder?” — e peça descrições e legendas prontas.",
  },
  {
    icon: InstagramLogo,
    title: "Posts prontos pro Instagram",
    text: "Feed, story e carrossel gerados a partir das fotos do anúncio, com preço e informações aplicados.",
  },
  {
    icon: FileCsv,
    title: "Estoque por planilha",
    text: "Suba vários anúncios de uma vez por planilha, sem cadastrar um por um.",
  },
  {
    icon: UsersThree,
    title: "Equipe",
    text: "Adicione vendedores e corretores pra operar o mesmo painel.",
  },
];

const TYPE_LABEL: Record<string, string> = {
  dealership: "Lojas de veículos",
  real_estate_agency: "Imobiliárias",
  broker: "Corretores autônomos",
};

export default async function ForPartnersPage() {
  const [vehiclePlans, propertyPlans, tiers] = await Promise.all([
    fetchPlans("vehicle"),
    fetchPlans("property"),
    fetchPublicRebateTiers(),
  ]);
  const planGroups = [
    { title: "Lojas de veículos", plans: vehiclePlans, enterpriseText: "Mais de 100 anúncios, várias lojas ou condições especiais." },
    { title: "Imobiliárias, construtoras e corretores", plans: propertyPlans, enterpriseText: "Mais de 50 anúncios, lançamentos ou condições especiais." },
  ].filter((group) => group.plans.length > 0);
  const tiersByType = Object.entries(TYPE_LABEL).map(([type, label]) => ({
    label,
    tiers: tiers.filter((tier) => tier.partnerType === type).sort((a, b) => a.tierOrder - b.tierOrder),
  }));
  const talkToSales = `${COMPANY.whatsappLink}?text=${encodeURIComponent("Olá! Tenho uma loja/imobiliária e quero anunciar no NovoSeminovo.")}`;

  return (
    <main className="pb-16">
      <PageHero eyebrow="Para lojas, imobiliárias e corretores" title="Seu estoque na frente de quem está pronto pra comprar">
        Comece com 3 meses grátis, sem limite de anúncios, e ganhe um painel completo pra vender mais: leads
        organizados, assistente de IA, posts prontos e recompensa quando o seu cliente financia.
      </PageHero>

      <div className="mx-auto mt-6 flex max-w-3xl flex-wrap justify-center gap-3 px-4">
        <Link href="/parceiro" className="rounded-brand bg-brand-green px-5 py-3 text-sm font-bold text-on-green">
          Cadastrar minha empresa
        </Link>
        <a
          href={talkToSales}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-brand border border-border px-5 py-3 text-sm font-bold text-ink hover:bg-surface-sober"
        >
          <WhatsappLogo size={18} weight="fill" className="text-brand-green" />
          Falar com a equipe
        </a>
      </div>

      <Section title="O que você ganha">
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-brand bg-surface-raised p-5 shadow-card">
              <Icon size={28} weight="duotone" className="text-brand-blue" />
              <h3 className="mt-3 text-base font-bold text-ink">{title}</h3>
              <p className="mt-1 text-sm text-ink-muted">{text}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Como começar">
        <ol className="mt-4 space-y-3 text-sm text-ink">
          {[
            "Crie sua conta e cadastre a empresa (CNPJ ou CRECI) no painel do parceiro.",
            "Nossa equipe verifica os dados e libera o selo de loja verificada.",
            "Publique seu estoque — um a um ou por planilha — e acompanhe tudo pelo painel.",
            "Use 3 meses grátis, sem limite de anúncios. Depois, escolha um plano para continuar no ar.",
          ].map((step, index) => (
            <li key={step} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-green text-sm font-bold text-on-green">
                {index + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      </Section>

      {planGroups.length > 0 && (
        <Section title="Planos">
          <p className="mt-2 max-w-3xl text-sm text-ink-muted">
            Os 3 primeiros meses a partir do cadastro são grátis e sem limite de anúncios. Depois, a vitrine e os
            anúncios continuam no ar com um dos planos abaixo — sem fidelidade, cancele quando quiser.
          </p>
          {planGroups.map((group) => (
            <div key={group.title} className="mt-6">
              <h3 className="font-display text-lg font-semibold text-ink">{group.title}</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {group.plans.map((plan) => (
                  <div key={plan.id} className="flex flex-col rounded-brand border border-border bg-surface-raised p-5">
                    <h4 className="font-display text-xl font-semibold text-ink">{plan.name}</h4>
                    <p className="mt-2 text-2xl font-extrabold text-ink [font-variant-numeric:tabular-nums]">
                      {plan.priceLabel}
                      <span className="text-sm font-normal text-ink-muted">/mês</span>
                    </p>
                    <ul className="mt-4 flex-1 space-y-2 text-sm text-ink">
                      <li className="flex gap-2">
                        <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-brand-green" />
                        Até {plan.maxActiveListings} anúncios no ar
                      </li>
                      {plan.highlightCredits > 0 && (
                        <li className="flex gap-2">
                          <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-brand-green" />
                          {plan.highlightCredits} anúncios em destaque
                        </li>
                      )}
                      {(plan.superHighlightCredits ?? 0) > 0 && (
                        <li className="flex gap-2">
                          <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-brand-green" />
                          {plan.superHighlightCredits} em super destaque (topo da busca)
                        </li>
                      )}
                      <li className="flex gap-2">
                        <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-brand-green" />
                        Leads ilimitados, vitrine, assistente de IA e posts pro Instagram
                      </li>
                    </ul>
                    <Link
                      href="/parceiro/plano"
                      className="mt-5 rounded-brand bg-brand-green px-4 py-2.5 text-center text-sm font-bold text-on-green"
                    >
                      Escolher {plan.name}
                    </Link>
                  </div>
                ))}
                {group.enterpriseText && (
                  <div className="flex flex-col rounded-brand border border-dashed border-border bg-surface-raised p-5">
                    <h4 className="font-display text-xl font-semibold text-ink">Enterprise</h4>
                    <p className="mt-2 text-2xl font-extrabold text-ink">Sob consulta</p>
                    <p className="mt-4 flex-1 text-sm text-ink">{group.enterpriseText}</p>
                    <a
                      href={talkToSales}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-5 rounded-brand border border-brand-green px-4 py-2.5 text-center text-sm font-bold text-brand-green"
                    >
                      Falar no WhatsApp
                    </a>
                  </div>
                )}
              </div>
            </div>
          ))}
        </Section>
      )}

      {tiers.length > 0 && (
        <Section title="Recompensa por financiamento">
          <p className="mt-2 max-w-3xl text-sm text-ink-muted">
            Quando o comprador de um anúncio seu financia pelo nosso correspondente bancário parceiro, uma parte da
            comissão volta pra você. Quanto mais volume financiado vem dos seus anúncios, maior o seu nível.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {tiersByType
              .filter((group) => group.tiers.length > 0)
              .map((group) => (
                <div key={group.label} className="rounded-brand border border-border bg-surface-raised p-5">
                  <h3 className="text-base font-bold text-ink">{group.label}</h3>
                  <ul className="mt-3 space-y-2 text-sm">
                    {group.tiers.map((tier) => (
                      <li key={tier.id} className="flex items-baseline justify-between gap-3">
                        <span className="text-ink">
                          <strong>{tier.tierName}</strong>
                          <span className="block text-xs text-ink-muted">a partir de {tier.minVolumeLabel} financiados</span>
                        </span>
                        <span className="text-lg font-extrabold text-brand-green">{tier.rebatePercentLabel}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
          <Link href="/recompensas" className="mt-4 inline-block text-sm font-semibold text-brand-blue hover:underline">
            Entenda o programa de recompensa →
          </Link>
        </Section>
      )}

      <Section>
        <div className="mt-4 flex flex-col items-center gap-3 rounded-brand-lg bg-brand-blue px-6 py-8 text-center text-on-blue">
          <ChatCircleDots size={32} weight="duotone" />
          <h2 className="font-display text-2xl font-semibold">Quer ver o painel funcionando?</h2>
          <p className="max-w-xl text-sm opacity-90">
            Chama a gente no WhatsApp que mostramos o painel e ajudamos a subir seu estoque.
          </p>
          <a
            href={talkToSales}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 rounded-brand bg-surface-raised px-5 py-3 text-sm font-bold text-ink"
          >
            Falar no WhatsApp
          </a>
        </div>
      </Section>
    </main>
  );
}

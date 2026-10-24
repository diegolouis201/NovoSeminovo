import type { Metadata } from "next";
import Link from "next/link";
import { Buildings, ChartLineUp, Handshake, LinkSimple, Megaphone, UserCircle } from "@phosphor-icons/react/dist/ssr";
import { AFFILIATE_RULES, formatBRL } from "@novoseminovo/shared-types";

export const metadata: Metadata = {
  title: "Programa de afiliados",
  description:
    "Divulgue o NovoSeminovo e ganhe comissão sobre os planos das lojas, imobiliárias e anunciantes que você indicar. Link e código próprios, painel com resultados.",
};

// Exemplos com preços reais dos planos (Pack 20 de imobiliária e Nitro de pessoa física).
const PACK_20 = 289;
const NITRO = 129.9;

const STEPS = [
  { icon: Handshake, title: "Inscreva-se", text: "Conte onde você divulga (Instagram, YouTube, TikTok, site, carteira de clientes). A equipe aprova em poucos dias." },
  { icon: LinkSimple, title: "Divulgue seu link e código", text: "Você recebe um link e um código só seus. Quem chega por eles e cria a conta fica indicado por você." },
  { icon: ChartLineUp, title: "Acompanhe e receba", text: "No painel do afiliado você vê cliques, cadastros e comissões. O pagamento é por Pix." },
];

const RULES = [
  `O link vale por ${AFFILIATE_RULES.cookieDays} dias: se a pessoa clicar e criar a conta dentro desse prazo, ela fica indicada por você. O código digitado no cadastro também vale.`,
  `A comissão das lojas e imobiliárias vale por ${AFFILIATE_RULES.partnerSubscriptionMonths} meses a partir da primeira mensalidade paga. A dos planos de anúncio vale para pagamentos feitos até ${AFFILIATE_RULES.partnerSubscriptionMonths} meses depois do cadastro.`,
  `Cada comissão fica em análise por ${AFFILIATE_RULES.holdDays} dias (prazo de estornos) e depois fica disponível. O pagamento é feito por Pix a partir de ${formatBRL(AFFILIATE_RULES.minPayout)} disponíveis.`,
  "Indicar a si mesmo não gera comissão. Contas criadas só para gerar comissão, cliques artificiais ou qualquer fraude levam à suspensão e à perda das comissões ligadas a elas.",
  "Em publicações pagas ou com link de afiliado, sinalize a parceria (ex.: #publi ou \"parceria com o NovoSeminovo\"), como pede o CONAR.",
  "Não é permitido fazer anúncio pago usando o nome NovoSeminovo (ex.: Google Ads com a marca), enviar spam ou prometer condições que o site não oferece.",
  "Planos gratuitos e o período grátis das lojas não geram comissão: ela é sempre uma parte do que o cliente pagou de fato.",
  "O NovoSeminovo pode alterar estas regras com aviso prévio no painel do afiliado. Comissões já geradas seguem as regras da data em que foram geradas.",
];

export default function AffiliateProgramPage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-12">
      <section className="flex flex-col gap-4">
        <p className="flex items-center gap-1.5 text-sm font-bold text-brand-green">
          <Megaphone size={16} weight="fill" /> Programa de afiliados
        </p>
        <h1 className="max-w-3xl font-display text-3xl font-bold text-ink sm:text-4xl">
          Indique o NovoSeminovo e ganhe a cada mensalidade paga
        </h1>
        <p className="max-w-2xl text-ink-muted">
          Para influenciadores, criadores de conteúdo, corretores, despachantes e parceiros comerciais. Você divulga a plataforma de
          carros e imóveis para o seu público e recebe parte do que as lojas, imobiliárias e anunciantes indicados pagam.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/afiliado" className="rounded-brand bg-brand-green px-5 py-2.5 font-bold text-on-green hover:opacity-90">
            Quero ser afiliado
          </Link>
          <a href="#regras" className="rounded-brand border border-border px-5 py-2.5 font-semibold text-ink hover:bg-surface-sober">
            Ver as regras
          </a>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <article className="flex flex-col gap-2 rounded-brand-lg border border-border bg-surface-raised p-5">
          <Buildings size={28} weight="duotone" className="text-brand-blue" />
          <h2 className="font-display text-xl font-semibold text-ink">Lojas, imobiliárias e construtoras</h2>
          <p className="text-4xl font-extrabold text-brand-green">{AFFILIATE_RULES.partnerSubscriptionRate}%</p>
          <p className="text-sm text-ink-muted">
            de cada mensalidade paga, por {AFFILIATE_RULES.partnerSubscriptionMonths} meses.
          </p>
          <p className="mt-1 rounded-brand bg-surface-sober px-3 py-2 text-sm text-ink">
            Exemplo: uma imobiliária no Pack 20 ({formatBRL(PACK_20)}/mês) rende{" "}
            <strong>{formatBRL((PACK_20 * AFFILIATE_RULES.partnerSubscriptionRate) / 100)}</strong> por mês, ou até{" "}
            <strong>
              {formatBRL(((PACK_20 * AFFILIATE_RULES.partnerSubscriptionRate) / 100) * AFFILIATE_RULES.partnerSubscriptionMonths)}
            </strong>{" "}
            no ano, se ela continuar assinando.
          </p>
        </article>
        <article className="flex flex-col gap-2 rounded-brand-lg border border-border bg-surface-raised p-5">
          <UserCircle size={28} weight="duotone" className="text-brand-blue" />
          <h2 className="font-display text-xl font-semibold text-ink">Anunciantes pessoa física</h2>
          <p className="text-4xl font-extrabold text-brand-green">{AFFILIATE_RULES.listingPlanRate}%</p>
          <p className="text-sm text-ink-muted">de cada plano pago de anúncio (Flex, Turbo ou Nitro).</p>
          <p className="mt-1 rounded-brand bg-surface-sober px-3 py-2 text-sm text-ink">
            Exemplo: alguém que você indicou turbina o anúncio do carro com o Nitro ({formatBRL(NITRO)}) e você ganha{" "}
            <strong>{formatBRL((NITRO * AFFILIATE_RULES.listingPlanRate) / 100)}</strong>.
          </p>
        </article>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl font-semibold text-ink">Como funciona</h2>
        <ol className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex flex-col gap-2 rounded-brand-lg border border-border bg-surface-raised p-5">
              <span className="flex items-center gap-2 text-sm font-bold text-ink-muted">
                <step.icon size={22} weight="duotone" className="text-brand-green" /> Passo {index + 1}
              </span>
              <h3 className="font-semibold text-ink">{step.title}</h3>
              <p className="text-sm text-ink-muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="regras" className="flex flex-col gap-3 scroll-mt-24">
        <h2 className="font-display text-2xl font-semibold text-ink">Regras do programa</h2>
        <ul className="flex max-w-3xl list-disc flex-col gap-2 pl-5 text-sm text-ink">
          {RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
        <p className="max-w-3xl text-xs text-ink-muted">
          O afiliado não é funcionário nem representante do NovoSeminovo e não pode negociar em nome da plataforma. Dúvidas:
          fale com a gente pela página de <Link href="/contato" className="underline">contato</Link>.
        </p>
      </section>

      <section className="flex flex-col items-start gap-3 rounded-brand-lg bg-surface-sober p-6">
        <h2 className="font-display text-2xl font-semibold text-ink">Pronto para começar?</h2>
        <p className="max-w-2xl text-sm text-ink-muted">A inscrição é grátis. Você precisa de uma conta no NovoSeminovo e de uma chave Pix para receber.</p>
        <Link href="/afiliado" className="rounded-brand bg-brand-green px-5 py-2.5 font-bold text-on-green hover:opacity-90">
          Quero ser afiliado
        </Link>
      </section>
    </main>
  );
}

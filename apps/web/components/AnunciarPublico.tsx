import Link from "next/link";
import { Buildings, Car, CheckCircle, House, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import { LISTING_TIERS, formatBRL } from "@novoseminovo/shared-types";
import { PageHero, Section, Steps } from "@/components/marketing/PageHero";

// /anunciar para quem não entrou na conta (auditoria de SEO, 21/11/2026: a
// página estava no sitemap mas redirecionava para /entrar). Explica como
// anunciar grátis e leva para entrar/cadastrar voltando direto para o passo a
// passo (?voltar=/anunciar). Quem já entrou continua vendo o passo a passo.
// Só fatos do site: planos de LISTING_TIERS (fonte única de preço), 3 meses
// grátis para empresa (/para-lojas/comecar), moderação, contato protegido.
const VOLTAR = encodeURIComponent("/anunciar");

const STEPS = [
  {
    title: "Crie sua conta grátis",
    text: "Nome, e-mail e senha. Para anunciar como pessoa física pedimos o CPF, que não aparece no anúncio.",
  },
  {
    title: "Preencha o passo a passo",
    text: "Fotos, preço e descrição. No carro, a tabela FIPE ajuda a achar a versão certa e a sugerir o preço. Já anuncia em outro site? Cole o link do anúncio.",
  },
  {
    title: "Revisão rápida e no ar",
    text: "Todo anúncio passa por uma revisão rápida e aparece na busca assim que é aprovado. Você recebe um aviso.",
  },
];

export function AnunciarPublico({ inApp }: { inApp: boolean }) {
  // Dentro do app não aparece compra de plano (lib/app-context.ts).
  const tiers = inApp ? LISTING_TIERS.filter((tier) => tier.price === 0) : LISTING_TIERS;
  return (
    <main className="pb-16">
      <PageHero eyebrow="Anunciar" title="Anuncie seu carro ou imóvel grátis">
        <p>
          Pessoa física anuncia grátis e o anúncio fica no ar até vender. Lojas, imobiliárias e corretores começam com 3 meses grátis, sem limite de
          anúncios.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href={`/entrar?voltar=${VOLTAR}`} className="rounded-brand bg-brand-green px-6 py-3 text-sm font-bold text-on-green hover:opacity-90">
            Entrar e anunciar
          </Link>
          <Link href={`/cadastro?voltar=${VOLTAR}`} className="rounded-brand border border-border bg-surface-raised px-6 py-3 text-sm font-bold text-ink hover:bg-surface-sober">
            Criar conta grátis
          </Link>
        </div>
      </PageHero>

      <Section title="Pessoa física: como anunciar">
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
          <span className="flex items-center gap-1.5">
            <Car size={18} weight="duotone" className="text-brand-blue" aria-hidden /> Carro
          </span>
          <span className="flex items-center gap-1.5">
            <House size={18} weight="duotone" className="text-brand-orange" aria-hidden /> Imóvel à venda ou para alugar
          </span>
        </p>
        <Steps items={STEPS} />
      </Section>

      <Section title={inApp ? "Plano grátis" : "Planos para pessoa física"}>
        <p className="mt-2 text-sm text-ink-muted">
          {inApp
            ? "Comece grátis. O anúncio fica no ar até vender."
            : "Pagamento único por anúncio, sem mensalidade. Em todos o anúncio fica no ar até vender; os pagos mostram mais fotos, vídeo e aparecem antes na busca."}
        </p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tiers.map((tier) => (
            <li key={tier.id} className="flex flex-col gap-2 rounded-brand bg-surface-raised p-5 shadow-card">
              <h3 className="font-display text-xl font-semibold text-ink">{tier.name}</h3>
              <p className="text-2xl font-bold text-ink">{tier.price === 0 ? "R$ 0" : formatBRL(tier.price)}</p>
              <ul className="flex flex-col gap-1.5 text-sm text-ink-muted">
                <li className="flex items-center gap-1.5">
                  <CheckCircle size={16} weight="fill" className="shrink-0 text-brand-green" aria-hidden /> Até {tier.photos} fotos
                </li>
                {tier.video && (
                  <li className="flex items-center gap-1.5">
                    <CheckCircle size={16} weight="fill" className="shrink-0 text-brand-green" aria-hidden /> Vídeo do YouTube
                  </li>
                )}
                <li className="flex items-center gap-1.5">
                  <CheckCircle size={16} weight="fill" className="shrink-0 text-brand-green" aria-hidden /> {tier.position}
                </li>
              </ul>
            </li>
          ))}
        </ul>
        {!inApp && <p className="mt-3 text-xs text-ink-muted">Você escolhe o plano no passo a passo; dá para começar no Grátis e turbinar depois.</p>}
      </Section>

      <Section title="Empresas: lojas, imobiliárias e corretores">
        <div className="mt-4 flex flex-col gap-4 rounded-brand-lg bg-surface-sober p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-3">
            <Buildings size={32} weight="duotone" className="shrink-0 text-brand-blue" aria-hidden />
            <p className="text-sm text-ink-muted">
              3 meses grátis, sem limite de anúncios. O estoque entra integrado ao seu CRM ou catálogo de veículos, ou por planilha, com vitrine da
              sua marca e os contatos organizados no painel.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <Link href="/para-lojas" className="rounded-brand border border-border bg-surface-raised px-5 py-2.5 text-center text-sm font-bold text-ink hover:bg-surface-page">
              Ver planos para empresas
            </Link>
            <Link href="/para-lojas/comecar" className="rounded-brand bg-brand-blue px-5 py-2.5 text-center text-sm font-bold text-on-blue hover:opacity-90">
              Começar grátis
            </Link>
          </div>
        </div>
      </Section>

      <Section>
        <p className="flex items-start gap-2 text-sm text-ink-muted">
          <ShieldCheck size={20} weight="duotone" className="shrink-0 text-brand-green" aria-hidden />
          Contato protegido: o telefone não aparece na descrição, e o WhatsApp do anunciante só abre para quem entrou na conta.
        </p>
      </Section>
    </main>
  );
}

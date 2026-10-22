import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Section } from "@/components/marketing/PageHero";
import { COMPANY, CORBAN } from "@/lib/company";

export const metadata: Metadata = {
  title: "Perguntas frequentes",
  description: "Dúvidas sobre comprar, anunciar e financiar carros e imóveis no NovoSeminovo.",
  alternates: { canonical: "/perguntas-frequentes" },
};

type Faq = { q: string; a: string };

const GROUPS: { title: string; items: Faq[] }[] = [
  {
    title: "Comprar",
    items: [
      {
        q: "O NovoSeminovo vende os carros e imóveis?",
        a: "Não. O NovoSeminovo é uma plataforma de anúncios: a negociação, a documentação e o pagamento são feitos diretamente entre você e o anunciante (pessoa, loja, imobiliária ou corretor).",
      },
      {
        q: "Como falo com o anunciante?",
        a: "Pela página do anúncio: use o chat do site (precisa estar logado) ou o botão do WhatsApp, quando o anunciante tiver telefone cadastrado.",
      },
      {
        q: "O que é a loja verificada?",
        a: "É uma loja, imobiliária ou corretor cujos dados foram conferidos pela nossa equipe. O selo aparece no anúncio e na vitrine da empresa.",
      },
      {
        q: "O que é o Passaporte Digital do veículo?",
        a: "É o histórico do carro no NovoSeminovo pela placa: anúncios anteriores e eventos registrados (revisões, manutenções), com indicação de quem confirmou cada informação.",
      },
    ],
  },
  {
    title: "Anunciar",
    items: [
      {
        q: "Quanto custa anunciar?",
        a: "Pessoa física anuncia grátis até vender, com até 5 fotos. Para aparecer mais na busca e mostrar mais fotos e vídeo, há os planos Flex (R$ 39,90), Turbo (R$ 69,90) e Nitro (R$ 129,90), com pagamento único por anúncio. Lojas de veículos, imobiliárias e corretores têm 3 meses grátis, sem limite de anúncios, a partir do cadastro; depois, para continuar no ar, é preciso um plano mensal do painel do parceiro.",
      },
      {
        q: "Por que meu anúncio está “em análise”?",
        a: "Todo anúncio novo passa pela moderação antes de aparecer na busca, pra manter o site livre de golpes e anúncios falsos. Você é avisado quando ele for aprovado.",
      },
      {
        q: "Como marco meu anúncio como vendido?",
        a: "Em Minha conta → Meus anúncios (ou no Estoque do painel do parceiro), use a opção de marcar como vendido. Anúncio vendido sai da busca.",
      },
      {
        q: "O que é a recompensa por financiamento?",
        a: "Se o comprador do seu anúncio financiar pelo nosso correspondente bancário parceiro, uma parte da comissão do financiamento volta pra você. Pessoa física recebe 20%; lojas, imobiliárias e corretores sobem de nível conforme o volume.",
      },
    ],
  },
  {
    title: "Financiamento",
    items: [
      {
        q: "Quem faz o financiamento?",
        a: `O atendimento é feito pela ${CORBAN.brand} (${CORBAN.legalName}, CNPJ ${CORBAN.cnpj}), correspondente bancário parceiro, que leva o seu pedido a bancos e financeiras. O NovoSeminovo não é banco e não concede crédito.`,
      },
      {
        q: "A simulação garante a aprovação?",
        a: "Não. A simulação usa taxas médias de mercado e serve de referência. A aprovação, a taxa e o valor da parcela dependem da análise de crédito da instituição.",
      },
      {
        q: "O assistente pede meus documentos?",
        a: "Não. O assistente só pede nome e telefone pra o especialista entrar em contato — e só com a sua autorização. Nunca informe senhas ou dados bancários no chat.",
      },
    ],
  },
  {
    title: "Privacidade e conta",
    items: [
      {
        q: "Como peço a exclusão dos meus dados?",
        a: `Mande uma mensagem pelo WhatsApp ${COMPANY.whatsappDisplay} com o assunto “Exclusão de dados”. Os detalhes estão na Política de Privacidade.`,
      },
      {
        q: "O assistente de IA guarda as conversas?",
        a: "Sim, pra dar continuidade ao atendimento. As conversas são processadas por um modelo de IA da Anthropic e tratadas conforme a nossa Política de Privacidade.",
      },
    ],
  },
];

export default function FaqPage() {
  // Marcação de perguntas frequentes (schema.org) — o Google pode mostrar as
  // respostas direto no resultado da busca.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: GROUPS.flatMap((group) =>
      group.items.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })),
    ),
  };

  return (
    <main className="pb-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <PageHero eyebrow="Ajuda" title="Perguntas frequentes" />

      {GROUPS.map((group) => (
        <Section key={group.title} title={group.title}>
          <div className="mt-4 divide-y divide-border rounded-brand border border-border bg-surface-raised">
            {group.items.map((item) => (
              <details key={item.q} className="group p-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-ink">
                  {item.q}
                  <span className="text-lg text-ink-muted transition-transform group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="mt-2 text-sm text-ink-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </Section>
      ))}

      <Section>
        <p className="mt-2 text-sm text-ink-muted">
          Não achou sua resposta?{" "}
          <Link href="/contato" className="font-semibold text-brand-blue hover:underline">
            Fale com a gente
          </Link>
          .
        </p>
      </Section>
    </main>
  );
}

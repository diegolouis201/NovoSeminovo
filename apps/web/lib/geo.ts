// GEO (16/11/2026): o que buscadores e assistentes de IA leem para entender e
// citar o site — marcação Organization/WebSite (layout) e o /llms.txt.
// Só fatos que já estão no site (rodapé, Quem somos, guias, perguntas
// frequentes). Fato novo sobre a empresa entra aqui só depois do Diego confirmar.
import { COMPANY, CORBAN, SITE_URL } from "./company";
import { GUIDE_TOPICS, GUIDES, guideUrl, topicUrl } from "./guias";

/** Resumo de uma linha (blockquote do /llms.txt e descrição da Organization). */
export const SITE_SUMMARY =
  "Marketplace nacional de carros e imóveis: anúncios de pessoas, lojas, imobiliárias e corretores de todo o Brasil, com chat, selo de loja verificada e simulação de financiamento.";

/** O que o NovoSeminovo faz — usado em /quem-somos e no /llms.txt. */
export const PLATFORM_FACTS: string[] = [
  "Plataforma de anúncios de carros e imóveis de todo o Brasil. O NovoSeminovo não vende os bens: a negociação, a documentação e o pagamento são feitos direto entre comprador e anunciante (pessoa, loja, imobiliária ou corretor).",
  "Todo anúncio novo passa pela moderação antes de aparecer na busca.",
  "Lojas, imobiliárias e corretores podem ter o selo de verificado: empresa conferida pela nossa equipe.",
  "Contato protegido: o telefone não aparece na descrição, e o WhatsApp do anunciante só abre com login.",
  "Ao anunciar um carro, a Tabela FIPE ajuda a achar a versão certa e a sugerir o preço.",
  "Arquiteto NovoSeminovo: mostra com IA como o imóvel anunciado pode ficar reformado.",
  "Pessoa física anuncia grátis até vender.",
  `Financiamento com a ${CORBAN.brand}, parceira de crédito, que leva o pedido a bancos e financeiras. O ${COMPANY.brand} não é instituição financeira e não concede crédito.`,
];

export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const LOGO_URL = `${SITE_URL}/marca/novoseminovo-logo.png`;

export function siteJsonLd() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": ORGANIZATION_ID,
      name: COMPANY.brand,
      legalName: COMPANY.legalName,
      taxID: COMPANY.cnpj,
      url: SITE_URL,
      logo: LOGO_URL,
      description: SITE_SUMMARY,
      areaServed: { "@type": "Country", name: "Brasil" },
      sameAs: [COMPANY.instagram, COMPANY.facebook, COMPANY.youtube, COMPANY.tiktok, COMPANY.linkedin],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: COMPANY.brand,
      url: SITE_URL,
      inLanguage: "pt-BR",
      publisher: { "@id": ORGANIZATION_ID },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/busca?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
  ];
}

const link = (label: string, path: string, note?: string) => `- [${label}](${SITE_URL}${path})${note ? `: ${note}` : ""}`;

/** Texto do /llms.txt (formato llmstxt.org). Os guias saem de lib/guias.ts. */
export function buildLlmsTxt(): string {
  const guides = GUIDE_TOPICS.flatMap((topic) => [
    link(topic.title, topicUrl(topic.slug), topic.description),
    ...GUIDES.filter((guide) => guide.topic === topic.slug).map((guide) => link(guide.heading, guideUrl(guide), guide.description)),
  ]);
  return [
    `# ${COMPANY.brand}`,
    "",
    `> ${SITE_SUMMARY}`,
    "",
    ...PLATFORM_FACTS.map((fact) => `- ${fact}`),
    "",
    `Operado por ${COMPANY.legalName}, CNPJ ${COMPANY.cnpj}. Parceira de crédito: ${CORBAN.legalName}, CNPJ ${CORBAN.cnpj}.`,
    "",
    "## Comprar",
    "",
    link("Carros à venda", "/carros"),
    link("Imóveis à venda e para alugar", "/imoveis"),
    link("Busca de anúncios", "/busca", "filtros por tipo, cidade, estado, preço e características"),
    link("Assistente de compra", "/assistente-compra", "perguntas rápidas para descobrir o carro ou o imóvel que cabe no orçamento"),
    "",
    "## Anunciar",
    "",
    link("Anunciar", "/anunciar", "pessoa física anuncia grátis até vender (exige login)"),
    link("Para lojas, imobiliárias e corretores", "/para-lojas", "planos e painel do parceiro"),
    "",
    "## Guias",
    "",
    link("Todos os guias", "/guia"),
    ...guides,
    "",
    "## Sobre",
    "",
    link("Como funciona", "/como-funciona"),
    link("Perguntas frequentes", "/perguntas-frequentes"),
    link("Quem somos", "/quem-somos"),
    link("Contato", "/contato"),
    "",
    "## Optional",
    "",
    link("Termos de Uso", "/termos"),
    link("Política de Privacidade", "/privacidade"),
    "",
  ].join("\n");
}

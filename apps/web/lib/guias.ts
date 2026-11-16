// Guias de SEO, fase 1 (texto do marketing, revisado pelo Diego em
// 16/11/2026). Conteúdo fixo: mudar um guia é mudar este arquivo.
//
// Marcação dentro dos textos: **assim** vira negrito. Nada aqui é HTML — a
// página monta os elementos (ver components/guias/RichText.tsx).

export type GuideTopicSlug = "comprar-carro-usado" | "vender-carro" | "comprar-imovel";

export type GuideTopic = {
  slug: GuideTopicSlug;
  name: string;
  title: string;
  description: string;
};

export type GuideSection =
  | { title: string; kind: "ul" | "ol"; items: string[] }
  | { title: string; kind: "p"; paragraphs: string[] };

/** Link interno: rota do site ou outro guia (resolvido pelo id). */
export type GuideLink = { href: string; label: string } | { guide: GuideId };

export type GuideId = "como-evitar-golpe" | "documentos" | "como-avaliar" | "matricula-atualizada" | "golpes";

export type Guide = {
  id: GuideId;
  topic: GuideTopicSlug;
  slug: string;
  /** H1 da página. */
  heading: string;
  /** Title para o Google (já com " | NovoSeminovo"). */
  title: string;
  description: string;
  quickAnswer: string;
  sections: GuideSection[];
  faq: { q: string; a: string }[];
  cta: { text: string; href: string; label: string };
  links: GuideLink[];
  publishedAt: string;
};

/** Última revisão do conteúdo dos guias (dateModified na marcação). Mudou um guia? Atualize. */
export const GUIDES_UPDATED_AT = "2026-11-16";

export const GUIDE_DISCLAIMER =
  "Conteúdo informativo. Regras de Detran e cartório mudam de estado para estado: confira no órgão do seu estado.";

export const GUIDE_TOPICS: GuideTopic[] = [
  {
    slug: "comprar-carro-usado",
    name: "Comprar carro usado",
    title: "Guias para comprar carro usado",
    description: "Como evitar golpe e como avaliar um carro usado antes de fechar negócio.",
  },
  {
    slug: "vender-carro",
    name: "Vender carro",
    title: "Guias para vender carro",
    description: "O que separar e como fazer a transferência para vender seu carro sem dor de cabeça.",
  },
  {
    slug: "comprar-imovel",
    name: "Comprar imóvel",
    title: "Guias para comprar imóvel",
    description: "Matrícula atualizada e os golpes mais comuns na compra e no aluguel de imóvel.",
  },
];

export const GUIDES: Guide[] = [
  {
    id: "como-evitar-golpe",
    topic: "comprar-carro-usado",
    slug: "como-evitar-golpe",
    heading: "Como evitar golpe na compra de carro usado",
    title: "Como evitar golpe na compra de carro usado | NovoSeminovo",
    description:
      "Os golpes mais comuns na compra de carro usado e o que fazer antes de pagar: ver o carro, conferir o dono e pagar só na transferência.",
    quickAnswer:
      "nunca pague nada antes de ver o carro pessoalmente, confira se quem vende é o dono que está no documento e faça o pagamento só na hora da transferência, para uma conta no nome desse dono. Preço muito abaixo do mercado e pressa para fechar são os dois maiores sinais de golpe.",
    sections: [
      {
        title: "Quais são os golpes mais comuns?",
        kind: "ul",
        items: [
          "**Preço bom demais:** o carro aparece bem abaixo da tabela de referência FIPE para atrair quem está com pressa.",
          "**Sinal para “reservar”:** o vendedor pede um Pix antes de você ver o carro, dizendo que tem outros interessados.",
          "**Golpe do intermediário:** o golpista anuncia o carro de outra pessoa, marca a visita com o dono verdadeiro e faz você pagar numa conta dele. O dono não recebe, e você fica sem o dinheiro.",
          "**Documento adulterado ou carro com problema escondido:** o documento parece normal, mas o número do chassi não bate ou há débitos e restrições que impedem a transferência.",
        ],
      },
      {
        title: "O que fazer antes de pagar?",
        kind: "ol",
        items: [
          "**Veja o carro pessoalmente**, de dia, e de preferência com um mecânico de confiança.",
          "**Confira o documento (CRLV):** o nome do dono tem que ser o da pessoa que está vendendo. Peça o documento de identidade dela.",
          "**Confira o chassi:** o número gravado no carro tem que ser igual ao do documento.",
          "**Consulte o Detran do seu estado** para saber se há débitos, multas ou restrições que impeçam a transferência.",
          "**Pense numa vistoria cautelar:** empresas especializadas fazem um laudo do carro antes da compra.",
          "**Pague só na transferência**, para uma conta no nome do dono que está no documento. Nunca para terceiros.",
          "**Faça a transferência junto com o vendedor**, pelo Detran ou pelo cartório, conforme a regra do seu estado.",
        ],
      },
      {
        title: "Como o NovoSeminovo ajuda?",
        kind: "ul",
        items: [
          "Lojas e imobiliárias com **selo verificado** (empresa conferida pela nossa equipe).",
          "**Contato protegido:** o telefone não aparece na descrição, e o WhatsApp só abre com login.",
          "**Preço de referência FIPE** no anúncio, para você comparar antes de ligar.",
        ],
      },
    ],
    faq: [
      {
        q: "Posso pagar um sinal para segurar o carro?",
        a: "Só depois de ver o carro, conferir o documento e com um recibo assinado pelo dono. Antes disso, não.",
      },
      {
        q: "O vendedor diz que o carro é de um parente. É golpe?",
        a: "Não necessariamente, mas o pagamento deve ir para a conta de quem está no documento, e esse dono precisa participar da transferência.",
      },
      {
        q: "Comprar de loja é mais seguro?",
        a: "Loja com CNPJ verificado dá mais garantias de quem está do outro lado. Mesmo assim, confira o carro e o documento.",
      },
    ],
    cta: { text: "Procure carros de lojas verificadas no NovoSeminovo.", href: "/carros", label: "Ver carros" },
    links: [
      { href: "/carros", label: "Carros à venda" },
      { guide: "como-avaliar" },
      { guide: "documentos" },
      { href: "/guia/comprar-carro-usado", label: "Guias para comprar carro usado" },
    ],
    publishedAt: "2026-11-16",
  },
  {
    id: "documentos",
    topic: "vender-carro",
    slug: "documentos",
    heading: "Documentos para vender carro",
    title: "Documentos para vender carro: lista completa | NovoSeminovo",
    description:
      "O que separar para vender seu carro sem dor de cabeça: documento do veículo, débitos em dia, quitação do financiamento e comunicação de venda.",
    quickAnswer:
      "para vender, você precisa do documento do carro (CRLV), de um documento de identidade, dos débitos quitados (IPVA, licenciamento e multas) e, se o carro foi financiado, da quitação com a baixa do gravame. Depois da venda, faça a comunicação de venda para não receber multas do novo dono.",
    sections: [
      {
        title: "Quais documentos separar?",
        kind: "ul",
        items: [
          "**CRLV (documento do veículo):** hoje ele é digital e fica no aplicativo Carteira Digital de Trânsito.",
          "**Documento de identidade e CPF** de quem está vendendo (o dono que está no documento).",
          "**Débitos em dia:** IPVA, licenciamento e multas. Com débito aberto, a transferência não sai.",
          "**Se o carro foi financiado:** a quitação do contrato e a baixa do gravame (a restrição do financiamento). Peça ao banco.",
          "**Laudo de vistoria**, quando o Detran do seu estado exigir para a transferência.",
        ],
      },
      {
        title: "Como funciona a transferência?",
        kind: "ol",
        items: [
          "Vendedor e comprador combinam valor e forma de pagamento.",
          "O vendedor emite a autorização de transferência. Nos carros com documento digital, ela costuma ser eletrônica (ATPV-e); em documentos antigos, pode ser preciso reconhecer a firma em cartório. Confira a regra no Detran do seu estado.",
          "O pagamento é feito, de preferência na hora da transferência.",
          "O comprador tem **30 dias** para fazer a transferência no Detran.",
        ],
      },
      {
        title: "Por que fazer a comunicação de venda?",
        kind: "p",
        paragraphs: [
          "Enquanto o carro estiver no seu nome, multas e débitos podem chegar para você. A comunicação de venda avisa o Detran que o carro não é mais seu. Faça o quanto antes, conforme a regra do seu estado.",
        ],
      },
    ],
    faq: [
      {
        q: "Posso vender carro com multa?",
        a: "Pode negociar, mas as multas precisam ser pagas para a transferência sair. Combine por escrito quem paga.",
      },
      {
        q: "Posso vender carro ainda financiado?",
        a: "Pode, mas o financiamento precisa ser quitado (ou transferido, se o banco aceitar) antes da transferência.",
      },
      {
        q: "Como receber com segurança?",
        a: "Confirme que o dinheiro caiu na sua conta antes de assinar a transferência. Desconfie de comprovante enviado por foto.",
      },
    ],
    cta: {
      text: "Anuncie seu carro grátis no NovoSeminovo e gere a Vitrine: imagem para Instagram e WhatsApp e cartaz com QR code para o vidro.",
      href: "/anunciar",
      label: "Anunciar grátis",
    },
    links: [
      { href: "/anunciar", label: "Anunciar grátis" },
      { guide: "como-evitar-golpe" },
      { href: "/guia/vender-carro", label: "Guias para vender carro" },
    ],
    publishedAt: "2026-11-16",
  },
  {
    id: "como-avaliar",
    topic: "comprar-carro-usado",
    slug: "como-avaliar",
    heading: "Como avaliar um carro usado antes de comprar",
    title: "Como avaliar um carro usado: checklist antes de comprar | NovoSeminovo",
    description:
      "Checklist para avaliar um carro usado: documento, preço FIPE, lataria, pneus, motor, test drive e revisões.",
    quickAnswer:
      "avalie em quatro passos: documento e preço, parte de fora (lataria e pneus), parte de dentro (motor e interior) e test drive. Se puder, leve um mecânico de confiança ou faça uma vistoria cautelar.",
    sections: [
      {
        title: "1. Documento e preço",
        kind: "ul",
        items: [
          "O nome no documento (CRLV) é o de quem vende, e o chassi do carro bate com o documento.",
          "Compare o preço com a tabela de referência FIPE. Muito abaixo pede cuidado redobrado.",
        ],
      },
      {
        title: "2. Lataria e pneus",
        kind: "ul",
        items: [
          "**Pintura:** diferença de tom entre as peças ou folgas desiguais nas portas e no capô podem indicar batida.",
          "**Pneus:** desgaste só de um lado pode indicar problema de alinhamento ou de suspensão.",
          "**Vidros e faróis:** confira trincas e se todos funcionam.",
        ],
      },
      {
        title: "3. Motor e interior",
        kind: "ul",
        items: [
          "Ligue o motor frio e observe: fumaça, barulhos e falhas.",
          "Procure vazamentos de óleo ou de água embaixo do carro.",
          "O desgaste do volante, dos bancos e dos pedais tem que combinar com a quilometragem.",
          "Teste ar-condicionado, vidros elétricos, travas e painel.",
          "Peça o manual com o registro das revisões.",
        ],
      },
      {
        title: "4. Test drive",
        kind: "ul",
        items: [
          "Rode em ruas com buraco e lombada: barulhos na suspensão aparecem aí.",
          "O câmbio tem que trocar as marchas sem tranco.",
          "Em linha reta, o carro não pode “puxar” para um lado.",
          "Freie com firmeza: o carro tem que parar reto e sem barulho.",
        ],
      },
    ],
    faq: [
      {
        q: "Vale pagar um mecânico para ver o carro?",
        a: "Na maioria das vezes, sim: é um custo pequeno perto de um problema escondido.",
      },
      {
        q: "O que é vistoria cautelar?",
        a: "Um laudo feito por empresa especializada que avalia estrutura, chassi e itens do carro antes da compra.",
      },
      {
        q: "Carro de leilão é problema?",
        a: "Não necessariamente, mas costuma valer menos na revenda e pode ter restrição no seguro. Pergunte antes.",
      },
    ],
    cta: {
      text: "Veja carros de lojas verificadas e veja as opções de financiamento no próprio anúncio. O NovoSeminovo não é instituição financeira e não concede crédito.",
      href: "/carros",
      label: "Ver carros",
    },
    links: [
      { href: "/carros", label: "Carros à venda" },
      // O PDF pedia /carros/suv; a página /carros não filtra por carroceria,
      // a busca filtra (bodyType=suv, lista fixa VEHICLE_BODY_TYPE_OPTIONS).
      { href: "/busca?assetType=vehicle&bodyType=suv", label: "Carros SUV" },
      { guide: "como-evitar-golpe" },
      { href: "/assistente-compra", label: "Assistente de compra" },
    ],
    publishedAt: "2026-11-16",
  },
  {
    id: "matricula-atualizada",
    topic: "comprar-imovel",
    slug: "matricula-atualizada",
    heading: "Matrícula atualizada do imóvel: o que é e onde pedir",
    title: "Matrícula atualizada do imóvel: o que é e onde pedir | NovoSeminovo",
    description:
      "Entenda a matrícula do imóvel, onde pedir a certidão atualizada e o que conferir nela antes de dar qualquer sinal.",
    quickAnswer:
      "a matrícula é o “RG” do imóvel: mostra quem é o dono e se há dívidas, hipotecas ou penhoras. Peça a certidão atualizada no Cartório de Registro de Imóveis da região do imóvel (presencialmente ou pela internet) antes de dar qualquer sinal.",
    sections: [
      {
        title: "O que é a matrícula?",
        kind: "p",
        paragraphs: [
          "É o registro oficial do imóvel no cartório. Nela ficam a descrição do imóvel, quem são os donos ao longo do tempo e tudo o que pesa sobre ele.",
        ],
      },
      {
        title: "Onde pedir?",
        kind: "ul",
        items: [
          "No **Cartório de Registro de Imóveis** responsável pela região onde fica o imóvel.",
          "Ou pela **internet**, no portal oficial dos cartórios de registro de imóveis (ONR).",
          "Bancos e cartórios costumam pedir a certidão emitida há pouco tempo (geralmente até 30 dias).",
        ],
      },
      {
        title: "O que conferir?",
        kind: "ol",
        items: [
          "**Quem é o dono hoje:** tem que ser quem está vendendo. Se forem vários donos (um casal, herdeiros), todos precisam concordar com a venda.",
          "**Ônus:** hipoteca, alienação fiduciária (financiamento), penhora ou ação judicial. Qualquer um desses pede cuidado e orientação.",
          "**Descrição:** área, endereço e construções têm que bater com o imóvel que você visitou.",
          "**Averbações:** construções e reformas precisam estar registradas.",
        ],
      },
    ],
    faq: [
      {
        q: "Imóvel sem matrícula pode ser comprado?",
        a: "Existe, mas é arriscado (por exemplo, o “contrato de gaveta”). Procure orientação de um advogado ou do cartório antes.",
      },
      {
        q: "A matrícula substitui as outras certidões?",
        a: "Não. Também vale pedir as certidões do vendedor (dívidas e ações) e a de débitos do imóvel (IPTU e condomínio).",
      },
    ],
    cta: {
      text: "Encontre imóveis de imobiliárias e corretores verificados no NovoSeminovo e veja como o imóvel pode ficar com o Arquiteto NovoSeminovo.",
      href: "/imoveis",
      label: "Ver imóveis",
    },
    links: [
      { href: "/imoveis", label: "Imóveis à venda e para alugar" },
      { guide: "golpes" },
      { href: "/guia/comprar-imovel", label: "Guias para comprar imóvel" },
    ],
    publishedAt: "2026-11-16",
  },
  {
    id: "golpes",
    topic: "comprar-imovel",
    slug: "golpes",
    heading: "Golpes na compra e no aluguel de imóvel: como se proteger",
    title: "Golpes na compra e no aluguel de imóvel: como se proteger | NovoSeminovo",
    description:
      "Os golpes mais comuns em imóvel (anúncio falso, sinal sem visita, falso dono) e os cuidados antes de pagar qualquer valor.",
    quickAnswer:
      "não pague nenhum valor sem visitar o imóvel, sem conferir na matrícula quem é o dono e sem contrato assinado. Preço muito abaixo da região e pressa para “reservar” são os sinais mais comuns de golpe.",
    sections: [
      {
        title: "Quais são os golpes mais comuns?",
        kind: "ul",
        items: [
          "**Anúncio falso:** fotos copiadas de outro anúncio, preço baixo e um “dono” que não pode mostrar o imóvel.",
          "**Depósito para reservar:** pedem um Pix para “segurar” o imóvel antes da visita.",
          "**Falso dono ou falso corretor:** alguém se passa pelo proprietário ou por corretor e some com o sinal.",
          "**Leilão falso:** sites que imitam leilões de verdade, com imóveis muito baratos.",
        ],
      },
      {
        title: "Como se proteger?",
        kind: "ol",
        items: [
          "**Visite o imóvel** antes de qualquer pagamento.",
          "**Peça a matrícula atualizada** e confira se quem vende ou aluga é o dono (ou tem procuração).",
          "**Confira o CRECI** do corretor ou da imobiliária no Conselho Regional de Corretores de Imóveis do seu estado.",
          "**Pague para a conta do dono** (ou da imobiliária com CNPJ), nunca para terceiros.",
          "**Tudo por escrito:** contrato assinado antes de qualquer sinal.",
          "**Desconfie da pressa** e de preço muito abaixo dos outros imóveis da região.",
        ],
      },
      {
        title: "Como o NovoSeminovo ajuda?",
        kind: "ul",
        items: [
          "Imobiliárias e corretores com **selo verificado** (empresa conferida pela nossa equipe).",
          "**Contato protegido:** o telefone não aparece na descrição, e o WhatsApp só abre com login.",
        ],
      },
    ],
    faq: [
      {
        q: "Posso pagar a reserva por Pix?",
        a: "Só depois da visita, de conferir a matrícula e com contrato ou recibo assinado, para a conta do dono ou da imobiliária.",
      },
      {
        q: "Como sei se o corretor existe?",
        a: "Consulte o número do CRECI no site do conselho regional do seu estado.",
      },
    ],
    cta: { text: "Procure imóveis de anunciantes verificados no NovoSeminovo.", href: "/imoveis", label: "Ver imóveis" },
    links: [
      { href: "/imoveis", label: "Imóveis à venda e para alugar" },
      { guide: "matricula-atualizada" },
      { href: "/guia/comprar-imovel", label: "Guias para comprar imóvel" },
    ],
    publishedAt: "2026-11-16",
  },
];

export function guideUrl(guide: Pick<Guide, "topic" | "slug">): string {
  return `/guia/${guide.topic}/${guide.slug}`;
}

export function topicUrl(topic: GuideTopicSlug): string {
  return `/guia/${topic}`;
}

export function findTopic(slug: string): GuideTopic | undefined {
  return GUIDE_TOPICS.find((topic) => topic.slug === slug);
}

export function findGuide(topic: string, slug: string): Guide | undefined {
  return GUIDES.find((guide) => guide.topic === topic && guide.slug === slug);
}

export function guidesOfTopic(topic: GuideTopicSlug): Guide[] {
  return GUIDES.filter((guide) => guide.topic === topic);
}

/** Link interno com o endereço real (um "Guia N" vira a URL do guia). */
export function resolveLink(link: GuideLink): { href: string; label: string } {
  if ("href" in link) return link;
  const target = GUIDES.find((guide) => guide.id === link.guide);
  if (!target) throw new Error(`Guia inexistente: ${link.guide}`);
  return { href: guideUrl(target), label: target.heading };
}

/** Todos os endereços dos guias (índice, temas e guias), para o sitemap. */
export function allGuidePaths(): string[] {
  return ["/guia", ...GUIDE_TOPICS.map((topic) => topicUrl(topic.slug)), ...GUIDES.map(guideUrl)];
}

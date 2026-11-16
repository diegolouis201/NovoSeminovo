// Guias de SEO: fase 1 (guias 1 a 5) e fase 2 (guias 6 a 20), texto do
// marketing revisado em 16/11/2026. Conteúdo fixo: mudar um guia é mudar
// este arquivo. Endereços exatamente como nos PDFs do marketing (os posts já
// usam esses links).
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
  /** note: parágrafo depois da lista (ex.: "confira na Caixa"). */
  | { title: string; kind: "ul" | "ol"; items: string[]; note?: string }
  | { title: string; kind: "p"; paragraphs: string[] };

/** Link interno: rota do site ou outro guia (resolvido pelo id). */
export type GuideLink = { href: string; label: string } | { guide: GuideId };

export type GuideId =
  | "como-evitar-golpe"
  | "documentos"
  | "como-avaliar"
  | "matricula-atualizada"
  | "golpes"
  | "documentos-e-transferencia"
  | "tabela-fipe"
  | "financiamento-veiculo"
  | "loja-ou-particular"
  | "test-drive"
  | "custo-de-manter"
  | "suv-hatch-ou-sedan"
  | "qual-carro-cabe-no-bolso"
  | "checklist-da-visita"
  | "certidoes-do-vendedor"
  | "itbi-e-escritura"
  | "financiamento-imovel"
  | "fgts"
  | "apartamento-ou-casa"
  | "arquiteto-novoseminovo";

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
  /** Aviso em itálico abaixo da chamada (ex.: "não é instituição financeira"). */
  ctaNote?: string;
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
    description:
      "Golpe, documentos e transferência, tabela FIPE, financiamento, test drive e custos: o que saber antes de comprar carro usado.",
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
    description:
      "Matrícula, certidões, ITBI e escritura, financiamento, FGTS, visita e golpes: o que conferir antes de comprar imóvel.",
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
  // ---------------------------------------------------------------- Fase 2
  // Guias 6 a 20 (PDF "Guias SEO do NovoSeminovo: fase 2"). Ajustes sobre o
  // texto do marketing estão comentados em cada guia.
  {
    id: "documentos-e-transferencia",
    topic: "comprar-carro-usado",
    slug: "documentos-e-transferencia",
    heading: "Documentos na compra e na transferência do carro",
    title: "Documentos para comprar carro usado e fazer a transferência | NovoSeminovo",
    description:
      "O que pedir ao vendedor, como funciona a transferência com a ATPV-e e qual é o prazo para passar o carro para o seu nome.",
    quickAnswer:
      "confira o CRLV e a identidade do dono, veja se não há débitos nem restrições, receba a ATPV-e (a autorização de transferência digital) preenchida com os seus dados e faça a transferência no Detran. Pelo Código de Trânsito, o comprador tem 30 dias para passar o carro para o próprio nome.",
    sections: [
      {
        title: "O que pedir ao vendedor?",
        kind: "ul",
        items: [
          "**CRLV** (documento do carro, em geral digital, no app Carteira Digital de Trânsito).",
          "**Documento de identidade e CPF** de quem está no CRLV.",
          "**ATPV-e** preenchida com os seus dados e o valor da venda, assinada pelo vendedor (pelo app ou com firma reconhecida, conforme o estado).",
          "**Comprovante de quitação** do financiamento e baixa do gravame, se o carro foi financiado.",
        ],
      },
      {
        title: "Como funciona a transferência?",
        kind: "ol",
        items: [
          "Confira no **Detran do seu estado** se há débitos (IPVA, licenciamento, multas) ou restrições. Débito em aberto trava a transferência.",
          "O vendedor gera a **ATPV-e** com os seus dados.",
          "Você faz a **vistoria**, quando o seu estado exige.",
          "Paga as taxas de transferência e o Detran emite o **novo CRLV** no seu nome.",
          "O vendedor faz a **comunicação de venda**, para multas futuras não irem para ele.",
        ],
      },
      {
        title: "Quanto tempo eu tenho?",
        kind: "p",
        paragraphs: [
          "Até **30 dias** depois da compra. Passado o prazo, o Detran cobra multa e pontos na carteira de quem comprou.",
        ],
      },
    ],
    faq: [
      {
        q: "Posso rodar com o carro antes de transferir?",
        a: "Pode, dentro dos 30 dias e com o CRLV em dia, mas transfira o quanto antes: até lá, o carro continua no nome de outra pessoa.",
      },
      {
        q: "Comprei de loja. Quem faz a transferência?",
        a: "Muitas lojas cuidam disso para o cliente. Combine por escrito quem faz e em quanto tempo.",
      },
    ],
    cta: {
      text: "Ache seu carro no NovoSeminovo e veja as opções de financiamento no próprio anúncio.",
      href: "/carros",
      label: "Ver carros",
    },
    links: [
      { href: "/carros", label: "Carros à venda" },
      { guide: "como-evitar-golpe" },
      { guide: "documentos" },
      { href: "/guia/comprar-carro-usado", label: "Guias para comprar carro usado" },
    ],
    publishedAt: "2026-11-16",
  },
  {
    id: "tabela-fipe",
    topic: "comprar-carro-usado",
    slug: "tabela-fipe",
    heading: "Tabela FIPE: como usar na negociação",
    title: "Tabela FIPE: o que é e como usar para negociar carro usado | NovoSeminovo",
    description:
      "A FIPE é um preço médio de referência, não um preço fixo. Veja como usar a tabela para saber se o carro está caro, barato ou justo.",
    quickAnswer:
      "a tabela FIPE mostra o preço médio de cada modelo, ano e versão, atualizado todo mês. Ela é uma **referência**, não um preço obrigatório: quilometragem, estado de conservação, opcionais e a cidade fazem o preço real subir ou descer.",
    sections: [
      {
        title: "O que é a tabela FIPE?",
        kind: "p",
        paragraphs: [
          "Uma pesquisa mensal da Fundação Instituto de Pesquisas Econômicas com o preço médio de carros no Brasil. É usada por lojas, seguradoras e bancos como base de valor.",
        ],
      },
      {
        title: "Como usar na negociação?",
        kind: "ol",
        items: [
          "Encontre **modelo, ano e versão exatos**: a diferença entre versões pode ser grande.",
          "Compare o preço pedido com a FIPE.",
          "**Acima da FIPE:** pode se justificar por baixa quilometragem, revisões em dia ou acessórios. Peça para ver.",
          "**Muito abaixo da FIPE:** desconfie. Preço bom demais é o primeiro sinal de golpe (veja o guia de como evitar golpe).",
          "Use os defeitos que achar na avaliação (pneu, pintura, manutenção atrasada) como argumento para negociar.",
        ],
      },
    ],
    faq: [
      {
        q: "O vendedor é obrigado a vender pela FIPE?",
        a: "Não. A FIPE é só uma referência; o preço é combinado entre as partes.",
      },
      {
        q: "A FIPE vale para carro de leilão ou com sinistro?",
        a: "Esses carros costumam valer menos que a tabela. Pergunte sempre.",
      },
    ],
    // Ajuste: a referência FIPE só aparece no anúncio quando está no cadastro
    // (components/FipeReference.tsx não mostra nada sem ela).
    cta: {
      text: "No NovoSeminovo, o anúncio de carro mostra o preço de referência FIPE, quando ele está no cadastro, para você comparar antes de ligar.",
      href: "/carros",
      label: "Ver carros",
    },
    links: [
      { href: "/carros", label: "Carros à venda" },
      { guide: "como-avaliar" },
      { guide: "como-evitar-golpe" },
      { href: "/guia/comprar-carro-usado", label: "Guias para comprar carro usado" },
    ],
    publishedAt: "2026-11-16",
  },
  {
    id: "financiamento-veiculo",
    topic: "comprar-carro-usado",
    slug: "financiamento",
    heading: "Financiamento de veículo: como funciona a simulação",
    title: "Financiamento de carro usado: como funciona a simulação | NovoSeminovo",
    description:
      "Entrada, prazo, juros e CET: entenda o que muda a parcela do financiamento do carro e simule antes de decidir.",
    quickAnswer:
      "a parcela depende de quanto você dá de entrada, do prazo e dos juros. Compare sempre o **CET (Custo Efetivo Total)**, que soma juros, tarifas e seguros. A simulação é uma estimativa; o valor final depende da análise da instituição financeira.",
    sections: [
      {
        title: "O que muda a parcela?",
        kind: "ul",
        items: [
          "**Entrada:** quanto maior, menor o valor financiado e menos juros você paga.",
          "**Prazo:** mais meses deixam a parcela menor, mas o total pago fica maior.",
          "**Juros e CET:** o CET é o número que permite comparar propostas diferentes.",
          "**Ano do carro:** carros mais antigos podem ter condições diferentes.",
        ],
      },
      {
        title: "Passo a passo",
        kind: "ol",
        items: [
          "Defina quanto da sua renda cabe na parcela (veja o guia de qual carro cabe no bolso).",
          "Simule com entrada e prazos diferentes.",
          "Peça a proposta e leia o **CET** e o valor total.",
          "Seguros e serviços extras são opcionais: ninguém pode obrigar você a contratar para liberar o crédito.",
          "Depois de assinado, o carro fica com **alienação fiduciária** (gravame) até a última parcela.",
        ],
      },
    ],
    faq: [
      {
        q: "Simular garante a aprovação?",
        a: "Não. A simulação é uma estimativa; aprovação, taxa e parcela dependem da análise da instituição.",
      },
      {
        q: "Posso quitar antes?",
        a: "Pode, com desconto dos juros das parcelas que faltam (direito previsto no Código de Defesa do Consumidor).",
      },
    ],
    cta: {
      text: "Veja as opções de financiamento no próprio anúncio do NovoSeminovo e simule as parcelas sem custo. Atendimento de crédito pela nossa parceira de crédito.",
      href: "/carros",
      label: "Ver carros",
    },
    ctaNote:
      "O NovoSeminovo não é instituição financeira e não concede crédito. Simulações são estimativas e dependem da análise da instituição.",
    links: [
      { href: "/carros", label: "Carros à venda" },
      { guide: "qual-carro-cabe-no-bolso" },
      { guide: "documentos-e-transferencia" },
      { href: "/guia/comprar-carro-usado", label: "Guias para comprar carro usado" },
    ],
    publishedAt: "2026-11-16",
  },
  {
    id: "loja-ou-particular",
    topic: "comprar-carro-usado",
    slug: "loja-ou-particular",
    heading: "Comprar carro de loja ou de particular: o que muda",
    title: "Comprar carro usado de loja ou de particular: o que muda | NovoSeminovo",
    description:
      "Garantia, preço, documentação e segurança: as diferenças entre comprar carro de loja e de pessoa física.",
    quickAnswer:
      "na loja você tem a proteção do Código de Defesa do Consumidor, inclusive a garantia legal de 90 dias para defeitos, e costuma ter ajuda com documentação e financiamento. Com particular, o preço pode ser menor, mas a proteção é menor e você precisa conferir tudo sozinho.",
    sections: [
      {
        title: "Comprando de loja",
        kind: "ul",
        items: [
          "**Garantia legal de 90 dias** para defeitos (Código de Defesa do Consumidor), além de garantias extras que a loja oferecer por escrito.",
          "Ajuda com **transferência e financiamento**.",
          "Nota fiscal e empresa com CNPJ para cobrar se der problema.",
        ],
      },
      {
        title: "Comprando de particular",
        kind: "ul",
        items: [
          "Preço muitas vezes menor.",
          "A relação segue o **Código Civil**: a proteção contra defeito escondido existe, mas é mais curta e mais difícil de cobrar.",
          "Você confere documento, débitos e estado do carro por conta própria.",
        ],
      },
      {
        title: "Em qualquer caso",
        kind: "ol",
        items: [
          "Veja o carro pessoalmente e faça test drive.",
          "Confira o CRLV e o chassi.",
          "Pague só na transferência, para a conta de quem está no documento.",
        ],
      },
    ],
    faq: [
      {
        q: "Loja pode vender carro “no estado”, sem garantia?",
        a: "A garantia legal de 90 dias vale mesmo assim para defeitos que existiam na venda.",
      },
      {
        q: "Como sei se a loja é confiável?",
        a: "Procure o selo verificado (empresa conferida pela nossa equipe), avaliações e endereço físico.",
      },
    ],
    cta: { text: "Procure carros de lojas com selo verificado no NovoSeminovo.", href: "/carros", label: "Ver carros" },
    links: [
      { href: "/carros", label: "Carros à venda" },
      { guide: "como-evitar-golpe" },
      { guide: "como-avaliar" },
      { href: "/guia/comprar-carro-usado", label: "Guias para comprar carro usado" },
    ],
    publishedAt: "2026-11-16",
  },
  {
    id: "test-drive",
    topic: "comprar-carro-usado",
    slug: "test-drive",
    heading: "Test drive: o que observar",
    title: "Test drive de carro usado: o que observar | NovoSeminovo",
    description:
      "Checklist de test drive: partida a frio, freio, câmbio, suspensão, direção e barulhos. O que testar em 15 minutos.",
    quickAnswer:
      "ligue o carro frio, rode pelo menos 15 minutos em ruas diferentes (asfalto bom, buraco, subida) e teste freio, câmbio, direção e suspensão. Barulho estranho, carro puxando para um lado ou luz acesa no painel pedem uma avaliação de mecânico antes de fechar.",
    sections: [
      {
        title: "Antes de sair",
        kind: "ul",
        items: [
          "Peça para **ligar o motor frio**: problemas aparecem mais na partida.",
          "Veja se **todas as luzes do painel** apagam depois da partida.",
          "Teste ar-condicionado, vidros, travas e som.",
        ],
      },
      {
        title: "Rodando",
        kind: "ol",
        items: [
          "**Freio:** freie firme em reta. O carro tem que parar reto, sem tremer.",
          "**Câmbio:** as marchas devem entrar macias; no automático, sem trancos.",
          "**Direção:** solte levemente o volante em reta: o carro não pode puxar.",
          "**Suspensão:** passe em buraco e lombada devagar. Batidas secas indicam desgaste.",
          "**Motor:** acelere em subida e veja se o carro responde sem engasgar.",
        ],
      },
      {
        title: "Depois",
        kind: "p",
        paragraphs: ["Olhe embaixo do carro se há vazamento e sinta cheiro de queimado ou combustível."],
      },
    ],
    faq: [
      {
        q: "O vendedor não deixa fazer test drive. E agora?",
        a: "Desconfie. Sem rodar com o carro, não compre.",
      },
      {
        q: "Preciso de CNH?",
        a: "Sim. Quem dirige no test drive precisa de carteira válida.",
      },
    ],
    cta: { text: "Ache um carro no NovoSeminovo e agende a visita com quem anuncia.", href: "/carros", label: "Ver carros" },
    links: [
      { href: "/carros", label: "Carros à venda" },
      { guide: "como-avaliar" },
      { guide: "loja-ou-particular" },
      { href: "/guia/comprar-carro-usado", label: "Guias para comprar carro usado" },
    ],
    publishedAt: "2026-11-16",
  },
  {
    id: "custo-de-manter",
    topic: "comprar-carro-usado",
    slug: "custo-de-manter",
    heading: "Quanto custa manter um carro",
    title: "Quanto custa manter um carro: IPVA, seguro, licenciamento e manutenção | NovoSeminovo",
    description:
      "Além da parcela: os custos fixos e variáveis de ter um carro e como colocar tudo no orçamento antes de comprar.",
    quickAnswer:
      "além da parcela, some IPVA, licenciamento, seguro, manutenção, combustível e estacionamento. O IPVA é um percentual do valor do carro e varia por estado. Faça a conta anual antes de escolher o modelo: dois carros com o mesmo preço podem ter custos de manutenção bem diferentes.",
    sections: [
      {
        title: "Custos fixos (todo ano)",
        kind: "ul",
        items: [
          "**IPVA:** imposto estadual; a alíquota e o calendário mudam de estado para estado. Alguns estados isentam carros mais antigos.",
          "**Licenciamento:** taxa anual do Detran para o carro poder circular.",
          "**Seguro:** varia com o modelo, a sua idade, o CEP e o uso.",
        ],
      },
      {
        title: "Custos variáveis",
        kind: "ul",
        items: [
          "**Combustível:** depende do consumo do modelo e de quanto você roda.",
          "**Manutenção:** revisões, pneus, freios e peças. Modelos populares costumam ter peça mais barata e fácil de achar.",
          "**Estacionamento, pedágio e lavagem.**",
        ],
      },
      {
        title: "Como fazer a conta",
        kind: "ol",
        items: [
          "Some os custos fixos do ano e divida por 12.",
          "Estime combustível e manutenção do mês.",
          "Some a parcela, se for financiar.",
          "Veja se o total cabe no orçamento (guia de qual carro cabe no bolso).",
        ],
      },
    ],
    faq: [
      {
        q: "Carro mais velho é sempre mais barato de manter?",
        a: "Não. O IPVA pode ser menor, mas a manutenção tende a subir.",
      },
      {
        q: "Posso comprar carro com IPVA atrasado?",
        a: "O débito acompanha o carro e precisa ser pago para transferir. Combine com o vendedor antes.",
      },
    ],
    cta: { text: "Compare carros e preços de referência no NovoSeminovo.", href: "/carros", label: "Ver carros" },
    links: [
      { href: "/carros", label: "Carros à venda" },
      { guide: "qual-carro-cabe-no-bolso" },
      { guide: "financiamento-veiculo" },
      { href: "/guia/comprar-carro-usado", label: "Guias para comprar carro usado" },
    ],
    publishedAt: "2026-11-16",
  },
  {
    id: "suv-hatch-ou-sedan",
    topic: "comprar-carro-usado",
    slug: "suv-hatch-ou-sedan",
    heading: "SUV, hatch ou sedan: qual combina com você",
    title: "SUV, hatch ou sedan: qual tipo de carro escolher | NovoSeminovo",
    description:
      "Espaço, consumo, preço e uso no dia a dia: as diferenças entre SUV, hatch, sedan e picape para escolher o carro certo.",
    quickAnswer:
      "hatch é o mais fácil de estacionar e costuma gastar menos; sedan tem porta-malas maior e é confortável na estrada; SUV tem posição de dirigir mais alta e lida melhor com rua ruim, mas costuma custar mais e consumir mais. Escolha pelo seu uso: cidade, estrada, família ou trabalho.",
    sections: [
      {
        title: "Hatch",
        kind: "ul",
        items: ["Compacto, ágil na cidade, fácil de estacionar.", "Porta-malas menor.", "Bom para quem roda sozinho ou em dupla."],
      },
      {
        title: "Sedan",
        kind: "ul",
        items: ["Porta-malas grande e separado da cabine.", "Confortável em viagem.", "Mais comprido para estacionar."],
      },
      {
        title: "SUV",
        kind: "ul",
        items: [
          "Posição de dirigir alta e boa visão da rua.",
          "Altura do solo maior para lombada, buraco e rua de terra.",
          "Em geral preço, seguro e consumo maiores que um hatch do mesmo porte.",
        ],
      },
      {
        title: "Picape",
        kind: "ul",
        items: ["Caçamba para carga e trabalho.", "Maior e com consumo mais alto."],
      },
    ],
    faq: [
      {
        q: "Família com criança pequena: qual escolher?",
        a: "Veja o porta-malas com o carrinho e a cadeirinha dentro. Sedan e SUV costumam levar vantagem.",
      },
      {
        q: "Qual gasta menos?",
        a: "Em geral, os hatches. Compare sempre o consumo do modelo específico.",
      },
    ],
    cta: { text: "Veja SUVs, hatches e sedans no NovoSeminovo.", href: "/carros", label: "Ver carros" },
    links: [
      { href: "/busca?assetType=vehicle&bodyType=suv", label: "SUVs à venda" },
      { href: "/carros", label: "Carros à venda" },
      { guide: "custo-de-manter" },
      { href: "/guia/comprar-carro-usado", label: "Guias para comprar carro usado" },
    ],
    publishedAt: "2026-11-16",
  },
  {
    id: "qual-carro-cabe-no-bolso",
    topic: "comprar-carro-usado",
    slug: "qual-carro-cabe-no-bolso",
    heading: "Qual carro cabe no meu bolso",
    title: "Qual carro cabe no meu bolso? Como calcular | NovoSeminovo",
    description:
      "Como calcular quanto gastar no carro, considerando entrada, parcela e custos de manter, sem apertar o orçamento.",
    quickAnswer:
      "some a parcela (se for financiar) e os custos de manter o carro (veja o guia de quanto custa manter um carro) e veja quanto sobra da sua renda. Uma regra prática usada por muitos educadores financeiros é não comprometer mais do que cerca de 30% da renda com todas as parcelas somadas. Com esse número, você chega à faixa de preço certa.",
    sections: [
      {
        title: "Passo a passo",
        kind: "ol",
        items: [
          "**Renda líquida do mês:** o que cai na conta.",
          "**Parcelas que você já tem:** cartão, empréstimos, outros financiamentos.",
          "**Limite de parcela:** a regra prática de até ~30% da renda para todas as parcelas.",
          "**Custos de manter:** IPVA, seguro, combustível e manutenção divididos por mês.",
          "**Entrada:** quanto mais entrada, menor a parcela e os juros.",
          "**Faixa de preço:** simule até achar o valor de carro que fecha a conta.",
        ],
      },
      {
        title: "Dicas",
        kind: "ul",
        items: ["Deixe uma reserva para imprevistos (pneu, bateria, revisão).", "Prefira prazo menor se a parcela couber: o total pago cai."],
      },
    ],
    faq: [
      {
        q: "Vale esticar o prazo para pegar um carro melhor?",
        a: "A parcela cai, mas o total pago sobe. Compare o valor final.",
      },
      {
        q: "Como achar carros na minha faixa?",
        a: "Filtre por preço na busca ou conte para o assistente do NovoSeminovo o que você procura e quanto quer gastar.",
      },
    ],
    cta: {
      text: "Conte o que você procura e o assistente do NovoSeminovo encontra para você. Simule as parcelas no próprio anúncio.",
      href: "/carros",
      label: "Ver carros",
    },
    ctaNote:
      "O NovoSeminovo não é instituição financeira e não concede crédito. Simulações são estimativas e dependem da análise da instituição.",
    links: [
      { href: "/carros", label: "Carros à venda" },
      { guide: "financiamento-veiculo" },
      { guide: "custo-de-manter" },
      { href: "/guia/comprar-carro-usado", label: "Guias para comprar carro usado" },
    ],
    publishedAt: "2026-11-16",
  },
  {
    id: "checklist-da-visita",
    topic: "comprar-imovel",
    slug: "checklist-da-visita",
    heading: "Checklist da visita ao imóvel",
    title: "Checklist da visita ao imóvel: o que olhar antes de comprar | NovoSeminovo",
    description:
      "Umidade, rachaduras, instalações, luz, barulho e vizinhança: o que conferir na visita ao imóvel antes de fazer proposta.",
    quickAnswer:
      "visite de dia e, se puder, também à noite. Procure sinais de umidade e rachaduras, teste torneiras, descargas e tomadas, veja a luz do sol e o barulho da rua, e converse com vizinhos ou com o síndico. Fotos e anotações ajudam a comparar imóveis depois.",
    sections: [
      {
        title: "Estrutura e acabamento",
        kind: "ul",
        items: [
          "**Umidade e mofo:** manchas no teto, cantos e atrás de armários.",
          "**Rachaduras:** principalmente em diagonal, perto de portas e janelas.",
          "**Piso e revestimento:** peças soltas ou ocas.",
        ],
      },
      {
        title: "Instalações",
        kind: "ul",
        items: [
          "Abra torneiras e chuveiro: veja pressão e vazamentos.",
          "Dê descarga.",
          "Teste tomadas e interruptores; veja o quadro de luz.",
          "Pergunte a idade da parte elétrica e hidráulica.",
        ],
      },
      {
        title: "Entorno",
        kind: "ul",
        items: ["Sol da manhã ou da tarde, ventilação.", "Barulho da rua, de bares ou de obras.", "Transporte, comércio, escola e segurança."],
      },
    ],
    faq: [
      { q: "Quantas vezes devo visitar?", a: "Pelo menos duas, em horários diferentes." },
      {
        q: "Posso levar alguém para avaliar?",
        a: "Sim. Um engenheiro, arquiteto ou pedreiro de confiança enxerga problemas que passam despercebidos.",
      },
    ],
    cta: {
      text: "Encontre imóveis no NovoSeminovo e veja no anúncio como o imóvel pode ficar com o Arquiteto NovoSeminovo.",
      href: "/imoveis",
      label: "Ver imóveis",
    },
    links: [
      { href: "/imoveis", label: "Imóveis à venda e para alugar" },
      { guide: "matricula-atualizada" },
      { guide: "arquiteto-novoseminovo" },
      { href: "/guia/comprar-imovel", label: "Guias para comprar imóvel" },
    ],
    publishedAt: "2026-11-16",
  },
  {
    id: "certidoes-do-vendedor",
    topic: "comprar-imovel",
    slug: "certidoes-do-vendedor",
    heading: "Certidões do vendedor: quais pedir",
    title: "Certidões do vendedor na compra de imóvel: quais pedir | NovoSeminovo",
    description:
      "Matrícula atualizada, certidões de ações e protestos, IPTU e condomínio: os documentos que mostram se a compra é segura.",
    quickAnswer:
      "além da matrícula atualizada do imóvel, peça certidões em nome de quem vende (ações na Justiça, protestos e débitos), o comprovante de IPTU em dia e, em condomínio, a declaração de que não há taxas atrasadas. Um advogado ou o cartório indica a lista completa para o seu caso.",
    sections: [
      {
        title: "Do imóvel",
        kind: "ul",
        items: [
          "**Matrícula atualizada** com certidão de ônus reais (veja o guia da matrícula atualizada).",
          "**IPTU:** certidão negativa de débitos na prefeitura.",
          "**Condomínio:** declaração do síndico ou administradora de que não há dívida.",
        ],
      },
      {
        title: "De quem vende",
        kind: "ul",
        items: [
          "Certidões de **ações cíveis** e de **execuções fiscais** (Justiça estadual e federal).",
          "Certidão **trabalhista**.",
          "Certidão de **protesto**.",
          "Documentos pessoais e, se casado, os do cônjuge, que também assina.",
        ],
      },
      {
        title: "Por que isso importa?",
        kind: "p",
        paragraphs: ["Dívidas do vendedor podem, em alguns casos, atingir o imóvel vendido. As certidões mostram o risco antes de você pagar."],
      },
    ],
    faq: [
      // Ajuste: a validade muda de uma certidão para outra (a trabalhista, por
      // exemplo, vale bem mais que 30 dias); "cerca de 30 dias" ficou como
      // o caso comum, não como regra.
      {
        q: "As certidões têm validade?",
        a: "Sim. O prazo muda de uma certidão para outra e costuma vir escrito nela; muitas valem só cerca de 30 dias. Peça perto da data da escritura.",
      },
      {
        q: "Quem paga as certidões?",
        a: "É comum o comprador pedir e pagar, mas pode ser combinado entre as partes.",
      },
    ],
    cta: {
      text: "Procure imóveis de imobiliárias e corretores com selo verificado (empresa conferida pela nossa equipe) no NovoSeminovo.",
      href: "/imoveis",
      label: "Ver imóveis",
    },
    links: [
      { href: "/imoveis", label: "Imóveis à venda e para alugar" },
      { guide: "matricula-atualizada" },
      { guide: "itbi-e-escritura" },
      { href: "/guia/comprar-imovel", label: "Guias para comprar imóvel" },
    ],
    publishedAt: "2026-11-16",
  },
  {
    id: "itbi-e-escritura",
    topic: "comprar-imovel",
    slug: "itbi-e-escritura",
    heading: "ITBI e escritura: o que são e quando pagar",
    title: "ITBI e escritura: o que são, quanto custam e quando pagar | NovoSeminovo",
    description:
      "ITBI, escritura e registro: os três passos que fazem o imóvel ser seu de verdade, e quanto reservar para eles.",
    quickAnswer:
      "o **ITBI** é o imposto da prefeitura sobre a compra do imóvel; a alíquota é definida por cada cidade e costuma ficar entre 2% e 3%. A **escritura** é feita no cartório de notas e o **registro** no Cartório de Registro de Imóveis. Só depois do registro na matrícula o imóvel passa a ser seu.",
    sections: [
      {
        title: "Os 3 passos",
        kind: "ol",
        items: [
          "**ITBI:** pago à prefeitura, em geral antes da escritura ou do registro (cada cidade tem sua regra).",
          "**Escritura pública:** no cartório de notas. É obrigatória na compra de imóvel acima de 30 salários mínimos. No financiamento bancário, o contrato do banco costuma substituir a escritura.",
          "**Registro:** no Cartório de Registro de Imóveis da região. Quem não registra, não é dono.",
        ],
      },
      {
        title: "Quanto reservar?",
        kind: "p",
        paragraphs: [
          "Some ITBI, escritura e registro. As taxas de cartório seguem tabela de cada estado. Peça o orçamento ao cartório antes de fechar.",
        ],
      },
    ],
    faq: [
      { q: "Quem paga o ITBI?", a: "Em regra, quem compra, salvo combinado diferente no contrato." },
      {
        q: "Existe desconto?",
        a: "Algumas cidades têm redução para o primeiro imóvel ou para imóveis financiados por programas habitacionais. Consulte a prefeitura.",
      },
    ],
    cta: {
      text: "Encontre seu imóvel no NovoSeminovo e veja as opções de financiamento no próprio anúncio.",
      href: "/imoveis",
      label: "Ver imóveis",
    },
    links: [
      { href: "/imoveis", label: "Imóveis à venda e para alugar" },
      { guide: "certidoes-do-vendedor" },
      { guide: "financiamento-imovel" },
      { href: "/guia/comprar-imovel", label: "Guias para comprar imóvel" },
    ],
    publishedAt: "2026-11-16",
  },
  {
    id: "financiamento-imovel",
    topic: "comprar-imovel",
    slug: "financiamento",
    heading: "Financiamento imobiliário: como funciona a simulação",
    title: "Financiamento imobiliário: como funciona a simulação | NovoSeminovo",
    description:
      "Entrada, prazo, SAC ou Price, CET e seguros: entenda o que muda a parcela do financiamento do imóvel.",
    quickAnswer:
      "o banco financia uma parte do valor do imóvel e você paga a entrada. A parcela depende da entrada, do prazo, dos juros, do sistema de amortização (SAC ou Price) e dos seguros obrigatórios. Compare propostas pelo CET. A simulação é uma estimativa; a aprovação depende da análise da instituição.",
    sections: [
      {
        title: "O que entra na conta",
        kind: "ul",
        items: [
          "**Entrada:** a parte que o banco não financia. Pode incluir o FGTS (veja o guia do FGTS).",
          "**Prazo:** quanto mais longo, menor a parcela e maior o total pago.",
          "**SAC ou Price:** no SAC a parcela começa maior e vai caindo; na Price ela fica mais parecida do começo ao fim.",
          "**Seguros obrigatórios:** contra morte e invalidez e contra danos ao imóvel.",
          "**CET:** junta juros, tarifas e seguros. É o número para comparar.",
        ],
      },
      {
        title: "Passo a passo",
        kind: "ol",
        items: [
          "Veja quanto da renda cabe na parcela.",
          "Simule com entradas e prazos diferentes.",
          "Reúna os documentos pessoais e de renda.",
          "O banco avalia o imóvel e analisa o crédito.",
          "Assina o contrato, registra no cartório e o imóvel fica em alienação fiduciária até a quitação.",
        ],
      },
    ],
    faq: [
      {
        q: "Simular garante aprovação?",
        a: "Não. Aprovação, taxa e parcela dependem da análise da instituição.",
      },
      { q: "Posso usar FGTS?", a: "Em muitos casos, sim (veja o guia de como usar o FGTS)." },
    ],
    cta: {
      text: "Simule as parcelas no próprio anúncio do NovoSeminovo. Atendimento de crédito pela nossa parceira de crédito.",
      href: "/imoveis",
      label: "Ver imóveis",
    },
    ctaNote:
      "O NovoSeminovo não é instituição financeira e não concede crédito. Simulações são estimativas e dependem da análise da instituição.",
    links: [
      { href: "/imoveis", label: "Imóveis à venda e para alugar" },
      { guide: "fgts" },
      { guide: "itbi-e-escritura" },
      { href: "/guia/comprar-imovel", label: "Guias para comprar imóvel" },
    ],
    publishedAt: "2026-11-16",
  },
  {
    id: "fgts",
    topic: "comprar-imovel",
    slug: "fgts",
    heading: "Como usar o FGTS na compra do imóvel",
    title: "Como usar o FGTS para comprar imóvel: regras e passo a passo | NovoSeminovo",
    description:
      "Quem pode usar o FGTS, em que tipo de imóvel e como: na entrada, para amortizar ou para pagar parte das parcelas.",
    quickAnswer:
      "dá para usar o FGTS na compra da casa própria se você tem pelo menos 3 anos de trabalho com carteira assinada (somando todos os empregos), não tem outro financiamento habitacional ativo e não é dono de imóvel residencial na cidade onde mora ou trabalha. O imóvel tem que ser residencial, urbano e para você morar, dentro dos limites do Sistema Financeiro da Habitação.",
    sections: [
      {
        title: "Onde o FGTS pode entrar",
        kind: "ul",
        items: [
          "**Na entrada** da compra.",
          "**Para amortizar** o saldo devedor ou reduzir o prazo.",
          "**Para pagar parte das parcelas**, por um período, conforme as regras.",
        ],
      },
      {
        title: "Regras principais",
        kind: "ul",
        items: [
          "Pelo menos **3 anos** de trabalho sob o regime do FGTS.",
          "Sem **financiamento ativo** pelo Sistema Financeiro da Habitação.",
          "Sem **imóvel residencial** no município onde mora ou trabalha.",
          "Imóvel **residencial e urbano**, para moradia própria.",
        ],
        note: "As regras e os limites de valor mudam com o tempo: confira na Caixa e no banco que vai financiar.",
      },
    ],
    faq: [
      { q: "Posso usar o FGTS do casal?", a: "Sim, os dois podem somar, se cada um cumprir as regras." },
      {
        q: "Dá para usar FGTS em imóvel comercial ou terreno?",
        a: "Não, só residencial para morar (com exceções para construção, que seguem regras próprias).",
      },
    ],
    cta: {
      text: "Encontre seu imóvel no NovoSeminovo e veja as opções de financiamento no próprio anúncio.",
      href: "/imoveis",
      label: "Ver imóveis",
    },
    ctaNote: "O NovoSeminovo não é instituição financeira e não concede crédito.",
    links: [
      { href: "/imoveis", label: "Imóveis à venda e para alugar" },
      { guide: "financiamento-imovel" },
      { guide: "itbi-e-escritura" },
      { href: "/guia/comprar-imovel", label: "Guias para comprar imóvel" },
    ],
    publishedAt: "2026-11-16",
  },
  {
    id: "apartamento-ou-casa",
    topic: "comprar-imovel",
    slug: "apartamento-ou-casa",
    heading: "Apartamento ou casa: o que olhar no condomínio",
    title: "Apartamento ou casa? O que olhar no condomínio antes de comprar | NovoSeminovo",
    description:
      "Vantagens de cada um e o que conferir no condomínio: taxa, regras, obras previstas, vagas e atas de assembleia.",
    quickAnswer:
      "apartamento costuma ter mais segurança e lazer, mas tem taxa de condomínio e regras coletivas; casa dá mais espaço e liberdade, com mais manutenção por sua conta. Em condomínio, peça as últimas atas de assembleia: elas mostram obras previstas, taxas extras e problemas.",
    sections: [
      {
        title: "Apartamento",
        kind: "ul",
        items: ["Portaria, segurança e área de lazer.", "**Taxa de condomínio** todo mês.", "Regras sobre pets, reformas, barulho e mudança."],
      },
      {
        title: "Casa",
        kind: "ul",
        items: ["Mais espaço, quintal e liberdade para reformar.", "Manutenção e segurança por sua conta."],
      },
      {
        title: "O que conferir no condomínio",
        kind: "ol",
        items: [
          "**Valor da taxa** e se há **taxa extra** em andamento.",
          "**Atas das últimas assembleias**: obras aprovadas, brigas, dívidas.",
          "**Fundo de reserva** e inadimplência.",
          "**Vagas de garagem**: quantas, cobertas, se são fixas.",
          "**Regras** sobre pets, reforma e aluguel por temporada.",
        ],
      },
    ],
    faq: [
      {
        q: "Quem paga a taxa extra aprovada antes da venda?",
        a: "Combine no contrato. Dívidas de condomínio acompanham o imóvel.",
      },
      { q: "Casa em condomínio fechado tem taxa?", a: "Sim, e as mesmas perguntas valem." },
    ],
    // O mapa fica na busca de imóveis (/busca?assetType=property).
    cta: {
      text: "Compare apartamentos e casas no mapa do NovoSeminovo.",
      href: "/busca?assetType=property",
      label: "Ver imóveis no mapa",
    },
    links: [
      { href: "/imoveis", label: "Imóveis à venda e para alugar" },
      { guide: "checklist-da-visita" },
      { guide: "certidoes-do-vendedor" },
      { href: "/guia/comprar-imovel", label: "Guias para comprar imóvel" },
    ],
    publishedAt: "2026-11-16",
  },
  {
    id: "arquiteto-novoseminovo",
    topic: "comprar-imovel",
    slug: "arquiteto-novoseminovo",
    heading: "Ver o imóvel reformado antes de visitar: o Arquiteto NovoSeminovo",
    title: "Veja como o imóvel pode ficar reformado: Arquiteto NovoSeminovo | NovoSeminovo",
    description:
      "Com o Arquiteto NovoSeminovo, você vê no anúncio uma ideia de como o imóvel pode ficar reformado, com lista de compras.",
    quickAnswer:
      "o Arquiteto NovoSeminovo usa inteligência artificial para mostrar, no próprio anúncio, uma ideia de como o ambiente pode ficar depois de uma reforma, com uma lista de compras de referência. As imagens são ilustrativas: servem para imaginar o potencial do imóvel, não como projeto.",
    sections: [
      // Passos com os nomes reais da tela (app/anuncio/[id]/page.tsx,
      // app/anuncio/[id]/arquiteto/page.tsx e components/architect/ArchitectStudio.tsx),
      // como o marketing pediu. Mudou um botão lá? Mude aqui.
      {
        title: "Como funciona",
        kind: "ol",
        items: [
          "Abra um anúncio de imóvel no NovoSeminovo.",
          "Ao lado do preço, toque em **Arquiteto NovoSeminovo** (“Veja o imóvel reformado com IA”). É preciso entrar na sua conta.",
          "Em **1. Escolha os cômodos**, marque até 5 fotos do anúncio. Com mais de uma, escolha **Todos de uma vez** ou **Um cômodo por vez**.",
          "Em **2. Converse com o Arquiteto**, conte o que você imagina: estilo, orçamento, quem vai morar.",
          "Veja em **Antes e depois** a imagem do ambiente reformado (há um limite de imagens por dia) e, em **Lista de compras da reforma**, os itens com faixa de preço. Dá para **Imprimir ou salvar PDF**.",
        ],
      },
      {
        title: "Para que serve",
        kind: "ul",
        items: [
          "**Comprador:** imaginar o imóvel do seu jeito antes de visitar.",
          "**Quem vende:** mostrar o potencial de um imóvel que precisa de reforma.",
        ],
      },
      {
        title: "Cuidados",
        kind: "ul",
        items: [
          "As imagens são **geradas por IA e ilustrativas**.",
          "Reforma de verdade pede orçamento e, em obra estrutural, profissional habilitado e as regras do condomínio e da prefeitura.",
        ],
      },
    ],
    faq: [
      {
        q: "A lista de compras tem preço garantido?",
        a: "Não. É uma referência; preços e disponibilidade mudam.",
      },
      {
        q: "Funciona em qualquer anúncio?",
        a: "Nos anúncios de imóvel do NovoSeminovo onde a ferramenta estiver disponível.",
      },
    ],
    cta: { text: "Encontre imóveis no NovoSeminovo e veja como eles podem ficar.", href: "/imoveis", label: "Ver imóveis" },
    links: [
      { href: "/imoveis", label: "Imóveis à venda e para alugar" },
      { guide: "checklist-da-visita" },
      { guide: "apartamento-ou-casa" },
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

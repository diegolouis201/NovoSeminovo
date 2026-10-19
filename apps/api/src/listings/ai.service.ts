import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import type {
  AssetType,
  ClassifyPhotosResult,
  CrlvExtractResult,
  ListingDraft,
  PropertyProfileInput,
  VehicleProfileInput,
} from "@novoseminovo/shared-types";

const MODEL = "claude-sonnet-5-5";
// Leitura de documento (CRLV) e análise visual de fotos exigem um modelo com
// visão mais forte — usa Opus em vez do Sonnet dos outros recursos de texto
// acima, só nesses dois métodos.
const VISION_MODEL = "claude-opus-5-5";

const DRAFT_TOOL = {
  name: "gerar_anuncio",
  description: "Gera o rascunho de um anúncio (título, descrição e, se der pra estimar, um preço sugerido) a partir do texto livre que o dono do bem escreveu.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: {
        type: "string",
        description: "Título do anúncio, direto e chamativo, até 80 caracteres. Inclui marca/modelo/ano (veículo) ou tipo/bairro (imóvel) quando o texto do usuário mencionar.",
      },
      description: {
        type: "string",
        description: "Descrição completa e persuasiva do anúncio, em português do Brasil, baseada fielmente no que o usuário escreveu — nunca inventa detalhes (estado de conservação, histórico, itens) que o texto não mencionou.",
      },
      suggestedPrice: {
        type: "number",
        description: "Só preencha se o preço aparecer explicitamente no texto do usuário ou puder ser inferido com segurança de uma tabela de referência pública conhecida (ex.: FIPE para um carro comum). Nunca invente um preço de mercado.",
      },
    },
    required: ["title", "description"],
  },
};

const RECOMMEND_TOOL = {
  name: "recomendar_veiculo",
  description:
    "Escolhe, dentre os anúncios de veículos oferecidos, os que melhor encaixam no perfil financeiro e de uso da pessoa, e escreve um resumo consultivo explicando o raciocínio.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: {
        type: "string",
        description:
          "Resumo em português, direto e consultivo (3 a 5 frases), explicando a faixa de orçamento recomendada e por que os veículos escolhidos (ou a falta deles) fazem sentido pro perfil da pessoa. Nunca garante aprovação de crédito nem promete financiamento.",
      },
      recommendedListingIds: {
        type: "array",
        items: { type: "string" },
        description:
          "Até 5 ids, escolhidos SOMENTE entre os anúncios fornecidos na lista, ordenados do mais recomendado pro menos recomendado. Lista vazia se nenhum fizer sentido pro perfil.",
      },
    },
    required: ["summary", "recommendedListingIds"],
  },
};

const STOREFRONT_HIGHLIGHT_TOOL = {
  name: "destacar_anuncios",
  description:
    "Escolhe, dentre os anúncios ativos de uma loja/imobiliária/corretor, até 6 pra destacar na vitrine pública, com um motivo curto e específico pra cada um.",
  input_schema: {
    type: "object" as const,
    properties: {
      highlights: {
        type: "array",
        items: {
          type: "object",
          properties: {
            listingId: { type: "string", description: "Id do anúncio, só entre os fornecidos." },
            reason: {
              type: "string",
              description:
                "Motivo bem curto (até 5 palavras) pelo qual esse anúncio merece destaque — ex.: 'Menor km da loja', 'Melhor custo-benefício', 'Único automático disponível'. Nunca repita o mesmo motivo pra dois anúncios, nunca invente um dado (km, ano, quartos) que não apareça na lista.",
            },
          },
          required: ["listingId", "reason"],
        },
        description: "Até 6 anúncios escolhidos, do mais pro menos destacado.",
      },
    },
    required: ["highlights"],
  },
};

export type StorefrontListingCandidate = {
  id: string;
  title: string;
  subtitle?: string;
  priceLabel: string;
};

export type StorefrontHighlight = { listingId: string; reason: string };

const MAIN_USE_LABEL: Record<string, string> = {
  commute: "ir e voltar do trabalho/estudo no dia a dia",
  family: "uso familiar, levar filhos/dependentes",
  work: "trabalho (ex.: carregar carga, atender clientes)",
  leisure: "lazer, viagens de fim de semana",
};

const PRIORITY_LABEL: Record<string, string> = {
  economy: "economia (combustível, manutenção barata)",
  space: "espaço interno/porta-malas",
  comfort: "conforto",
  performance: "desempenho/potência",
  reliability: "confiabilidade/baixo custo de manutenção",
};

export type VehicleCandidate = {
  id: string;
  title: string;
  price: number;
  year: number;
  mileage: number;
  fuelType: string;
  transmission: string;
  doors?: number;
  city: string;
};

const PROPERTY_RECOMMEND_TOOL = {
  name: "recomendar_imovel",
  description:
    "Escolhe, dentre os anúncios de imóveis oferecidos, os que melhor encaixam no perfil financeiro e de uso da pessoa, e escreve um resumo consultivo explicando o raciocínio.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: {
        type: "string",
        description:
          "Resumo em português, direto e consultivo (3 a 5 frases), explicando a faixa de orçamento recomendada e por que os imóveis escolhidos (ou a falta deles) fazem sentido pro perfil da pessoa — inclua, quando fizer sentido, o trade-off entre tamanho/preço e localização/trânsito. Nunca garante aprovação de crédito nem promete financiamento.",
      },
      recommendedListingIds: {
        type: "array",
        items: { type: "string" },
        description:
          "Até 5 ids, escolhidos SOMENTE entre os anúncios fornecidos na lista, ordenados do mais recomendado pro menos recomendado. Lista vazia se nenhum fizer sentido pro perfil.",
      },
    },
    required: ["summary", "recommendedListingIds"],
  },
};

const PROPERTY_PRIORITY_LABEL: Record<string, string> = {
  location: "localização/proximidade (vale abrir mão de espaço pra reduzir trânsito e deslocamento)",
  space: "espaço/tamanho do imóvel",
  price: "menor preço possível",
  condo_amenities: "infraestrutura do condomínio (lazer, segurança)",
  low_maintenance: "baixo custo de manutenção/condomínio",
};

export type PropertyCandidate = {
  id: string;
  title: string;
  price: number;
  propertyType: string;
  areaM2: number;
  bedrooms?: number;
  city: string;
  neighborhood?: string;
};

// Leitura automática do CRLV (upload na página de anunciar, ver
// VehiclesController). Todas as propriedades ficam fora de "required" de
// propósito — o documento pode vir com foto ruim ou mal enquadrado, e a IA
// precisa poder deixar um campo de fora em vez de chutar um valor.
const CRLV_EXTRACT_TOOL = {
  name: "extrair_dados_crlv",
  description:
    "Extrai os dados do veículo visíveis no CRLV (Certificado de Registro e Licenciamento de Veículo) enviado. Preenche só o que conseguir ler com segurança no documento — nunca inventa, completa ou estima um valor que não esteja legível.",
  input_schema: {
    type: "object" as const,
    properties: {
      brand: { type: "string", description: "Marca do veículo, como aparece no documento (ex.: TOYOTA)." },
      model: { type: "string", description: "Modelo do veículo (ex.: COROLLA)." },
      version: { type: "string", description: "Versão/variante do modelo, só se aparecer destacada (ex.: XEI 2.0)." },
      yearManufacture: { type: "number", description: "Ano de fabricação (campo 'ANO FAB' do CRLV)." },
      yearModel: { type: "number", description: "Ano do modelo (campo 'ANO MOD')." },
      fuelType: {
        type: "string",
        enum: ["flex", "gasoline", "ethanol", "diesel", "electric", "hybrid"],
        description: "Combustível do veículo (campo 'COMBUSTÍVEL'), convertido pro enum do sistema.",
      },
      color: { type: "string", description: "Cor do veículo (campo 'COR')." },
      plate: {
        type: "string",
        description:
          "Placa do veículo, SOMENTE se estiver completamente legível e nítida no documento — nunca complete caracteres que não consiga confirmar visualmente.",
      },
    },
    required: [],
  },
};

// Upload em lote de fotos na galeria do anúncio (ver ListingsService -> POST
// /listings/:id/photos/classify). A ordem sugerida segue a lógica de portal
// profissional descrita no pedido original: capa, frente/lateral, traseira,
// interior, painel/hodômetro, bancos, porta-malas, motor, rodas/detalhes —
// pulando categorias sem foto correspondente, nunca inventando uma.
const PHOTO_CLASSIFY_TOOL = {
  name: "organizar_fotos_veiculo",
  description:
    "Classifica, ordena e cria uma legenda curta para cada foto de um anúncio de veículo, na sequência que um anúncio profissional usaria, e escolhe a melhor foto pra ser a capa.",
  input_schema: {
    type: "object" as const,
    properties: {
      photos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            photoId: { type: "string", description: "O id da foto, exatamente como foi informado no prompt." },
            caption: {
              type: "string",
              description:
                "Legenda curta, objetiva e profissional (ex.: 'Vista frontal do veículo'), baseada só no que dá pra confirmar visualmente na foto — nunca afirma uma característica que a imagem não comprova.",
            },
            order: {
              type: "number",
              description:
                "Posição da foto na sequência final do anúncio (0 = primeira/capa). Sequência sugerida: melhor ângulo geral, frente, lateral, traseira, interior, painel e hodômetro, bancos, porta-malas, motor, rodas e detalhes — adaptando à realidade das fotos enviadas.",
            },
          },
          required: ["photoId", "caption", "order"],
        },
      },
      coverPhotoId: {
        type: "string",
        description: "O id da foto escolhida como capa do anúncio — o ângulo que melhor valoriza o veículo.",
      },
    },
    required: ["photos"],
  },
};

// Mesma ideia de PHOTO_CLASSIFY_TOOL acima, pra imóvel — categorias e
// sequência de referência vêm direto do pedido original (fachada, sala,
// cozinha, quartos/suítes, banheiros, varanda, área gourmet/piscina,
// jardim, garagem, lavanderia, vista, áreas comuns, planta baixa).
const PROPERTY_PHOTO_CLASSIFY_TOOL = {
  name: "organizar_fotos_imovel",
  description:
    "Classifica, ordena e cria uma legenda curta para cada foto de um anúncio de imóvel, na sequência que um portal imobiliário profissional usaria, e escolhe a melhor foto pra ser a capa.",
  input_schema: {
    type: "object" as const,
    properties: {
      photos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            photoId: { type: "string", description: "O id da foto, exatamente como foi informado no prompt." },
            caption: {
              type: "string",
              description:
                "Legenda curta, objetiva e profissional (ex.: 'Sala de estar com boa iluminação natural'), baseada só no que dá pra confirmar visualmente na foto — nunca afirma reforma, amplitude, vista, incidência solar ou material que a imagem não comprova.",
            },
            order: {
              type: "number",
              description:
                "Posição da foto na sequência final do anúncio (0 = primeira/capa). Sequência de referência: melhor foto da fachada/geral, sala de estar, sala de jantar, cozinha, quartos e suítes, banheiros, varanda, área gourmet e piscina, jardim/área externa, garagem, lavanderia, vista, áreas comuns do condomínio, planta baixa, outros detalhes — adaptando à realidade das fotos enviadas, sem repetir categoria nem inventar ambiente que não foi fotografado.",
            },
          },
          required: ["photoId", "caption", "order"],
        },
      },
      coverPhotoId: {
        type: "string",
        description:
          "O id da foto escolhida como capa do anúncio — boa iluminação, nitidez e enquadramento, priorizando fachada, sala ampla ou vista relevante, conforme o que melhor representar o imóvel.",
      },
    },
    required: ["photos"],
  },
};

// Gating idêntico ao de PaymentsService/EmailService (ver comentário lá):
// sem ANTHROPIC_API_KEY, isEnabled() devolve false e o site esconde o
// gerador, sem quebrar o resto do fluxo de anunciar.
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private client: Anthropic | undefined;

  isEnabled(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada");
      this.client = new Anthropic({ apiKey });
    }
    return this.client;
  }

  async generateDraft(assetType: AssetType, freeText: string): Promise<ListingDraft> {
    try {
      const client = this.getClient();
      const assetLabel = assetType === "vehicle" ? "um veículo" : "um imóvel";

      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        tools: [DRAFT_TOOL],
        tool_choice: { type: "auto" },
        messages: [
          {
            role: "user",
            content: `Você ajuda donos de ${assetLabel} a publicar anúncio no Novo Seminovo (marketplace brasileiro de veículos e imóveis usados). A pessoa escreveu o seguinte texto livre, como se estivesse falando com um amigo, descrevendo o bem:\n\n"${freeText}"\n\nGere um rascunho de anúncio profissional a partir disso, usando a ferramenta "gerar_anuncio".`,
          },
        ],
      });

      const toolUse = message.content.find((block) => block.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") {
        throw new Error("Claude não devolveu o rascunho estruturado esperado");
      }

      const input = toolUse.input as { title?: string; description?: string; suggestedPrice?: number };
      if (!input.title || !input.description) {
        throw new Error("Rascunho da IA veio sem título ou descrição");
      }

      return {
        title: input.title,
        description: input.description,
        suggestedPrice: typeof input.suggestedPrice === "number" ? input.suggestedPrice : undefined,
      };
    } catch (error) {
      this.logger.error(`Falha ao gerar rascunho de anúncio com IA: ${error}`);
      throw new ServiceUnavailableException(
        "Não foi possível gerar o anúncio com IA agora. Tente de novo em instantes, ou preencha manualmente.",
      );
    }
  }

  // ListingsService.recommendVehicle já calculou a faixa de orçamento (regra
  // de 10-15% da renda) e os candidatos elegíveis — aqui só escolhe entre eles
  // e escreve o texto consultivo. A IA nunca inventa um anúncio: o filtro por
  // id (abaixo) garante que só vem o que foi oferecido na lista.
  async recommendVehicle(
    profile: VehicleProfileInput,
    budgetRange: { min: number; max: number },
    candidates: VehicleCandidate[],
    withinBudget = true,
  ): Promise<{ summary: string; recommendedListingIds: string[] }> {
    try {
      const client = this.getClient();
      const candidatesText = candidates
        .map(
          (c) =>
            `- id=${c.id} | ${c.title} | R$ ${c.price} | ano ${c.year} | ${c.mileage} km | ${c.fuelType} | ${c.transmission}${
              c.doors ? ` | ${c.doors} portas` : ""
            } | ${c.city}`,
        )
        .join("\n");

      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        tools: [RECOMMEND_TOOL],
        tool_choice: { type: "auto" },
        messages: [
          {
            role: "user",
            content: `Você ajuda um comprador a escolher o carro ideal no Novo Seminovo (marketplace brasileiro de veículos e imóveis usados), com base no perfil financeiro dele. O carro ideal é o que cabe no orçamento sem comprometer o resto da vida financeira da pessoa — nunca o mais bonito, potente ou cheio de tecnologia.

Perfil da pessoa:
- Renda mensal: R$ ${profile.monthlyIncome}
- Gastos fixos mensais: R$ ${profile.monthlyFixedExpenses}
- Entrada disponível: R$ ${profile.availableDownPayment}
- Parcelas desejadas: ${profile.installments}x
- Uso principal: ${MAIN_USE_LABEL[profile.mainUse] ?? profile.mainUse}
- Tamanho da família: ${profile.familySize ?? "não informado"}
- Prioridade: ${PRIORITY_LABEL[profile.priority] ?? profile.priority}
- Cidade de preferência: ${profile.preferredCity ?? "não informado"}
- Observações da própria pessoa: ${profile.notes ?? "nenhuma"}

Faixa de orçamento já calculada pelo sistema (use como referência, não precisa recalcular): R$ ${budgetRange.min} a R$ ${budgetRange.max}.

${
  withinBudget
    ? "Anúncios de veículos ativos disponíveis agora na plataforma, já dentro dessa faixa:"
    : "ATENÇÃO: não há nenhum anúncio ativo dentro dessa faixa de orçamento agora — os anúncios abaixo são os mais próximos disponíveis no catálogo, mas estão fora do ideal. Deixe isso claro no resumo (ex.: custam mais do que o recomendado) em vez de tratá-los como se coubessem perfeitamente no orçamento."
}
${candidatesText || "(nenhum anúncio disponível no momento)"}

Use a ferramenta "recomendar_veiculo" pra escolher os melhores (se houver algum que faça sentido) e escrever o resumo.`,
          },
        ],
      });

      const toolUse = message.content.find((block) => block.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") {
        throw new Error("Claude não devolveu a recomendação estruturada esperada");
      }

      const input = toolUse.input as { summary?: string; recommendedListingIds?: string[] };
      if (!input.summary) throw new Error("Recomendação da IA veio sem resumo");

      const validIds = new Set(candidates.map((c) => c.id));
      const recommendedListingIds = (input.recommendedListingIds ?? []).filter((id) => validIds.has(id)).slice(0, 5);

      return { summary: input.summary, recommendedListingIds };
    } catch (error) {
      this.logger.error(`Falha ao gerar recomendação de veículo com IA: ${error}`);
      throw new ServiceUnavailableException(
        "Não foi possível gerar a recomendação com IA agora. Tente de novo em instantes.",
      );
    }
  }

  // Mesma lógica de recommendVehicle acima, só que pro imóvel — ver
  // ListingsService.recommendProperty pro cálculo da faixa de orçamento.
  async recommendProperty(
    profile: PropertyProfileInput,
    budgetRange: { min: number; max: number },
    candidates: PropertyCandidate[],
    withinBudget = true,
  ): Promise<{ summary: string; recommendedListingIds: string[] }> {
    try {
      const client = this.getClient();
      const candidatesText = candidates
        .map(
          (c) =>
            `- id=${c.id} | ${c.title} | R$ ${c.price} | ${c.propertyType} | ${c.areaM2} m² | ${
              c.bedrooms ? `${c.bedrooms} quartos` : "quartos não informado"
            } | ${c.neighborhood ? `${c.neighborhood}, ` : ""}${c.city}`,
        )
        .join("\n");

      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        tools: [PROPERTY_RECOMMEND_TOOL],
        tool_choice: { type: "auto" },
        messages: [
          {
            role: "user",
            content: `Você ajuda um comprador a escolher o imóvel ideal no Novo Seminovo (marketplace brasileiro de veículos e imóveis usados), com base no perfil financeiro dele. O imóvel ideal é o que cabe no orçamento sem comprometer o resto da vida financeira da pessoa — às vezes isso significa abrir mão de um imóvel maior em troca de uma localização melhor (menos trânsito, mais perto do trabalho).

Perfil da pessoa:
- Renda mensal: R$ ${profile.monthlyIncome}
- Gastos fixos mensais: R$ ${profile.monthlyFixedExpenses}
- Entrada disponível: R$ ${profile.availableDownPayment}
- Parcelas desejadas: ${profile.installments}x
- Pessoas que vão morar no imóvel: ${profile.householdSize ?? "não informado"}
- Cidade de preferência: ${profile.preferredCity ?? "não informado"}
- Bairro de preferência: ${profile.preferredNeighborhood ?? "não informado"}
- Quartos mínimos: ${profile.minBedrooms ?? "não informado"}
- Prioridade: ${PROPERTY_PRIORITY_LABEL[profile.priority] ?? profile.priority}
- Observações da própria pessoa: ${profile.notes ?? "nenhuma"}

Faixa de orçamento já calculada pelo sistema (use como referência, não precisa recalcular): R$ ${budgetRange.min} a R$ ${budgetRange.max}.

${
  withinBudget
    ? "Anúncios de imóveis à venda disponíveis agora na plataforma, já dentro dessa faixa:"
    : "ATENÇÃO: não há nenhum anúncio ativo dentro dessa faixa de orçamento agora — os anúncios abaixo são os mais próximos disponíveis no catálogo, mas estão fora do ideal. Deixe isso claro no resumo (ex.: custam mais do que o recomendado) em vez de tratá-los como se coubessem perfeitamente no orçamento."
}
${candidatesText || "(nenhum anúncio disponível no momento)"}

Use a ferramenta "recomendar_imovel" pra escolher os melhores (se houver algum que faça sentido) e escrever o resumo.`,
          },
        ],
      });

      const toolUse = message.content.find((block) => block.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") {
        throw new Error("Claude não devolveu a recomendação estruturada esperada");
      }

      const input = toolUse.input as { summary?: string; recommendedListingIds?: string[] };
      if (!input.summary) throw new Error("Recomendação da IA veio sem resumo");

      const validIds = new Set(candidates.map((c) => c.id));
      const recommendedListingIds = (input.recommendedListingIds ?? []).filter((id) => validIds.has(id)).slice(0, 5);

      return { summary: input.summary, recommendedListingIds };
    } catch (error) {
      this.logger.error(`Falha ao gerar recomendação de imóvel com IA: ${error}`);
      throw new ServiceUnavailableException(
        "Não foi possível gerar a recomendação com IA agora. Tente de novo em instantes.",
      );
    }
  }

  // Vitrine pública da loja/imobiliária/corretor (ver PartnersService.getStorefront)
  // — ao contrário de generateDraft/recommendVehicle acima, nunca lança: sem
  // destaque nenhum a vitrine ainda funciona normalmente (ver fallback),
  // então um erro de IA aqui não pode quebrar a página de ninguém.
  async curateStorefrontHighlights(
    legalName: string,
    candidates: StorefrontListingCandidate[],
  ): Promise<StorefrontHighlight[]> {
    const fallback = () => candidates.slice(0, 3).map((c) => ({ listingId: c.id, reason: "Anúncio em destaque" }));
    if (candidates.length === 0) return [];
    if (!this.isEnabled()) return fallback();

    try {
      const client = this.getClient();
      const candidatesText = candidates
        .map((c) => `- id=${c.id} | ${c.title}${c.subtitle ? ` | ${c.subtitle}` : ""} | ${c.priceLabel}`)
        .join("\n");

      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        tools: [STOREFRONT_HIGHLIGHT_TOOL],
        tool_choice: { type: "auto" },
        messages: [
          {
            role: "user",
            content: `Você ajuda a montar a vitrine pública de "${legalName}" no Novo Seminovo (marketplace brasileiro de veículos e imóveis usados). Escolha até 6 anúncios entre os disponíveis abaixo pra aparecer em destaque no topo da página, com um motivo curto e específico pra cada um — nunca genérico, nunca repetido, nunca inventando um dado que não apareça na lista.

Anúncios ativos dessa loja:
${candidatesText}

Use a ferramenta "destacar_anuncios".`,
          },
        ],
      });

      const toolUse = message.content.find((block) => block.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") throw new Error("Claude não devolveu os destaques esperados");

      const input = toolUse.input as { highlights?: Array<{ listingId?: string; reason?: string }> };
      const validIds = new Set(candidates.map((c) => c.id));
      const highlights = (input.highlights ?? [])
        .filter(
          (h): h is StorefrontHighlight => Boolean(h.listingId && h.reason && validIds.has(h.listingId)),
        )
        .slice(0, 6);

      return highlights.length > 0 ? highlights : fallback();
    } catch (error) {
      this.logger.error(`Falha ao gerar destaques da vitrine com IA: ${error}`);
      return fallback();
    }
  }

  // Upload do CRLV na página de anunciar (ver VehiclesController). O buffer
  // nunca passa por disco/storage — processa só em memória e descarta,
  // porque o CRLV carrega dado pessoal do proprietário (nome, CPF) que não
  // faz parte do que o anúncio precisa guardar.
  async extractCrlvData(
    fileBuffer: Buffer,
    mimeType: string,
    plateStartHint?: string,
  ): Promise<CrlvExtractResult> {
    try {
      const client = this.getClient();
      const isPdf = mimeType === "application/pdf";
      const data = fileBuffer.toString("base64");
      const documentBlock: Anthropic.ContentBlockParam = isPdf
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
        : {
            type: "image",
            source: { type: "base64", media_type: mimeType as "image/jpeg" | "image/png" | "image/webp", data },
          };

      const message = await client.messages.create({
        model: VISION_MODEL,
        max_tokens: 1024,
        tools: [CRLV_EXTRACT_TOOL],
        tool_choice: { type: "auto" },
        messages: [
          {
            role: "user",
            content: [
              documentBlock,
              {
                type: "text",
                text: `Este é o CRLV (documento do veículo) enviado por um vendedor no Novo Seminovo, pra preencher automaticamente os dados do anúncio.${
                  plateStartHint
                    ? ` A pessoa informou que a placa começa com "${plateStartHint}" — use isso só pra conferir se bate com o que está legível no documento, nunca pra completar ou adivinhar o resto da placa.`
                    : ""
                }\n\nUse a ferramenta "extrair_dados_crlv" pra extrair os dados. Deixe de fora qualquer campo que não conseguir ler com segurança — não invente.`,
              },
            ],
          },
        ],
      });

      const toolUse = message.content.find((block) => block.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") {
        throw new Error("Claude não devolveu os dados estruturados esperados");
      }

      return toolUse.input as CrlvExtractResult;
    } catch (error) {
      this.logger.error(`Falha ao ler CRLV com IA: ${error}`);
      throw new ServiceUnavailableException(
        "Não foi possível ler o documento automaticamente agora. Preencha os dados manualmente.",
      );
    }
  }

  // Galeria da página de fotos do anúncio (ver ListingsService ->
  // POST /listings/:id/photos/classify). Recebe as fotos já salvas no
  // storage do anúncio e devolve ordem/legenda/capa sugeridas — o dono
  // sempre pode reordenar, editar ou ignorar na tela seguinte.
  async classifyVehiclePhotos(
    photos: { id: string; buffer: Buffer; mimeType: string }[],
  ): Promise<ClassifyPhotosResult> {
    return this.runPhotoClassification(
      photos,
      PHOTO_CLASSIFY_TOOL,
      'Fotos de um anúncio de veículo, cada uma identificada por um id. Use a ferramenta "organizar_fotos_veiculo" pra classificar, ordenar e legendar cada uma, e escolher a melhor capa.',
      "Falha ao classificar fotos do veículo com IA",
    );
  }

  // Mesma ideia acima, pra imóvel (ver PROPERTY_PHOTO_CLASSIFY_TOOL).
  async classifyPropertyPhotos(
    photos: { id: string; buffer: Buffer; mimeType: string }[],
  ): Promise<ClassifyPhotosResult> {
    return this.runPhotoClassification(
      photos,
      PROPERTY_PHOTO_CLASSIFY_TOOL,
      'Fotos de um anúncio de imóvel, cada uma identificada por um id. Use a ferramenta "organizar_fotos_imovel" pra classificar, ordenar e legendar cada uma, e escolher a melhor capa.',
      "Falha ao classificar fotos do imóvel com IA",
    );
  }

  // Mecânica compartilhada entre classifyVehiclePhotos/classifyPropertyPhotos
  // acima — só a ferramenta (categorias/sequência) e o texto de introdução
  // mudam entre os dois tipos de anúncio.
  private async runPhotoClassification(
    photos: { id: string; buffer: Buffer; mimeType: string }[],
    tool: typeof PHOTO_CLASSIFY_TOOL | typeof PROPERTY_PHOTO_CLASSIFY_TOOL,
    introText: string,
    errorLogPrefix: string,
  ): Promise<ClassifyPhotosResult> {
    try {
      const client = this.getClient();
      const content: Anthropic.ContentBlockParam[] = [{ type: "text", text: introText }];
      for (const photo of photos) {
        content.push({ type: "text", text: `Foto id=${photo.id}:` });
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: photo.mimeType as "image/jpeg" | "image/png" | "image/webp",
            data: photo.buffer.toString("base64"),
          },
        });
      }

      const message = await client.messages.create({
        model: VISION_MODEL,
        max_tokens: 2048,
        tools: [tool],
        tool_choice: { type: "auto" },
        messages: [{ role: "user", content }],
      });

      const toolUse = message.content.find((block) => block.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") {
        throw new Error("Claude não devolveu a organização estruturada esperada");
      }

      const input = toolUse.input as ClassifyPhotosResult;
      const validIds = new Set(photos.map((p) => p.id));
      const filteredPhotos = (input.photos ?? []).filter((p) => validIds.has(p.photoId));
      const coverPhotoId = input.coverPhotoId && validIds.has(input.coverPhotoId) ? input.coverPhotoId : undefined;

      return { photos: filteredPhotos, coverPhotoId };
    } catch (error) {
      this.logger.error(`${errorLogPrefix}: ${error}`);
      throw new ServiceUnavailableException("Não foi possível organizar as fotos automaticamente agora.");
    }
  }
}

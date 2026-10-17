import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import type { AssetType, ListingDraft, PropertyProfileInput, VehicleProfileInput } from "@novoseminovo/shared-types";

const MODEL = "claude-sonnet-5-5";

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
            }`,
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
}

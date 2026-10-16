import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import type { AssetType, ListingDraft } from "@novoseminovo/shared-types";

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
}

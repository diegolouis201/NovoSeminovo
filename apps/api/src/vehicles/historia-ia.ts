import { Injectable, Logger } from "@nestjs/common";
import type Anthropic from "@anthropic-ai/sdk";
import { trackedAnthropic } from "../operations/ai-usage";
import { findContactInfo } from "../common/contact-filter";

// "A história em 30 segundos" do Diário do Carro. A IA recebe só fatos
// estruturados (ver fatosDoCarro em shared-types) — nunca o texto livre do
// dono — e devolve um parágrafo curto. Sem ANTHROPIC_API_KEY, fica desligado.
const MODEL = "claude-sonnet-5-5";
const MAX = 600;

const TOOL = {
  name: "resumo",
  description: "Devolve o resumo da história do carro.",
  input_schema: {
    type: "object" as const,
    properties: { texto: { type: "string", description: "Resumo em português, 2 a 4 frases, no máximo 500 caracteres." } },
    required: ["texto"],
  },
};

// Saída da IA também é suspeita: sem contato nem link, e com tamanho máximo.
export function limparResumo(texto: string | undefined): string | undefined {
  const t = String(texto ?? "").replace(/\s+/g, " ").trim();
  if (!t || findContactInfo(t)) return undefined;
  return t.length > MAX ? `${t.slice(0, MAX - 1).replace(/\s+\S*$/, "")}…` : t;
}

@Injectable()
export class VehicleStoryAi {
  private readonly logger = new Logger(VehicleStoryAi.name);
  private client: Anthropic | undefined;

  isEnabled(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  async resumir(fatos: string[]): Promise<string | undefined> {
    if (!this.isEnabled() || !fatos.length) return undefined;
    try {
      this.client ??= trackedAnthropic("diario-do-carro", process.env.ANTHROPIC_API_KEY);
      const message = await this.client.messages.create({
        model: MODEL,
        max_tokens: 400,
        tools: [TOOL],
        tool_choice: { type: "auto" },
        messages: [
          {
            role: "user",
            content: `Você escreve "a história em 30 segundos" de um carro usado para o Diário do Carro do NovoSeminovo (marketplace brasileiro). Use SOMENTE os fatos abaixo, sem inventar nada (nada de estado de conservação, preço, acidentes ou opinião que não esteja nos fatos). Tom simples e direto, 2 a 4 frases, sem nomes de pessoas, sem telefone, e-mail ou link. Se houver linha "Atenção", mencione com neutralidade.\n\nFatos:\n${fatos.map((f) => `- ${f}`).join("\n")}\n\nResponda SEMPRE chamando a ferramenta "resumo", uma única vez.`,
          },
        ],
      });
      const tool = message.content.find((b) => b.type === "tool_use");
      if (!tool || tool.type !== "tool_use") return undefined;
      return limparResumo((tool.input as { texto?: string }).texto);
    } catch (error) {
      this.logger.warn(`Resumo do Diário do Carro falhou: ${error}`);
      return undefined;
    }
  }
}

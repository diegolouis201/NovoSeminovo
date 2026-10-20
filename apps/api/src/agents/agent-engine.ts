import type Anthropic from "@anthropic-ai/sdk";

export const AGENT_MODEL = "claude-sonnet-5-5";

// Rodadas de ferramenta por mensagem do usuário — suficiente pra "buscar →
// ver detalhe → simular" numa resposta só, e corta um laço do modelo antes
// de virar custo.
const MAX_TOOL_ROUNDS = 6;

// Histórico mandado pro modelo a cada mensagem. Conversa mais longa que isso
// perde o começo (o próprio modelo é avisado no prompt de que pode
// perguntar de novo o que não lembrar).
const MAX_HISTORY_MESSAGES = 40;

// Resultado de ferramenta grande (ex.: descrição longa de anúncio) é cortado
// antes de voltar pro modelo — o que importa cabe nisso.
const MAX_TOOL_RESULT_CHARS = 8000;

export type AgentTool = {
  definition: Anthropic.Tool;
  run: (input: Record<string, unknown>) => Promise<unknown>;
};

export type AgentDefinition = {
  system: string;
  tools: AgentTool[];
};

// Mensagem do usuário "de verdade" (texto digitado), em oposição a uma
// mensagem role=user que só carrega tool_result. O histórico mandado pro
// modelo precisa começar numa dessas — começar num tool_result órfão (sem o
// tool_use correspondente) dá 400 na API.
function isUserText(message: Anthropic.MessageParam): boolean {
  if (message.role !== "user") return false;
  if (typeof message.content === "string") return true;
  return message.content.every((block) => block.type !== "tool_result");
}

export function trimHistory(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  if (messages.length <= MAX_HISTORY_MESSAGES) return messages;
  let start = messages.length - MAX_HISTORY_MESSAGES;
  while (start < messages.length && !isUserText(messages[start])) start++;
  return messages.slice(start);
}

function textOf(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n\n")
    .trim();
}

// Laço padrão de tool use: chama o modelo, executa as ferramentas que ele
// pediu, devolve os resultados, repete até ele responder em texto. Erro de
// uma ferramenta volta pro modelo como is_error (ele explica pro usuário ou
// tenta outro caminho) em vez de derrubar a conversa inteira.
export async function runAgentTurn(
  client: Anthropic,
  agent: AgentDefinition,
  history: Anthropic.MessageParam[],
  userText: string,
): Promise<{ messages: Anthropic.MessageParam[]; reply: string }> {
  const messages: Anthropic.MessageParam[] = [...history, { role: "user", content: userText }];
  const toolsByName = new Map(agent.tools.map((tool) => [tool.definition.name, tool]));
  const replies: string[] = [];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const lastRound = round === MAX_TOOL_ROUNDS;
    const response = await client.messages.create({
      model: AGENT_MODEL,
      max_tokens: 1500,
      system: agent.system,
      tools: agent.tools.map((tool) => tool.definition),
      // Na última rodada o modelo é obrigado a responder em texto com o que
      // já tem — sem isso a conversa ficaria terminando num tool_use sem
      // resposta pro usuário.
      tool_choice: lastRound ? { type: "none" } : { type: "auto" },
      messages: trimHistory(messages),
    });

    messages.push({ role: "assistant", content: response.content });
    const text = textOf(response.content);
    if (text) replies.push(text);

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) break;

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      const tool = toolsByName.get(toolUse.name);
      try {
        if (!tool) throw new Error(`Ferramenta desconhecida: ${toolUse.name}`);
        const output = await tool.run((toolUse.input ?? {}) as Record<string, unknown>);
        results.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(output ?? null).slice(0, MAX_TOOL_RESULT_CHARS),
        });
      } catch (error) {
        results.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          is_error: true,
          content: error instanceof Error ? error.message : String(error),
        });
      }
    }
    messages.push({ role: "user", content: results });
  }

  return { messages, reply: replies.at(-1) ?? "" };
}

// Só o que a pessoa vê no chat: o que ela digitou e o texto das respostas —
// tool_use/tool_result ficam de fora.
export function visibleMessages(
  messages: Anthropic.MessageParam[],
): { role: "user" | "assistant"; text: string }[] {
  const visible: { role: "user" | "assistant"; text: string }[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      if (!isUserText(message)) continue;
      const text =
        typeof message.content === "string"
          ? message.content
          : message.content
              .filter((block): block is Anthropic.TextBlockParam => block.type === "text")
              .map((block) => block.text)
              .join("\n");
      if (text) visible.push({ role: "user", text });
      continue;
    }

    const content = typeof message.content === "string" ? message.content : textOf(message.content as Anthropic.ContentBlock[]);
    if (!content) continue;
    // Texto intermediário ("vou procurar…") antes de um tool_use e a resposta
    // final vêm em mensagens separadas — junta numa bolha só, como a pessoa
    // viu na hora (o endpoint de envio só devolve a última; ver runAgentTurn).
    const previous = visible.at(-1);
    if (previous?.role === "assistant") previous.text = content;
    else visible.push({ role: "assistant", text: content });
  }
  return visible;
}

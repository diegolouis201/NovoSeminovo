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
  maxTokens?: number;
  // Agente que trabalha em lote (o Arquiteto com vários cômodos) precisa de
  // mais rodadas e roda as ferramentas pedidas na mesma resposta em paralelo.
  maxToolRounds?: number;
  parallelTools?: boolean;
};

// Ferramenta que precisa mostrar algo ao modelo além de texto (ex.: a foto
// de um cômodo pro Arquiteto) devolve { contentBlocks: [...] } — vai como
// conteúdo do tool_result em vez de JSON.
export type ToolContentOutput = { contentBlocks: Anthropic.ToolResultBlockParam["content"] };

function isContentOutput(output: unknown): output is ToolContentOutput {
  return Boolean(output && typeof output === "object" && Array.isArray((output as ToolContentOutput).contentBlocks));
}

// Mensagem do usuário "de verdade" (texto digitado), em oposição a uma
// mensagem role=user que só carrega tool_result. O histórico mandado pro
// modelo precisa começar numa dessas — começar num tool_result órfão (sem o
// tool_use correspondente) dá 400 na API.
function isUserText(message: Anthropic.MessageParam): boolean {
  if (message.role !== "user") return false;
  if (typeof message.content === "string") return true;
  return message.content.every((block) => block.type !== "tool_result");
}

// Blocos de raciocínio ("thinking") de respostas antigas vêm assinados e só
// valem se tudo antes deles voltar idêntico — e o histórico guardado muda
// (cortado por trimHistory; o Arquiteto troca as fotos por texto). Numa
// mensagem nova do usuário a API não precisa deles, então saem do histórico.
function withoutThinking(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  return messages.map((message) => {
    if (message.role !== "assistant" || typeof message.content === "string") return message;
    const content = message.content.filter((block) => block.type !== "thinking" && block.type !== "redacted_thinking");
    if (content.length === message.content.length) return message;
    return { ...message, content: content.length ? content : [{ type: "text" as const, text: "…" }] };
  });
}

// Pedido de ferramenta sem o resultado logo em seguida (resposta cortada
// pelo limite de tamanho no meio do tool_use, por exemplo) faz a API
// recusar a conversa inteira dali pra frente — sai do histórico.
function withoutDanglingToolUse(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  return messages.map((message, index) => {
    if (message.role !== "assistant" || typeof message.content === "string") return message;
    const next = messages[index + 1];
    const answered = new Set(
      next && next.role === "user" && Array.isArray(next.content)
        ? next.content.filter((block) => block.type === "tool_result").map((block) => (block as Anthropic.ToolResultBlockParam).tool_use_id)
        : [],
    );
    const content = message.content.filter((block) => block.type !== "tool_use" || answered.has(block.id));
    if (content.length === message.content.length) return message;
    return { ...message, content: content.length ? content : [{ type: "text" as const, text: "…" }] };
  });
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
  // Corta o histórico uma vez, antes da mensagem nova — cortar no meio das
  // rodadas mudaria o começo da conversa e invalidaria o raciocínio assinado
  // da rodada em andamento.
  const base = trimHistory([...withoutDanglingToolUse(withoutThinking(history)), { role: "user", content: userText }]);
  const messages: Anthropic.MessageParam[] = [...base];
  const toolsByName = new Map(agent.tools.map((tool) => [tool.definition.name, tool]));
  const replies: string[] = [];

  const maxRounds = agent.maxToolRounds ?? MAX_TOOL_ROUNDS;
  for (let round = 0; round <= maxRounds; round++) {
    const lastRound = round === maxRounds;
    const response = await client.messages.create({
      model: AGENT_MODEL,
      max_tokens: agent.maxTokens ?? 1500,
      system: agent.system,
      tools: agent.tools.map((tool) => tool.definition),
      // Na última rodada o modelo é obrigado a responder em texto com o que
      // já tem — sem isso a conversa ficaria terminando num tool_use sem
      // resposta pro usuário.
      tool_choice: lastRound ? { type: "none" } : { type: "auto" },
      messages,
    });

    messages.push({ role: "assistant", content: response.content });
    const text = textOf(response.content);
    if (text) replies.push(text);

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) break;

    const runTool = async (toolUse: Anthropic.ToolUseBlock): Promise<Anthropic.ToolResultBlockParam> => {
      const tool = toolsByName.get(toolUse.name);
      try {
        if (!tool) throw new Error(`Ferramenta desconhecida: ${toolUse.name}`);
        const output = await tool.run((toolUse.input ?? {}) as Record<string, unknown>);
        return {
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: isContentOutput(output) ? output.contentBlocks : JSON.stringify(output ?? null).slice(0, MAX_TOOL_RESULT_CHARS),
        };
      } catch (error) {
        return { type: "tool_result", tool_use_id: toolUse.id, is_error: true, content: error instanceof Error ? error.message : String(error) };
      }
    };
    const results: Anthropic.ToolResultBlockParam[] = [];
    if (agent.parallelTools) results.push(...(await Promise.all(toolUses.map(runTool))));
    else for (const toolUse of toolUses) results.push(await runTool(toolUse));
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

import { createHmac, timingSafeEqual } from "node:crypto";
import { HttpException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AgentsService } from "./agents.service";

// Canal WhatsApp do Agente Comprador via WhatsApp Cloud API (Meta). A Meta
// manda cada mensagem recebida pro webhook (POST /webhooks/whatsapp); a
// resposta do agente volta pela Graph API. Cada número de telefone é uma
// conversa contínua (AgentConversation com channel "whatsapp" e o número em
// externalId).
//
// Variáveis (todas obrigatórias — sem qualquer uma o canal fica desligado e
// o webhook recusa tudo):
//   WHATSAPP_TOKEN            token permanente de usuário do sistema (Meta Business)
//   WHATSAPP_PHONE_NUMBER_ID  id do número no painel do app (não é o telefone)
//   WHATSAPP_VERIFY_TOKEN     texto livre combinado com o painel na hora de ligar o webhook
//   WHATSAPP_APP_SECRET       "chave secreta do app" — valida que o POST veio mesmo da Meta
// Opcional: WHATSAPP_GRAPH_VERSION (padrão abaixo; usar a versão que o painel do app mostrar).

const DEFAULT_GRAPH_VERSION = "v23.0";
// Limite da Meta pra mensagem de texto é 4096 — corta antes, em quebra de
// linha, pra não partir uma frase no meio.
const MAX_MESSAGE_CHARS = 3800;
const SEEN_IDS_LIMIT = 5000;

type IncomingMessage = { id: string; from: string; type: string; text?: { body?: string } };

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  // A Meta reenvia o mesmo evento se o webhook demora ou falha — id já
  // processado é ignorado (a API roda numa instância só, memória basta).
  private readonly seen = new Set<string>();
  // Mensagens do mesmo número são respondidas uma de cada vez, na ordem —
  // senão duas mensagens seguidas rodariam o agente em paralelo sobre o
  // mesmo histórico e uma resposta sobrescreveria a outra.
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly agents: AgentsService,
  ) {}

  isEnabled(): boolean {
    return Boolean(
      process.env.WHATSAPP_TOKEN &&
        process.env.WHATSAPP_PHONE_NUMBER_ID &&
        process.env.WHATSAPP_VERIFY_TOKEN &&
        process.env.WHATSAPP_APP_SECRET &&
        this.agents.isEnabled(),
    );
  }

  // GET de verificação que o painel da Meta faz ao configurar o webhook.
  verifySubscription(mode?: string, token?: string, challenge?: string): string | undefined {
    const expected = process.env.WHATSAPP_VERIFY_TOKEN;
    if (mode === "subscribe" && expected && token === expected && challenge) return challenge;
    return undefined;
  }

  // HMAC-SHA256 do corpo cru com a chave secreta do app, comparado em tempo
  // constante — sem isso qualquer um faria o agente responder (e gastar API)
  // fingindo ser a Meta.
  isValidSignature(rawBody: Buffer | undefined, signatureHeader: string | undefined): boolean {
    const secret = process.env.WHATSAPP_APP_SECRET;
    if (!secret || !rawBody || !signatureHeader?.startsWith("sha256=")) return false;
    const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"));
    const received = Buffer.from(signatureHeader.slice("sha256=".length));
    return expected.length === received.length && timingSafeEqual(expected, received);
  }

  // Responde 200 pra Meta na hora e processa depois — a Meta considera
  // falha (e reenvia) se o webhook demora, e o agente pode levar segundos.
  handleWebhook(body: unknown): void {
    const entries = (body as { entry?: unknown[] })?.entry;
    if (!Array.isArray(entries)) return;
    for (const entry of entries) {
      for (const change of ((entry as { changes?: unknown[] })?.changes ?? []) as { value?: { messages?: IncomingMessage[] } }[]) {
        for (const message of change.value?.messages ?? []) {
          if (!message?.id || !message.from || this.seen.has(message.id)) continue;
          this.remember(message.id);
          this.enqueue(message.from, () => this.process(message));
        }
      }
    }
  }

  private remember(id: string): void {
    this.seen.add(id);
    if (this.seen.size > SEEN_IDS_LIMIT) {
      const oldest = this.seen.values().next().value;
      if (oldest) this.seen.delete(oldest);
    }
  }

  private enqueue(phone: string, task: () => Promise<void>): void {
    const previous = this.queues.get(phone) ?? Promise.resolve();
    const next = previous.then(task).catch((error) => this.logger.error(`WhatsApp ${phone.slice(-4)}: ${error}`));
    this.queues.set(phone, next);
    void next.finally(() => {
      if (this.queues.get(phone) === next) this.queues.delete(phone);
    });
  }

  private async process(message: IncomingMessage): Promise<void> {
    const phone = message.from;
    void this.markAsRead(message.id);

    const text = message.type === "text" ? message.text?.body?.trim() : undefined;
    if (!text) {
      await this.send(phone, "Por enquanto eu só consigo ler mensagens de texto 🙂 Pode me escrever o que você procura?");
      return;
    }

    const conversation = await this.prisma.agentConversation.upsert({
      where: { kind_channel_externalId: { kind: "buyer", channel: "whatsapp", externalId: phone } },
      create: { kind: "buyer", channel: "whatsapp", externalId: phone },
      update: {},
    });

    try {
      const reply = await this.agents.respondWhatsApp(conversation, phone, text.slice(0, 1500));
      await this.send(phone, reply);
    } catch (error) {
      // Limite de uso, conversa longa demais ou IA fora do ar: a pessoa
      // recebe a mensagem do erro (já escrita pra ela) em vez de silêncio.
      const fallback =
        error instanceof HttpException
          ? String((error.getResponse() as { message?: string })?.message ?? error.message)
          : "Tive um problema pra responder agora. Tente de novo em instantes.";
      if (/longa demais/.test(fallback)) {
        // No WhatsApp não há botão de "nova conversa": recomeça sozinho.
        await this.prisma.agentConversation.update({ where: { id: conversation.id }, data: { messages: [], turnCount: 0 } });
        await this.send(phone, "Vamos recomeçar nossa conversa por aqui 🙂 Me conta de novo o que você procura?");
        return;
      }
      await this.send(phone, fallback);
    }
  }

  private graphUrl(path: string): string {
    const version = process.env.WHATSAPP_GRAPH_VERSION || DEFAULT_GRAPH_VERSION;
    return `https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/${path}`;
  }

  private async callGraph(payload: Record<string, unknown>): Promise<void> {
    const response = await fetch(this.graphUrl("messages"), {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`Graph API ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
  }

  private async markAsRead(messageId: string): Promise<void> {
    await this.callGraph({ status: "read", message_id: messageId }).catch(() => {});
  }

  async send(phone: string, text: string): Promise<void> {
    for (const part of splitMessage(text)) {
      await this.callGraph({ to: phone, type: "text", text: { body: part, preview_url: true } });
    }
  }
}

export function splitMessage(text: string): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > MAX_MESSAGE_CHARS) {
    let cut = rest.lastIndexOf("\n", MAX_MESSAGE_CHARS);
    if (cut < MAX_MESSAGE_CHARS / 2) cut = rest.lastIndexOf(" ", MAX_MESSAGE_CHARS);
    if (cut <= 0) cut = MAX_MESSAGE_CHARS;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

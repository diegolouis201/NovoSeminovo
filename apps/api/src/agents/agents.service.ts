import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import { Prisma, type AgentConversation } from "@novoseminovo/db";
import {
  formatBRL,
  type AgentConversationView,
  type AgentKind,
  type AgentReply,
  type FinancingLeadStatus,
  type FinancingLeadSummary,
  type ListingSummary,
} from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { ListingsService } from "../listings/listings.service";
import { runAgentTurn, visibleMessages, type AgentDefinition } from "./agent-engine";
import { buildBuyerAgent, type FinancingLeadInput } from "./buyer-agent";

// Mensagens por pessoa (usuário logado, IP ou telefone do WhatsApp) numa
// janela de 10 minutos — cada mensagem custa uma chamada (ou várias) à API
// da Anthropic, e o chat do comprador é público.
const RATE_LIMIT = { max: 20, windowMs: 10 * 60 * 1000 };

// Teto diário somando todo mundo — o limite por pessoa acima depende do IP
// que o site repassa, que um abusador consegue variar; isto segura a conta
// da Anthropic mesmo nesse caso. Configurável por env.
const DEFAULT_DAILY_LIMIT = 3000;

// Teto de mensagens do usuário numa mesma conversa: além disso o contexto
// fica caro e o assistente já esqueceu o começo — melhor recomeçar.
const MAX_TURNS_PER_CONVERSATION = 60;

// Histórico guardado no banco (o que vai pro modelo é cortado de novo em
// trimHistory). Só pra a coluna JSON não crescer sem limite.
const MAX_STORED_MESSAGES = 200;

// WhatsApp do NovoSeminovo pra "quero falar com uma pessoa" — o número que o
// Diego usa no WhatsApp Business. Configurável sem mexer em código.
const DEFAULT_HUMAN_WHATSAPP = "5531996959679";

export type AgentRequester = { id: string; role: string };

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);
  private client: Anthropic | undefined;
  private readonly hits = new Map<string, number[]>();
  private daily = { day: "", count: 0 };

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly listings: ListingsService,
  ) {}

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

  private checkRateLimit(key: string): void {
    const now = Date.now();
    const today = new Date(now).toISOString().slice(0, 10);
    if (this.daily.day !== today) this.daily = { day: today, count: 0 };
    const dailyLimit = Number(process.env.AGENT_DAILY_MESSAGE_LIMIT) || DEFAULT_DAILY_LIMIT;
    if (this.daily.count >= dailyLimit) {
      this.logger.warn(`Limite diário de mensagens dos agentes atingido (${dailyLimit})`);
      throw new ServiceUnavailableException("O assistente atingiu o limite de atendimentos de hoje. Volte amanhã!");
    }

    const recent = (this.hits.get(key) ?? []).filter((time) => now - time < RATE_LIMIT.windowMs);
    if (recent.length >= RATE_LIMIT.max) {
      throw new HttpException(
        "Muitas mensagens em pouco tempo. Espere alguns minutos e tente de novo.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.hits.set(key, recent);
    this.daily.count++;
    // Limpeza preguiçosa: o Map não cresce pra sempre com IPs que sumiram.
    if (this.hits.size > 5000) {
      for (const [k, times] of this.hits) {
        if (times.every((time) => now - time >= RATE_LIMIT.windowMs)) this.hits.delete(k);
      }
    }
  }

  private async loadWebConversation(
    kind: AgentKind,
    conversationId: string,
    requester?: AgentRequester,
  ): Promise<AgentConversation> {
    const conversation = await this.prisma.agentConversation.findUnique({ where: { id: conversationId } });
    // 404 tanto pra id inexistente quanto pra conversa de outra pessoa/outro
    // agente — não confirma que o id existe.
    if (!conversation || conversation.kind !== kind || conversation.channel !== "web") {
      throw new NotFoundException("Conversa não encontrada");
    }
    if (conversation.userId && conversation.userId !== requester?.id) {
      throw new NotFoundException("Conversa não encontrada");
    }
    return conversation;
  }

  async getWebConversation(
    kind: AgentKind,
    conversationId: string,
    requester?: AgentRequester,
  ): Promise<AgentConversationView> {
    const conversation = await this.loadWebConversation(kind, conversationId, requester);
    return {
      conversationId: conversation.id,
      messages: visibleMessages(conversation.messages as unknown as Anthropic.MessageParam[]),
    };
  }

  async sendWebMessage(
    kind: AgentKind,
    input: { conversationId?: string; message: string },
    requester: AgentRequester | undefined,
    clientIp: string,
  ): Promise<AgentReply> {
    if (!this.isEnabled()) throw new ServiceUnavailableException("Assistente de IA indisponível no momento.");
    this.checkRateLimit(requester ? `user:${requester.id}` : `ip:${clientIp}`);

    let conversation = input.conversationId
      ? await this.loadWebConversation(kind, input.conversationId, requester)
      : await this.prisma.agentConversation.create({
          data: { kind, channel: "web", userId: requester?.id },
        });

    // Conversa começada sem login: quem logar depois e continuar passa a ser
    // o dono (e daí em diante só ele vê).
    if (!conversation.userId && requester) {
      conversation = await this.prisma.agentConversation.update({
        where: { id: conversation.id },
        data: { userId: requester.id },
      });
    }

    return this.respond(conversation, input.message);
  }

  // Comum ao site e ao WhatsApp: monta o agente certo, roda a rodada e
  // grava o histórico.
  async respond(conversation: AgentConversation, message: string): Promise<AgentReply> {
    if (conversation.turnCount >= MAX_TURNS_PER_CONVERSATION) {
      throw new BadRequestException("Essa conversa ficou longa demais. Comece uma nova conversa para continuar.");
    }

    const seenListings = new Map<string, ListingSummary>();
    const agent = await this.buildAgent(conversation, seenListings);
    const history = conversation.messages as unknown as Anthropic.MessageParam[];

    let result: { messages: Anthropic.MessageParam[]; reply: string };
    try {
      result = await runAgentTurn(this.getClient(), agent, history, message);
    } catch (error) {
      this.logger.error(`Falha no agente ${conversation.kind} (conversa ${conversation.id}): ${error}`);
      throw new ServiceUnavailableException("O assistente não conseguiu responder agora. Tente de novo em instantes.");
    }

    const stored = result.messages.slice(-MAX_STORED_MESSAGES);
    await this.prisma.agentConversation.update({
      where: { id: conversation.id },
      data: {
        messages: stored as unknown as Prisma.InputJsonValue,
        turnCount: { increment: 1 },
      },
    });

    const reply = result.reply || "Desculpe, não consegui formular uma resposta. Pode repetir de outro jeito?";

    // Card só pra anúncio que uma ferramenta encontrou de verdade nesta
    // rodada E que o texto linkou — nunca um id que o modelo escreveu solto.
    const linkedIds = new Set([...reply.matchAll(/\/anuncio\/([A-Za-z0-9_-]+)/g)].map((match) => match[1]));
    const listings = [...linkedIds].flatMap((id) => {
      const listing = seenListings.get(id);
      return listing ? [listing] : [];
    });

    return { conversationId: conversation.id, reply, listings };
  }

  private async buildAgent(
    conversation: AgentConversation,
    seenListings: Map<string, ListingSummary>,
  ): Promise<AgentDefinition> {
    const user = conversation.userId
      ? await this.prisma.user.findUnique({
          where: { id: conversation.userId },
          select: { name: true, phone: true },
        })
      : null;

    switch (conversation.kind) {
      case "buyer":
        return buildBuyerAgent(
          {
            channel: conversation.channel,
            siteUrl: process.env.WEB_ORIGIN ?? "https://novoseminovo.com.br",
            humanWhatsapp: process.env.AGENT_HUMAN_WHATSAPP ?? DEFAULT_HUMAN_WHATSAPP,
            user: user ? { name: user.name, phone: user.phone ?? undefined } : undefined,
            seenListings,
          },
          {
            listings: this.listings,
            saveFinancingLead: (input) => this.saveFinancingLead(conversation, input),
          },
        );
      default:
        throw new NotFoundException("Agente ainda não disponível.");
    }
  }

  private async saveFinancingLead(conversation: AgentConversation, input: FinancingLeadInput): Promise<{ id: string }> {
    const listing = input.listingId
      ? await this.prisma.listing.findUnique({ where: { id: input.listingId }, select: { id: true, title: true } })
      : null;

    const data = {
      name: input.name,
      phone: input.phone,
      email: input.email,
      assetType: input.assetType,
      listingId: listing?.id ?? null,
      assetValue: input.assetValue,
      downPayment: input.downPayment,
      monthlyIncome: input.monthlyIncome,
      notes: input.notes,
    };

    // Mesma pessoa pedindo de novo na mesma conversa (ex.: mudou de carro)
    // atualiza o pedido em vez de gerar um lead duplicado pro admin.
    const existing = await this.prisma.financingLead.findFirst({
      where: { conversationId: conversation.id, phone: input.phone },
    });
    if (existing) {
      return this.prisma.financingLead.update({ where: { id: existing.id }, data, select: { id: true } });
    }

    const lead = await this.prisma.financingLead.create({
      data: { ...data, conversationId: conversation.id, channel: conversation.channel },
      select: { id: true },
    });

    const admins = await this.prisma.user.findMany({ where: { role: "admin", status: "active" }, select: { id: true } });
    for (const admin of admins) {
      // Falha ao notificar (ex.: e-mail fora do ar) não pode desfazer o
      // lead já gravado nem quebrar a resposta pro comprador.
      await this.notifications
        .notify(admin.id, "financing_lead_created", {
          name: input.name,
          phone: input.phone,
          listingTitle: listing?.title,
          channel: conversation.channel,
        })
        .catch((error) => this.logger.error(`Falha ao notificar admin sobre lead de financiamento: ${error}`));
    }

    return lead;
  }

  async listFinancingLeads(status?: FinancingLeadStatus): Promise<FinancingLeadSummary[]> {
    const leads = await this.prisma.financingLead.findMany({
      where: status ? { status } : undefined,
      include: { listing: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const money = (value: Prisma.Decimal | null) => (value === null ? undefined : Number(value));
    return leads.map((lead) => {
      const assetValue = money(lead.assetValue);
      const downPayment = money(lead.downPayment);
      const monthlyIncome = money(lead.monthlyIncome);
      return {
        id: lead.id,
        channel: lead.channel,
        name: lead.name,
        phone: lead.phone,
        email: lead.email ?? undefined,
        assetType: lead.assetType,
        assetValue,
        assetValueLabel: assetValue === undefined ? undefined : formatBRL(assetValue),
        downPayment,
        downPaymentLabel: downPayment === undefined ? undefined : formatBRL(downPayment),
        monthlyIncome,
        monthlyIncomeLabel: monthlyIncome === undefined ? undefined : formatBRL(monthlyIncome),
        listingId: lead.listingId ?? undefined,
        listingTitle: lead.listing?.title,
        notes: lead.notes ?? undefined,
        status: lead.status,
        createdAt: lead.createdAt.toISOString(),
      };
    });
  }

  async updateFinancingLeadStatus(id: string, status: FinancingLeadStatus): Promise<void> {
    const lead = await this.prisma.financingLead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException("Lead não encontrado");
    await this.prisma.financingLead.update({ where: { id }, data: { status } });
  }
}

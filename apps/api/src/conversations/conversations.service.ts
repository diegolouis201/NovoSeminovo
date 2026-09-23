import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Conversation, Message } from "@novoseminovo/db";
import type {
  ConversationDetail,
  ConversationSummary,
  Message as MessageDto,
} from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";

const conversationWithParties = {
  listing: { select: { id: true, title: true, ownerUserId: true } },
  buyer: { select: { id: true, name: true } },
  sellerUser: { select: { id: true, name: true } },
} as const;

type ConversationWithParties = Conversation & {
  listing: { id: string; title: string; ownerUserId: string };
  buyer: { id: string; name: string };
  sellerUser: { id: string; name: string } | null;
};

function otherPartyName(conversation: ConversationWithParties, userId: string): string {
  return conversation.buyer.id === userId
    ? (conversation.sellerUser?.name ?? "Anunciante")
    : conversation.buyer.name;
}

function toSummary(conversation: ConversationWithParties, userId: string, lastMessage?: Message): ConversationSummary {
  return {
    id: conversation.id,
    listingId: conversation.listing.id,
    listingTitle: conversation.listing.title,
    otherPartyName: otherPartyName(conversation, userId),
    lastMessagePreview: lastMessage?.body,
    lastMessageAt: (conversation.lastMessageAt ?? conversation.createdAt).toISOString(),
  };
}

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertParticipant(conversation: { buyerId: string; sellerUserId: string | null }, userId: string) {
    if (conversation.buyerId !== userId && conversation.sellerUserId !== userId) {
      throw new ForbiddenException("Você não participa desta conversa.");
    }
  }

  async startConversation(buyerId: string, listingId: string): Promise<ConversationSummary> {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException(`Anúncio ${listingId} não encontrado`);
    if (listing.ownerUserId === buyerId) {
      throw new BadRequestException("Você não pode iniciar uma conversa com o seu próprio anúncio.");
    }

    if (listing.partnerId) {
      await this.upsertLead(listing.partnerId, listingId, buyerId);
    }

    const existing = await this.prisma.conversation.findFirst({
      where: { listingId, buyerId },
      include: conversationWithParties,
    });
    if (existing) return toSummary(existing, buyerId);

    const created = await this.prisma.conversation.create({
      data: { listingId, buyerId, sellerUserId: listing.ownerUserId },
      include: conversationWithParties,
    });
    return toSummary(created, buyerId);
  }

  // Cada conversa nova com um anúncio de parceiro vira um cartão no funil do
  // painel (Etapa 1: CRM básico). O dedupe é por (listingId, buyerId,
  // source: "chat") — filtrar pela origem é o que garante que um lead que já
  // veio de WhatsApp (ver ListingsService.registerWhatsappClick) não "engula"
  // o lead de chat da mesma pessoa: são canais diferentes, cada um com seu
  // próprio card no Kanban. Sem unique constraint em (listingId, buyerId,
  // source): busca antes de criar, como o resto da base já faz.
  private async upsertLead(partnerId: string, listingId: string, buyerId: string) {
    const existing = await this.prisma.lead.findFirst({ where: { listingId, buyerId, source: "chat" } });
    if (existing) return;
    await this.prisma.lead.create({
      data: { partnerId, listingId, buyerId, source: "chat", status: "new" },
    });
  }

  async listMine(userId: string): Promise<ConversationSummary[]> {
    const conversations = await this.prisma.conversation.findMany({
      where: { OR: [{ buyerId: userId }, { sellerUserId: userId }] },
      include: {
        ...conversationWithParties,
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    });

    return conversations.map((conversation) => toSummary(conversation, userId, conversation.messages[0]));
  }

  async getDetail(conversationId: string, userId: string): Promise<ConversationDetail> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        ...conversationWithParties,
        messages: { orderBy: { createdAt: "asc" }, include: { sender: { select: { name: true } } } },
      },
    });
    if (!conversation) throw new NotFoundException(`Conversa ${conversationId} não encontrada`);
    this.assertParticipant(conversation, userId);

    const messages: MessageDto[] = conversation.messages.map((message) => ({
      id: message.id,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      isMine: message.senderId === userId,
      senderName: message.sender.name,
    }));

    return { ...toSummary(conversation, userId), messages };
  }

  async sendMessage(conversationId: string, userId: string, body: string): Promise<MessageDto> {
    const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) throw new NotFoundException(`Conversa ${conversationId} não encontrada`);
    this.assertParticipant(conversation, userId);

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: { conversationId, senderId: userId, body },
        include: { sender: { select: { name: true } } },
      }),
      this.prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } }),
    ]);

    return {
      id: message.id,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      isMine: true,
      senderName: message.sender.name,
    };
  }
}

import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@novoseminovo/db";
import type { Notification, NotificationType } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";

type NotificationRow = {
  id: string;
  type: string;
  payload: Prisma.JsonValue;
  readAt: Date | null;
  createdAt: Date;
};

// Título, corpo e link de cada notificação são montados aqui a partir do
// tipo + payload — o front só recebe texto pronto, nunca o payload cru.
// Um tipo novo é só mais um `case` aqui, sem mexer em nenhuma tela.
function toNotification(row: NotificationRow): Notification {
  const payload = row.payload as Record<string, unknown>;
  const { title, body, link } = describe(row.type as NotificationType, payload);

  return {
    id: row.id,
    type: row.type as NotificationType,
    title,
    body,
    link,
    readAt: row.readAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function describe(type: NotificationType, payload: Record<string, unknown>): { title: string; body: string; link?: string } {
  switch (type) {
    case "listing_approved":
      return {
        title: "Anúncio aprovado",
        body: `Seu anúncio "${payload.listingTitle}" foi aprovado e já está no ar.`,
        link: `/anuncio/${payload.listingId}`,
      };
    case "listing_rejected":
      return {
        title: "Anúncio recusado",
        body: payload.reason
          ? `Seu anúncio "${payload.listingTitle}" foi recusado: ${payload.reason}`
          : `Seu anúncio "${payload.listingTitle}" foi recusado na moderação.`,
        link: `/anuncio/${payload.listingId}`,
      };
    case "new_message":
      return {
        title: "Nova mensagem",
        body: `${payload.senderName} te enviou uma mensagem sobre "${payload.listingTitle}".`,
        link: `/conta/mensagens/${payload.conversationId}`,
      };
    case "partner_verified":
      return {
        title: "Loja/imobiliária verificada",
        body: `"${payload.partnerName}" foi verificada e já pode anunciar.`,
        link: "/parceiro",
      };
    case "new_review":
      return {
        title: "Nova avaliação",
        body: `Você recebeu uma avaliação de ${payload.rating} estrela(s) sobre "${payload.listingTitle}".`,
        link: `/anuncio/${payload.listingId}`,
      };
  }
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(userId: string, type: NotificationType, payload: Record<string, unknown>): Promise<void> {
    await this.prisma.notification.create({
      data: { userId, type, payload: payload as Prisma.InputJsonValue },
    });
  }

  async listMine(userId: string): Promise<Notification[]> {
    const notifications = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return notifications.map(toNotification);
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, id: string): Promise<void> {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.userId !== userId) {
      throw new NotFoundException(`Notificação ${id} não encontrada`);
    }
    if (notification.readAt) return;

    await this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}

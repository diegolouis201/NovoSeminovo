import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@novoseminovo/db";
import type { Notification, NotificationType } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";
import { renderNotificationEmail } from "../email/email-template";

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
    case "listing_suspended":
      return {
        title: "Anúncio suspenso",
        body: `Seu anúncio "${payload.listingTitle}" foi suspenso: ${payload.reason}. Ajuste o anúncio ou fale com a gente pela página de contato.`,
        link: `/anuncio/${payload.listingId}`,
      };
    case "ops_approval_requested":
      return {
        title: "Ação de agente esperando sua aprovação",
        body: `${payload.agentLabel} pediu: ${payload.summary}`,
        link: "/admin/operacao",
      };
    case "marketing_review":
      return {
        title: `Marketing esperando sua aprovação: ${payload.title}`,
        body: String(payload.body ?? "Veja a prévia e aprove, peça alteração ou rejeite."),
        link: "/admin/marketing",
      };
    case "ops_alert":
      return {
        title: `Alerta da operação: ${payload.title}`,
        body: String(payload.body ?? ""),
        link: "/admin/operacao",
      };
    case "listing_tip":
      return {
        title: "Uma dica para o seu anúncio vender mais",
        body: `Sobre "${payload.listingTitle}": ${payload.message}`,
        link: `/anuncio/${payload.listingId}`,
      };
    case "partner_tip":
      return {
        title: String(payload.title ?? "Uma dica para a sua loja"),
        body: String(payload.message ?? ""),
        link: String(payload.link ?? "/parceiro"),
      };
    case "ops_daily_summary":
      return {
        title: `Resumo do dia — ${payload.dayLabel}`,
        body: String(payload.body ?? ""),
        link: "/admin/operacao",
      };
    case "ops_finance_report":
      return {
        title: `Relatório financeiro — ${payload.periodLabel}`,
        body: String(payload.body ?? ""),
        link: "/admin/operacao#financeiro",
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
    case "saved_search_match":
      return {
        title: "Novo anúncio compatível com sua busca",
        body: `"${payload.listingTitle}" acabou de ser aprovado e bate com uma busca salva sua.`,
        link: `/anuncio/${payload.listingId}`,
      };
    case "financing_lead_created":
      return {
        title: "Novo interessado em financiamento",
        body: `${payload.name} (${payload.phone}) pediu contato sobre financiamento${
          payload.listingTitle ? ` de "${payload.listingTitle}"` : ""
        } pelo assistente de IA (${payload.channel === "whatsapp" ? "WhatsApp" : "site"}).`,
        link: `/admin/financiamentos?tipo=${payload.assetType === "vehicle" ? "veicular" : "imobiliario"}`,
      };
    case "partner_trial_ending":
      return {
        title: "Seu período grátis está acabando",
        body: `O período grátis de "${payload.partnerName}" termina em ${payload.endsAtLabel}. Contrate um plano para seus anúncios continuarem no ar.`,
        link: "/parceiro/plano",
      };
    case "affiliate_approved":
      return {
        title: "Você agora é afiliado NovoSeminovo",
        body: `Sua inscrição foi aprovada. Seu código é ${payload.code} — pegue o link e os materiais no painel do afiliado.`,
        link: "/afiliado",
      };
    case "affiliate_commission":
      return {
        title: "Nova comissão de afiliado",
        body: `Você ganhou ${payload.amountLabel} (${payload.description}). Ela fica em análise por ${payload.holdDays} dias antes de liberar.`,
        link: "/afiliado",
      };
    case "partner_offline":
      return {
        title: "Seus anúncios saíram do ar",
        body: `"${payload.partnerName}" está sem plano ativo, então a vitrine e ${payload.count} anúncio(s) foram pausados — nada foi apagado. Contrate um plano e eles voltam na hora.`,
        link: "/parceiro/plano",
      };
    case "service_confirmation_requested":
      return {
        title: "Confirmação de serviço pendente",
        body: `${payload.ownerName ?? "Um cliente"} registrou "${payload.eventTitle}" no veículo ${payload.vehicleLabel} e pediu a sua confirmação.`,
        link: "/parceiro/servicos",
      };
  }
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  // Grava a notificação dentro do site sempre; manda uma cópia por e-mail
  // só quando EmailService.isEnabled() (ver README "Próximos passos") — o
  // título/corpo é o mesmo dos dois lados, computado uma vez por describe().
  async notify(userId: string, type: NotificationType, payload: Record<string, unknown>): Promise<void> {
    await this.prisma.notification.create({
      data: { userId, type, payload: payload as Prisma.InputJsonValue },
    });

    if (!this.email.isEnabled()) return;

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    if (!user) return;

    const { title, body, link } = describe(type, payload);
    const html = renderNotificationEmail({ userName: user.name, title, body, link });
    await this.email.send(user.email, title, html);
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

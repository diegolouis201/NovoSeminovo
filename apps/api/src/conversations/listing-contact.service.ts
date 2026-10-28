import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Acquisition, ListingContactInput } from "@novoseminovo/shared-types";
import { leadOrigin } from "../common/acquisition";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { ContactsService } from "../marketing/contacts.service";
import { ConversationsGateway } from "./conversations.gateway";

// Mesma pessoa (e-mail) no mesmo anúncio: uma mensagem a cada 10 minutos —
// evita clique duplo e robô reenviando; o limite por IP fica no controller.
const SAME_CONTACT_WINDOW_MS = 10 * 60 * 1000;

export const SIMILAR_OFFERS_CONSENT = "Quero receber ofertas parecidas do NovoSeminovo por e-mail (formulário do anúncio).";

// Formulário "Enviar mensagem" do anúncio, com ou sem conta. Guarda o
// contato, avisa o anunciante (sino, e-mail, push) com nome, telefone e
// e-mail; loja ganha também o card no funil (Lead "form"); quem tem conta
// continua a conversa no chat.
@Injectable()
export class ListingContactService {
  private readonly logger = new Logger(ListingContactService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly contacts: ContactsService,
    private readonly gateway: ConversationsGateway,
  ) {}

  async send(listingId: string, input: ListingContactInput, buyerId?: string, acquisition?: Acquisition): Promise<{ ok: true; conversationId?: string }> {
    // Robô preencheu o campo escondido: responde ok e não faz nada.
    if (input.site) return { ok: true };

    const listing = await this.prisma.listing.findUnique({ where: { id: listingId }, select: { id: true, title: true, status: true, type: true, ownerUserId: true, partnerId: true } });
    if (!listing || listing.status !== "active") throw new NotFoundException("Anúncio não encontrado");
    if (buyerId && buyerId === listing.ownerUserId) throw new BadRequestException("Este é o seu anúncio.");

    const recent = await this.prisma.listingContact.findFirst({
      where: { listingId, email: input.email, createdAt: { gte: new Date(Date.now() - SAME_CONTACT_WINDOW_MS) } },
    });
    if (recent) return { ok: true };

    await this.prisma.listingContact.create({
      data: { listingId, buyerId: buyerId ?? null, name: input.name, email: input.email, phone: input.phone, message: input.message, wantsSimilar: input.wantsSimilar },
    });

    if (listing.partnerId) {
      const notes = `Mensagem: ${input.message}`;
      const existing = await this.prisma.lead.findFirst({ where: { listingId, source: "form", OR: [{ contactEmail: input.email }, ...(buyerId ? [{ buyerId }] : [])] } });
      if (existing) {
        await this.prisma.lead.update({ where: { id: existing.id }, data: { notes: `${existing.notes ? `${existing.notes}\n\n` : ""}${notes}`.slice(0, 2000) } });
      } else {
        await this.prisma.lead.create({
          data: {
            partnerId: listing.partnerId,
            listingId,
            buyerId: buyerId ?? null,
            source: "form",
            status: "new",
            contactName: input.name,
            contactPhone: input.phone,
            contactEmail: input.email,
            notes,
            ...(await leadOrigin(this.prisma, buyerId, acquisition)),
          },
        });
      }
    }

    // Com conta: a mensagem também entra no chat, para o anunciante responder por lá.
    const conversationId = buyerId ? await this.postToChat(listing.id, listing.ownerUserId, buyerId, input.message) : undefined;

    await this.notifications.notify(listing.ownerUserId, "listing_contact", {
      listingId: listing.id,
      listingTitle: listing.title,
      contactName: input.name,
      contactPhone: input.phone,
      contactEmail: input.email,
      message: input.message,
      conversationId,
      isPartner: Boolean(listing.partnerId),
    });

    if (input.wantsSimilar) {
      await this.contacts.capture({
        email: input.email,
        phone: input.phone,
        name: input.name,
        userId: buyerId,
        interest: listing.type === "property" ? "comprar_imovel" : "comprar_carro",
        source: "contato_anuncio",
        sourceDetail: listing.id,
        consent: "opt_in",
        consentText: SIMILAR_OFFERS_CONSENT,
      });
    }

    return { ok: true, conversationId };
  }

  private async postToChat(listingId: string, sellerUserId: string, buyerId: string, body: string): Promise<string | undefined> {
    try {
      const conversation =
        (await this.prisma.conversation.findFirst({ where: { listingId, buyerId }, select: { id: true } })) ??
        (await this.prisma.conversation.create({ data: { listingId, buyerId, sellerUserId }, select: { id: true } }));
      const [message] = await this.prisma.$transaction([
        this.prisma.message.create({ data: { conversationId: conversation.id, senderId: buyerId, body }, include: { sender: { select: { name: true } } } }),
        this.prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } }),
      ]);
      this.gateway.emitNewMessage({
        id: message.id,
        conversationId: conversation.id,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
        senderId: buyerId,
        senderName: message.sender.name,
      });
      return conversation.id;
    } catch (error) {
      this.logger.warn(`Mensagem do formulário não foi para o chat (${listingId}): ${(error as Error).message}`);
      return undefined;
    }
  }
}

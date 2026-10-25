import { Injectable, Logger } from "@nestjs/common";
import type { MarketingContact, Prisma } from "@novoseminovo/db";
import type { MarketingInterest } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";

export type ContactConsent = "opt_in" | "legitimate_interest" | "none";

export type ContactInput = {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  userId?: string | null;
  interest?: MarketingInterest;
  source: string;
  sourceDetail?: string | null;
  consent: ContactConsent;
  consentText?: string;
};

const CONSENT_RANK: Record<string, number> = { none: 0, legitimate_interest: 1, opt_in: 2 };

export function normalizeEmail(email: string | null | undefined): string | undefined {
  const clean = (email ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) ? clean : undefined;
}

export function normalizePhone(phone: string | null | undefined): string | undefined {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) digits = digits.slice(2);
  return digits.length >= 10 && digits.length <= 11 ? digits : undefined;
}

// Quem pode receber marketing: tem permissão e não saiu da lista.
export const REACHABLE: Prisma.MarketingContactWhereInput = {
  status: "active",
  email: { not: null },
  consent: { in: ["opt_in", "legitimate_interest"] },
};

// Base de contatos de marketing (leads). Um contato por e-mail; o telefone
// também evita duplicar. A permissão só sobe (nunca rebaixa) e quem pediu
// para sair só volta se pedir de novo, explicitamente (opt_in).
@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async upsert(input: ContactInput): Promise<{ contact: MarketingContact; created: boolean } | undefined> {
    const email = normalizeEmail(input.email);
    const phone = normalizePhone(input.phone);
    if (!email && !phone) return undefined;

    const existing =
      (email ? await this.prisma.marketingContact.findUnique({ where: { email } }) : null) ??
      (input.userId ? await this.prisma.marketingContact.findUnique({ where: { userId: input.userId } }) : null) ??
      (phone ? await this.prisma.marketingContact.findFirst({ where: { phone }, orderBy: { createdAt: "asc" } }) : null);

    if (!existing) {
      const contact = await this.prisma.marketingContact.create({
        data: {
          email,
          phone,
          name: input.name?.trim() || null,
          userId: input.userId ?? null,
          interest: input.interest ?? "geral",
          source: input.source,
          sourceDetail: input.sourceDetail ?? null,
          consent: input.consent,
          consentAt: input.consent === "none" ? null : new Date(),
          consentText: input.consentText,
        },
      });
      return { contact, created: true };
    }

    const data: Prisma.MarketingContactUpdateInput = {};
    if (!existing.email && email) data.email = email;
    if (!existing.phone && phone) data.phone = phone;
    if (!existing.name && input.name) data.name = input.name.trim();
    if (!existing.userId && input.userId) data.userId = input.userId;
    if (existing.interest === "geral" && input.interest && input.interest !== "geral") data.interest = input.interest;
    const upgradesConsent = (CONSENT_RANK[input.consent] ?? 0) > (CONSENT_RANK[existing.consent] ?? 0);
    if (upgradesConsent) {
      data.consent = input.consent;
      data.consentAt = new Date();
      data.consentText = input.consentText;
    }
    // Saiu da lista: só volta com um novo pedido explícito.
    if (existing.status === "unsubscribed" && input.consent === "opt_in") {
      data.status = "active";
      data.unsubscribedAt = null;
      data.consent = "opt_in";
      data.consentAt = new Date();
      data.consentText = input.consentText;
    }
    if (!Object.keys(data).length) return { contact: existing, created: false };
    try {
      const contact = await this.prisma.marketingContact.update({ where: { id: existing.id }, data });
      return { contact, created: false };
    } catch (error) {
      // E-mail ou usuário já ligado a outro contato: fica o que já existia.
      this.logger.warn(`Não juntei o contato ${existing.id}: ${error}`);
      return { contact: existing, created: false };
    }
  }

  // Captação a partir de eventos do site. Nunca derruba quem chamou.
  async capture(input: ContactInput): Promise<void> {
    await this.upsert(input).catch((error) => this.logger.warn(`Captação de contato falhou: ${error}`));
  }

  async unsubscribe(token: string): Promise<MarketingContact | undefined> {
    const contact = await this.prisma.marketingContact.findUnique({ where: { unsubscribeToken: token } });
    if (!contact) return undefined;
    if (contact.status !== "unsubscribed") {
      await this.prisma.$transaction([
        this.prisma.marketingContact.update({ where: { id: contact.id }, data: { status: "unsubscribed", unsubscribedAt: new Date() } }),
        this.prisma.sequenceEnrollment.updateMany({ where: { contactId: contact.id, status: "active" }, data: { status: "stopped", stopReason: "descadastrou" } }),
        this.prisma.emailSend.updateMany({ where: { contactId: contact.id, status: "queued" }, data: { status: "failed", error: "Contato descadastrado" } }),
      ]);
    }
    return contact;
  }

  // Contatos que podem receber marketing num segmento de interesses.
  reachableWhere(interests: string[]): Prisma.MarketingContactWhereInput {
    return { ...REACHABLE, ...(interests.length ? { interest: { in: interests } } : {}) };
  }
}

import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  CONSENTIMENTO_CREDITO,
  CREDITAS_TIME_TO_PURCHASE,
  TERMO_BACEN_CREDITAS,
  formatBRL,
  type Acquisition,
  type CreditasProposalInput,
} from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { ContactsService } from "../marketing/contacts.service";
import { NotificationsService } from "../notifications/notifications.service";
import { LIMITS, LIMIT_WINDOW_MS, REPEAT_DAYS, type ProposalOutcome } from "./credihome.service";
import { createCreditasLead, creditasEnabled, type CreditasLeadRequest } from "./creditas";

const MAX_USER_AGENT = 500;

// De onde veio o aceite das autorizações: IP do visitante (repassado pelo
// site) e identificação do navegador. A Creditas pede os dois junto com o
// termo BACEN.
export type ConsentContext = { ip: string; userAgent: string };

const nowLabel = () => new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

// Texto que vai para fora: sem caracteres de controle e com tamanho máximo.
function clean(value: string, max: number): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

@Injectable()
export class CreditasService {
  private readonly logger = new Logger(CreditasService.name);
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly contacts: ContactsService,
    private readonly notifications: NotificationsService,
  ) {}

  // Mesmo limite do pedido de proposta da Credihome (pedido vira lead real).
  private checkLimit(visitor: string): void {
    const now = Date.now();
    const recent = (this.hits.get(visitor) ?? []).filter((time) => now - time < LIMIT_WINDOW_MS);
    if (recent.length >= LIMITS.proposal) {
      throw new HttpException("Muitos pedidos em pouco tempo. Espere alguns minutos e tente de novo.", HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    this.hits.set(visitor, recent);
    if (this.hits.size > 5000) {
      for (const [entry, times] of this.hits) if (!times.some((time) => now - time < LIMIT_WINDOW_MS)) this.hits.delete(entry);
    }
  }

  private async vehicleListing(listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        price: true,
        partnerId: true,
        financingEnabled: true,
        vehicleDetails: {
          select: {
            version: true,
            yearManufacture: true,
            yearModel: true,
            fipeCode: true,
            brand: { select: { name: true } },
            model: { select: { name: true } },
          },
        },
      },
    });
    if (!listing || listing.status !== "active") throw new NotFoundException("Anúncio não encontrado");
    if (listing.type !== "vehicle") throw new BadRequestException("Este pedido de financiamento é só para veículos.");
    if (!listing.financingEnabled) throw new BadRequestException("O anunciante não ofereceu financiamento neste anúncio.");
    return listing;
  }

  // Pedido de proposta pelo comprador na página do anúncio de veículo: vira
  // card no quadro de financiamentos e vai à Creditas (Autofin C2C). Se não
  // der para enviar, o card fica salvo com o motivo para o admin seguir.
  async requestProposal(
    listingId: string,
    input: CreditasProposalInput,
    visitor: string,
    consentContext: ConsentContext,
    acquisition?: Acquisition,
    buyerUserId?: string,
  ): Promise<{ outcome: ProposalOutcome }> {
    const listing = await this.vehicleListing(listingId);
    const price = Number(listing.price);
    const downValue = Math.round((input.downValue ?? 0) * 100) / 100;
    if (downValue >= price) throw new BadRequestException("A entrada precisa ser menor que o valor do veículo.");
    const financingValue = Math.round((price - downValue) * 100) / 100;
    this.checkLimit(visitor);

    const repeated = await this.prisma.financingLead.findFirst({
      where: { listingId, phone: input.phone, createdAt: { gte: new Date(Date.now() - REPEAT_DAYS * 86_400_000) } },
      select: { id: true, creditasLeadId: true, adminNotes: true },
    });
    if (repeated?.creditasLeadId) return { outcome: "already_sent" };

    const acceptedAt = new Date();
    const notes = [
      "Pedido de proposta de financiamento de veículo pelo formulário Creditas do anúncio.",
      `Veículo ${formatBRL(price)}, entrada ${formatBRL(downValue)}, financiar ${formatBRL(financingValue)}.`,
      `Quando pretende comprar: ${CREDITAS_TIME_TO_PURCHASE[input.timeToPurchase]}.`,
      `Autorização de crédito versão ${CONSENTIMENTO_CREDITO.versao} e termo BACEN versão ${TERMO_BACEN_CREDITAS.versao} aceitos em ${nowLabel()}.`,
    ].join(" ");

    const lead =
      repeated ??
      (await this.prisma.financingLead.create({
        data: {
          channel: "web",
          name: input.name.trim(),
          phone: input.phone,
          email: input.email,
          assetType: "vehicle",
          listingId,
          assetValue: price,
          downPayment: downValue,
          notes,
          buyerUserId,
          acqSource: acquisition?.source,
          acqCampaign: acquisition?.campaign,
        },
        select: { id: true, creditasLeadId: true, adminNotes: true },
      }));

    await this.contacts
      .capture({
        email: input.email,
        phone: input.phone,
        name: input.name,
        interest: "comprar_carro",
        source: acquisition?.source ?? "direto",
        sourceDetail: "financiamento",
        consent: "legitimate_interest",
        consentText: "Pedido de proposta de financiamento de veículo pelo anúncio.",
      })
      .catch((error) => this.logger.error(`Falha ao registrar contato do pedido Creditas: ${error}`));

    // Marca, modelo e anos são obrigatórios na Creditas.
    const details = listing.vehicleDetails;
    const missing = [
      !details?.brand?.name?.trim() && "marca",
      !details?.model?.name?.trim() && "modelo",
      !(details && details.yearModel > 1900) && "ano do modelo",
      !(details && details.yearManufacture > 1900) && "ano de fabricação",
    ].filter((item): item is string => Boolean(item));

    let outcome: ProposalOutcome = "saved";
    let failure: string | undefined;
    if (missing.length || !details) {
      failure = `o anúncio não tem ${missing.join(", ")} cadastrado(s)`;
    } else if (!creditasEnabled()) {
      failure = "a Creditas ainda não está configurada no servidor";
    } else {
      const request: CreditasLeadRequest = {
        lead: {
          name: clean(input.name, 120),
          cpf: input.cpf.replace(/\D/g, ""),
          birthDate: input.birthDate,
          phone: input.phone,
          email: input.email,
        },
        vehicle: {
          brand: clean(details.brand.name, 100),
          model: clean(details.model.name, 100),
          ...(details.version?.trim() ? { modelVersion: clean(details.version, 150) } : {}),
          modelYear: details.yearModel,
          manufacturingYear: details.yearManufacture,
          ...(details.fipeCode?.trim() ? { fipeCode: clean(details.fipeCode, 20) } : {}),
        },
        simulationParameters: {
          financingValue,
          downValue,
          // Loja parceira = falando com a loja; pessoa física = com o vendedor.
          purchasePhase: listing.partnerId ? "CONTACT_STORE" : "CONTACT_SELLER",
          timeToPurchase: input.timeToPurchase,
        },
        bacenAuthorization: {
          userIp: clean(consentContext.ip, 100),
          userAgent: clean(consentContext.userAgent, MAX_USER_AGENT),
          authorizationTerm: TERMO_BACEN_CREDITAS.texto,
        },
      };
      try {
        const { id } = await createCreditasLead(request);
        const sentAt = new Date();
        const current = await this.prisma.financingLead.findUnique({ where: { id: lead.id }, select: { bank: true, negotiatedValue: true } });
        await this.prisma.financingLead.update({
          where: { id: lead.id },
          data: {
            creditasLeadId: id,
            creditasSentAt: sentAt,
            creditasConsentAt: acceptedAt,
            ...(current?.bank ? {} : { bank: "Creditas" }),
            ...(current?.negotiatedValue == null ? { negotiatedValue: financingValue } : {}),
          },
        });
        outcome = "sent";
      } catch (error) {
        // Mensagens do cliente da Creditas já saem sem chave/token (scrub).
        failure = error instanceof Error ? error.message : String(error);
      }
    }

    if (failure) {
      this.logger.error(`Pedido não foi à Creditas (lead ${lead.id}): ${failure}`);
      // O motivo fica no card (o log some quando o servidor reinicia).
      await this.prisma.financingLead
        .update({
          where: { id: lead.id },
          data: {
            adminNotes: [lead.adminNotes, `Não foi à Creditas em ${nowLabel()}: ${failure.slice(0, 300)}`].filter(Boolean).join("\n"),
          },
        })
        .catch(() => undefined);
    }

    const admins = await this.prisma.user.findMany({ where: { role: "admin", status: "active" }, select: { id: true } });
    for (const admin of admins) {
      await this.notifications
        .notify(admin.id, "financing_lead_created", {
          name: input.name,
          phone: input.phone,
          listingTitle: listing.title,
          channel: "simulador",
          assetType: "vehicle",
          creditas:
            outcome === "sent"
              ? "Já foi enviado à Creditas."
              : `Não foi à Creditas${failure ? ` (${failure.slice(0, 200)})` : ""} — fale com o cliente pelo quadro.`,
        })
        .catch((error) => this.logger.error(`Falha ao notificar admin sobre pedido Creditas: ${error}`));
    }
    return { outcome };
  }
}

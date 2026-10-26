import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import {
  CREDIHOME_PURCHASE_WINDOWS,
  formatBRL,
  type Acquisition,
  type CredihomeProposalInput,
  type CredihomeSimulateInput,
  type CredihomeSimulationView,
  type SendToCredihomeInput,
} from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { ContactsService } from "../marketing/contacts.service";
import { NotificationsService } from "../notifications/notifications.service";
import { trackRoutine } from "../operations/routine-health";
import { CredihomeError, createCredihomeLead, credihomeEnabled, fetchCredihomePhase, simulateCredihome } from "./credihome";

const SYNC_MS = 6 * 60 * 60 * 1000;
// Leads que ainda andam na Credihome: fase diferente de "finalizado" e
// enviados há menos de 6 meses (depois disso a fase não muda mais).
const SYNC_WINDOW_DAYS = 180;

// Simulador público na página do imóvel: limite por visitante (IP que o site
// repassa) numa janela de 10 minutos. Pedido de proposta vira lead real na
// Credihome, então o limite é bem mais apertado.
const LIMITS = { simulate: 20, proposal: 3 };
const LIMIT_WINDOW_MS = 10 * 60 * 1000;
// Mesmo telefone pedindo de novo no mesmo anúncio dentro de 7 dias (a mesma
// janela em que a Credihome recusa lead repetido) não gera outro card.
const REPEAT_DAYS = 7;

export type ProposalOutcome = "sent" | "already_sent" | "saved";

// Telefone no formato que a Credihome pede: DDD + número, sem o 55.
export function credihomePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
}

@Injectable()
export class CredihomeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CredihomeService.name);
  private timer?: NodeJS.Timeout;
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly contacts: ContactsService,
    private readonly notifications: NotificationsService,
  ) {}

  private checkLimit(kind: keyof typeof LIMITS, visitor: string): void {
    const key = `${kind}:${visitor}`;
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((time) => now - time < LIMIT_WINDOW_MS);
    if (recent.length >= LIMITS[kind]) {
      throw new HttpException("Muitas simulações em pouco tempo. Espere alguns minutos e tente de novo.", HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) {
      for (const [entry, times] of this.hits) if (!times.some((time) => now - time < LIMIT_WINDOW_MS)) this.hits.delete(entry);
    }
  }

  private async propertyListing(listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, title: true, type: true, status: true },
    });
    if (!listing || listing.status !== "active") throw new NotFoundException("Anúncio não encontrado");
    if (listing.type !== "property") throw new BadRequestException("O simulador de crédito é só para imóveis.");
    return listing;
  }

  async simulate(listingId: string, input: CredihomeSimulateInput, visitor: string): Promise<CredihomeSimulationView> {
    await this.propertyListing(listingId);
    if (!credihomeEnabled()) throw new ServiceUnavailableException("Simulador indisponível no momento.");
    this.checkLimit("simulate", visitor);
    try {
      return await simulateCredihome(input);
    } catch (error) {
      if (error instanceof CredihomeError) {
        this.logger.warn(`Simulação Credihome falhou: ${error.message}`);
        if (error.status && error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 403) {
          throw new BadRequestException(error.message);
        }
        throw new ServiceUnavailableException("O simulador dos bancos não respondeu agora. Tente de novo em alguns minutos.");
      }
      throw error;
    }
  }

  // Pedido de proposta pelo próprio comprador no anúncio: vira card no quadro
  // de financiamentos e vai à Credihome no código de parceiro. Se a Credihome
  // falhar, o card fica salvo pro admin reenviar pelo quadro.
  async requestProposal(
    listingId: string,
    input: CredihomeProposalInput & { phone: string },
    visitor: string,
    acquisition?: Acquisition,
  ): Promise<{ outcome: ProposalOutcome }> {
    const listing = await this.propertyListing(listingId);
    this.checkLimit("proposal", visitor);

    const repeated = await this.prisma.financingLead.findFirst({
      where: { listingId, phone: input.phone, createdAt: { gte: new Date(Date.now() - REPEAT_DAYS * 86_400_000) } },
      select: { id: true, credihomeLeadId: true },
    });
    if (repeated?.credihomeLeadId) return { outcome: "already_sent" };

    const window = CREDIHOME_PURCHASE_WINDOWS[input.purchaseWindow];
    const notes = [
      "Pedido de proposta pelo simulador do anúncio.",
      `Financiar ${formatBRL(input.mortgageValue)} em ${input.months} meses.`,
      `Quando pretende comprar: ${window}.`,
      input.useFgts ? "Vai usar FGTS." : undefined,
    ]
      .filter(Boolean)
      .join(" ");

    const lead =
      repeated ??
      (await this.prisma.financingLead.create({
        data: {
          channel: "web",
          name: input.name.trim(),
          phone: input.phone,
          email: input.email,
          assetType: "property",
          listingId,
          assetValue: input.realtyPrice,
          downPayment: Math.max(0, input.realtyPrice - input.mortgageValue),
          notes,
          acqSource: acquisition?.source,
          acqCampaign: acquisition?.campaign,
        },
        select: { id: true, credihomeLeadId: true },
      }));

    await this.contacts
      .capture({
        email: input.email,
        phone: input.phone,
        name: input.name,
        interest: "comprar_imovel",
        source: acquisition?.source ?? "direto",
        sourceDetail: "financiamento",
        consent: "legitimate_interest",
        consentText: "Pedido de proposta de financiamento pelo simulador do anúncio.",
      })
      .catch((error) => this.logger.error(`Falha ao registrar contato do simulador: ${error}`));

    let outcome: ProposalOutcome = "saved";
    let alreadyExisted = false;
    let failure: string | undefined;
    if (credihomeEnabled()) {
      try {
        alreadyExisted = (await this.send(lead.id, { ...input, consent: true }, input.months)).alreadyExisted;
        outcome = "sent";
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
        this.logger.error(`Pedido do simulador não foi à Credihome (lead ${lead.id}): ${failure}`);
        // O motivo fica no card (o log some quando o servidor reinicia).
        await this.prisma.financingLead
          .update({
            where: { id: lead.id },
            data: { adminNotes: `Não foi à Credihome em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}: ${failure.slice(0, 300)}` },
          })
          .catch(() => undefined);
      }
    }

    const admins = await this.prisma.user.findMany({ where: { role: "admin", status: "active" }, select: { id: true } });
    for (const admin of admins) {
      await this.notifications
        .notify(admin.id, "financing_lead_created", {
          name: input.name,
          phone: input.phone,
          listingTitle: listing.title,
          channel: "simulador",
          assetType: "property",
          credihome:
            outcome !== "sent"
              ? `Não foi à Credihome${failure ? ` (${failure.slice(0, 200)})` : ""} — envie pelo quadro.`
              : alreadyExisted
                ? "O cliente já tinha pedido na Credihome nesta semana: ligamos ao pedido existente. Confira os valores no painel da Credihome."
                : "Já foi enviado à Credihome.",
        })
        .catch((error) => this.logger.error(`Falha ao notificar admin sobre pedido do simulador: ${error}`));
    }
    return { outcome };
  }

  onModuleInit(): void {
    if (process.env.CREDIHOME_SYNC_DISABLED === "1") return;
    const run = () =>
      void trackRoutine("credihome", SYNC_MS, () =>
        this.syncAll().catch((error) => {
          this.logger.error(`Falha ao atualizar as fases da Credihome: ${error}`);
          throw error;
        }),
      );
    setTimeout(run, 5 * 60 * 1000).unref();
    this.timer = setInterval(run, SYNC_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // Envio feito pelo admin no quadro de financiamentos, depois de conversar
  // com o cliente e ele autorizar. CPF e nascimento só passam por aqui.
  async send(leadId: string, input: SendToCredihomeInput, months?: number): Promise<{ credihomeLeadId: string; alreadyExisted: boolean }> {
    const lead = await this.prisma.financingLead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException("Lead não encontrado");
    if (lead.assetType !== "property") throw new BadRequestException("A Credihome só faz financiamento de imóvel.");
    if (lead.credihomeLeadId) throw new BadRequestException("Este lead já foi enviado à Credihome.");
    if (!credihomeEnabled()) throw new BadRequestException("A Credihome ainda não está configurada no servidor.");

    const siteUrl = process.env.WEB_ORIGIN ?? "https://novoseminovo.com.br";
    let result;
    try {
      result = await createCredihomeLead({
        name: lead.name,
        cpf: input.cpf,
        dateOfBirth: input.dateOfBirth,
        phone: credihomePhone(lead.phone),
        email: input.email,
        useFgts: input.useFgts,
        realtyPrice: input.realtyPrice,
        mortgageValue: input.mortgageValue,
        months,
        sourceUrl: lead.listingId ? `${siteUrl}/anuncio/${lead.listingId}` : siteUrl,
      });
    } catch (error) {
      if (error instanceof CredihomeError) throw new BadRequestException(`Credihome: ${error.message}`);
      throw error;
    }

    const now = new Date();
    await this.prisma.financingLead.update({
      where: { id: leadId },
      data: {
        credihomeLeadId: result.leadId,
        credihomePhase: "lead",
        credihomeSentAt: now,
        credihomeConsentAt: now,
        // Valor a financiar vira o valor negociado, se o admin ainda não tinha
        // preenchido — é a base da comissão no quadro.
        ...(lead.negotiatedValue === null ? { negotiatedValue: input.mortgageValue } : {}),
        ...(lead.email ? {} : { email: input.email }),
        ...(lead.bank ? {} : { bank: "Credihome" }),
        // A Credihome não cria lead novo pro mesmo CPF/e-mail em 7 dias:
        // devolve o antigo, com os valores (e nascimento) do pedido anterior.
        ...(result.alreadyExisted
          ? {
              adminNotes: [
                lead.adminNotes,
                `Cliente já tinha pedido na Credihome nos últimos 7 dias: ligado ao pedido existente. Lá podem estar os valores do pedido anterior — confira e ajuste no painel da Credihome (aqui: imóvel ${formatBRL(input.realtyPrice)}, financiar ${formatBRL(input.mortgageValue)}).`,
              ]
                .filter(Boolean)
                .join("\n"),
            }
          : {}),
      },
    });
    // Fase real (o lead pode já existir lá e estar mais adiante).
    await this.refresh(leadId).catch(() => undefined);
    return { credihomeLeadId: result.leadId, alreadyExisted: result.alreadyExisted };
  }

  async refresh(leadId: string): Promise<{ phase: string }> {
    const lead = await this.prisma.financingLead.findUnique({ where: { id: leadId }, select: { credihomeLeadId: true } });
    if (!lead) throw new NotFoundException("Lead não encontrado");
    if (!lead.credihomeLeadId) throw new BadRequestException("Este lead ainda não foi enviado à Credihome.");
    try {
      const { phase } = await fetchCredihomePhase(lead.credihomeLeadId);
      await this.prisma.financingLead.update({ where: { id: leadId }, data: { credihomePhase: phase, credihomeSyncedAt: new Date() } });
      return { phase };
    } catch (error) {
      if (error instanceof CredihomeError) throw new BadRequestException(`Credihome: ${error.message}`);
      throw error;
    }
  }

  async syncAll(): Promise<{ updated: number; failed: number }> {
    if (!credihomeEnabled()) return { updated: 0, failed: 0 };
    const leads = await this.prisma.financingLead.findMany({
      where: {
        credihomeLeadId: { not: null },
        OR: [{ credihomePhase: null }, { credihomePhase: { not: "finalizado" } }],
        credihomeSentAt: { gte: new Date(Date.now() - SYNC_WINDOW_DAYS * 86_400_000) },
      },
      select: { id: true },
      take: 200,
    });
    let updated = 0;
    let failed = 0;
    for (const lead of leads) {
      try {
        await this.refresh(lead.id);
        updated++;
      } catch {
        failed++;
      }
    }
    if (failed) this.logger.warn(`Credihome: ${failed} lead(s) não atualizaram`);
    return { updated, failed };
  }
}

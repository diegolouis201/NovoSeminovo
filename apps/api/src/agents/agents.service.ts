import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import { Prisma, type AgentConversation } from "@novoseminovo/db";
import {
  CREDIHOME_PHASE_LABELS,
  formatBRL,
  type AgentConversationView,
  type AgentKind,
  type AgentReply,
  type FinancingLeadStatus,
  type UpdateFinancingLeadInput,
  type FinancingLeadSummary,
  type ListingSummary,
  type Acquisition,
} from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { ContactsService } from "../marketing/contacts.service";
import { NotificationsService } from "../notifications/notifications.service";
import { ListingsService } from "../listings/listings.service";
import { PartnersService } from "../partners/partners.service";
import { AdminService } from "../admin/admin.service";
import { RebatesService } from "../rebates/rebates.service";
import { runAgentTurn, visibleMessages, type AgentDefinition } from "./agent-engine";
import { buildBuyerAgent, type FinancingLeadInput } from "./buyer-agent";
import { buildPartnerAgent } from "./partner-agent";
import { buildAdminAgent } from "./admin-agent";
import { trackedAnthropic } from "../operations/ai-usage";

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
const DEFAULT_HUMAN_WHATSAPP = "5531936187896";

export type AgentRequester = { id: string; role: string };

// Agentes que lidam com dados privados (estoque, leads, vendas) — nunca
// atendem visitante anônimo, e a conversa nasce presa ao usuário logado.
const LOGIN_REQUIRED = new Set<AgentKind>(["partner", "admin"]);

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
    private readonly partners: PartnersService,
    private readonly admin: AdminService,
    private readonly rebates: RebatesService,
    private readonly contacts: ContactsService,
  ) {}

  isEnabled(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada");
      this.client = trackedAnthropic("assistentes", apiKey);
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
    acquisition?: Acquisition,
  ): Promise<AgentReply> {
    if (!this.isEnabled()) throw new ServiceUnavailableException("Assistente de IA indisponível no momento.");
    if (LOGIN_REQUIRED.has(kind) && !requester) throw new UnauthorizedException("Entre na sua conta para usar este assistente.");
    this.checkRateLimit(requester ? `user:${requester.id}` : `ip:${clientIp}`);

    let conversation = input.conversationId
      ? await this.loadWebConversation(kind, input.conversationId, requester)
      : await this.prisma.agentConversation.create({
          data: { kind, channel: "web", userId: requester?.id, acqSource: acquisition?.source, acqCampaign: acquisition?.campaign },
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

  // Mensagem que chegou pelo WhatsApp (ver WhatsAppService) — mesmo limite
  // por pessoa do site, contado pelo telefone.
  async respondWhatsApp(conversation: AgentConversation, phone: string, message: string): Promise<string> {
    if (!this.isEnabled()) throw new ServiceUnavailableException("O assistente está fora do ar no momento.");
    this.checkRateLimit(`wa:${phone}`);
    return (await this.respond(conversation, message)).reply;
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
          select: { name: true, phone: true, role: true, status: true },
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
            whatsappPhone: conversation.channel === "whatsapp" ? conversation.externalId ?? undefined : undefined,
            seenListings,
          },
          {
            listings: this.listings,
            saveFinancingLead: (input) => this.saveFinancingLead(conversation, input),
          },
        );
      case "partner": {
        // Dono ou membro da equipe — o mesmo critério de acesso do painel
        // (ver PartnersService.findPartnerForUser). Rechecado a cada mensagem:
        // quem saiu da equipe perde o assistente na hora.
        const partner = conversation.userId
          ? await this.prisma.partner.findFirst({
              where: {
                OR: [{ ownerUserId: conversation.userId }, { members: { some: { userId: conversation.userId } } }],
              },
              select: { id: true, legalName: true, type: true, slug: true },
            })
          : null;
        if (!user || !partner || !conversation.userId) {
          throw new ForbiddenException("Este assistente é só para lojas, imobiliárias e corretores cadastrados.");
        }
        return buildPartnerAgent(
          {
            userId: conversation.userId,
            userName: user.name,
            partner,
            siteUrl: process.env.WEB_ORIGIN ?? "https://novoseminovo.com.br",
          },
          { prisma: this.prisma, partners: this.partners, listings: this.listings },
        );
      }
      case "admin": {
        // Papel lido do banco a cada mensagem, não do JWT (que vale 30 dias):
        // quem deixou de ser admin perde o assistente na hora.
        if (!user || !conversation.userId || user.role !== "admin" || user.status !== "active") {
          throw new ForbiddenException("Este assistente é só para administradores.");
        }
        return buildAdminAgent(
          { adminId: conversation.userId, adminName: user.name },
          {
            prisma: this.prisma,
            admin: this.admin,
            rebates: this.rebates,
            listFinancingLeads: (status, assetType) => this.listFinancingLeads(status, assetType),
            updateFinancingLeadStatus: (id, status) => this.updateFinancingLeadStatus(conversation.userId!, id, status),
          },
        );
      }
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
      data: {
        ...data,
        conversationId: conversation.id,
        channel: conversation.channel,
        // Pelo WhatsApp da Meta a origem é o próprio WhatsApp; pelo site, a do visitante.
        acqSource: conversation.channel === "whatsapp" ? "whatsapp" : conversation.acqSource,
        acqCampaign: conversation.acqCampaign,
      },
      select: { id: true },
    });

    // Quem pediu financiamento pediu contato sobre comprar: entra na jornada de compra.
    await this.contacts.capture({
      email: input.email,
      phone: input.phone,
      name: input.name,
      interest: input.assetType === "property" ? "comprar_imovel" : "comprar_carro",
      source: conversation.channel === "whatsapp" ? "whatsapp" : (conversation.acqSource ?? "direto"),
      sourceDetail: "financiamento",
      consent: "legitimate_interest",
      consentText: "Pedido de simulação de financiamento pelo assistente.",
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
          assetType: input.assetType,
        })
        .catch((error) => this.logger.error(`Falha ao notificar admin sobre lead de financiamento: ${error}`));
    }

    return lead;
  }

  async listFinancingLeads(
    status?: FinancingLeadStatus,
    assetType?: "vehicle" | "property",
  ): Promise<FinancingLeadSummary[]> {
    const leads = await this.prisma.financingLead.findMany({
      where: { ...(status ? { status } : {}), ...(assetType ? { assetType } : {}) },
      include: {
        listing: { select: { title: true } },
        financingDeal: { select: { status: true, paidAt: true, rebatePercent: true, rebateAmount: true, commissionAmount: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    // Percentual previsto por anúncio (o nível do parceiro é o mesmo pra
    // todos os leads do mesmo anúncio) — uma consulta por anúncio, não por lead.
    const previews = new Map<string, Awaited<ReturnType<RebatesService["previewRebate"]>>>();
    for (const listingId of new Set(leads.flatMap((lead) => (lead.listingId ? [lead.listingId] : [])))) {
      previews.set(listingId, await this.rebates.previewRebate(listingId));
    }

    const money = (value: Prisma.Decimal | null) => (value === null ? undefined : Number(value));
    return leads.map((lead) => {
      const assetValue = money(lead.assetValue);
      const downPayment = money(lead.downPayment);
      const monthlyIncome = money(lead.monthlyIncome);
      const negotiatedValue = money(lead.negotiatedValue);
      const commissionRate = Number(lead.commissionRate);
      // Comissão do correspondente incide sobre o valor financiado. Sem valor
      // negociado ainda, estima pelo que o comprador informou (bem − entrada)
      // — marcado como estimativa no quadro.
      const estimateBase = assetValue !== undefined ? assetValue - (downPayment ?? 0) : undefined;
      const base = negotiatedValue ?? (estimateBase && estimateBase > 0 ? estimateBase : undefined);
      const deal = lead.financingDeal;
      // Concluído: vale o que foi registrado no negócio (retrato do nível do
      // parceiro na hora) — não o cálculo de hoje.
      const commissionAmount = deal
        ? Number(deal.commissionAmount)
        : base !== undefined
          ? Math.round(base * commissionRate) / 100
          : undefined;

      let partnerShare: FinancingLeadSummary["partnerShare"];
      if (deal) {
        const amount = Number(deal.rebateAmount);
        partnerShare = {
          receiverLabel: previews.get(lead.listingId ?? "")?.receiverLabel ?? lead.listing?.title ?? "anunciante",
          percent: Number(deal.rebatePercent),
          amount,
          amountLabel: formatBRL(amount),
          stage: deal.status === "paid" ? "paid" : "to_pay",
          paidAt: deal.paidAt?.toISOString(),
        };
      } else if (lead.listingId) {
        const preview = previews.get(lead.listingId);
        if (preview) {
          const amount = commissionAmount !== undefined ? Math.round(commissionAmount * preview.percent) / 100 : undefined;
          partnerShare = {
            receiverLabel: preview.receiverLabel,
            percent: preview.percent,
            amount,
            amountLabel: amount === undefined ? undefined : formatBRL(amount),
            stage: "expected",
          };
        }
      }
      const netCommission =
        commissionAmount === undefined ? undefined : Math.round((commissionAmount - (partnerShare?.amount ?? 0)) * 100) / 100;

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
        negotiatedValue,
        negotiatedValueLabel: negotiatedValue === undefined ? undefined : formatBRL(negotiatedValue),
        commissionRate,
        commissionAmount,
        commissionAmountLabel: commissionAmount === undefined ? undefined : formatBRL(commissionAmount),
        commissionIsEstimate: !deal && negotiatedValue === undefined,
        bank: lead.bank ?? undefined,
        adminNotes: lead.adminNotes ?? undefined,
        partnerShare,
        netCommission,
        netCommissionLabel: netCommission === undefined ? undefined : formatBRL(netCommission),
        statusChangedAt: lead.statusChangedAt?.toISOString(),
        credihome:
          lead.credihomeLeadId && lead.credihomeSentAt
            ? {
                leadId: lead.credihomeLeadId,
                phase: lead.credihomePhase ?? undefined,
                phaseLabel: (lead.credihomePhase && CREDIHOME_PHASE_LABELS[lead.credihomePhase]) ?? lead.credihomePhase ?? "Enviado",
                sentAt: lead.credihomeSentAt.toISOString(),
                syncedAt: lead.credihomeSyncedAt?.toISOString(),
              }
            : undefined,
        createdAt: lead.createdAt.toISOString(),
      };
    });
  }

  async updateFinancingLead(adminId: string, id: string, input: UpdateFinancingLeadInput): Promise<void> {
    const lead = await this.prisma.financingLead.findUnique({
      where: { id },
      include: { financingDeal: { select: { id: true, status: true } } },
    });
    if (!lead) throw new NotFoundException("Lead não encontrado");
    // Avaliação do imóvel (engenharia do banco) não existe no financiamento
    // de veículo — o quadro veicular nem tem essa coluna.
    if (input.status === "property_appraisal" && lead.assetType !== "property") {
      throw new BadRequestException("Avaliação do imóvel só existe no financiamento imobiliário.");
    }

    const nextStatus = input.status ?? lead.status;
    const negotiatedValue =
      input.negotiatedValue !== undefined ? input.negotiatedValue : lead.negotiatedValue === null ? null : Number(lead.negotiatedValue);
    const commissionRate = input.commissionRate ?? Number(lead.commissionRate);
    const bank = input.bank !== undefined ? input.bank || null : lead.bank;
    const valuesChanged =
      (input.negotiatedValue !== undefined && input.negotiatedValue !== (lead.negotiatedValue === null ? null : Number(lead.negotiatedValue))) ||
      (input.commissionRate !== undefined && input.commissionRate !== Number(lead.commissionRate)) ||
      (input.bank !== undefined && (input.bank || null) !== lead.bank);

    if (lead.financingDeal?.status === "paid" && (nextStatus !== "converted" || valuesChanged)) {
      throw new BadRequestException(
        "O repasse deste financiamento já foi pago — valor, comissão e banco não podem mais mudar, nem a etapa.",
      );
    }

    // Concluído com anúncio = negócio registrado no programa de recompensa
    // (entra no fechamento mensal e no "Meus ganhos" do anunciante). Sem
    // anúncio, a comissão é toda do correspondente — não há repasse.
    let financingDealId = lead.financingDealId;
    const needsDeal = nextStatus === "converted" && Boolean(lead.listingId);
    if (needsDeal && !negotiatedValue) {
      throw new BadRequestException("Preencha o valor negociado (financiado) antes de concluir — é a base da comissão e do repasse.");
    }
    if (lead.financingDeal && (!needsDeal || valuesChanged)) {
      // Desliga do card antes de apagar (a chave estrangeira não deixa apagar
      // um negócio ainda ligado). Pago já foi barrado acima.
      await this.prisma.financingLead.update({ where: { id }, data: { financingDealId: null } });
      await this.rebates.deleteUnpaidDeal(lead.financingDeal.id);
      financingDealId = null;
    }

    await this.prisma.financingLead.update({
      where: { id },
      data: {
        ...(input.status && input.status !== lead.status ? { status: input.status, statusChangedAt: new Date() } : {}),
        ...(input.negotiatedValue !== undefined ? { negotiatedValue: input.negotiatedValue } : {}),
        ...(input.commissionRate !== undefined ? { commissionRate: input.commissionRate } : {}),
        ...(input.bank !== undefined ? { bank: input.bank || null } : {}),
        ...(input.adminNotes !== undefined ? { adminNotes: input.adminNotes || null } : {}),
      },
    });

    if (needsDeal && !financingDealId && lead.listingId && negotiatedValue) {
      const assetValue = Math.max(Number(lead.assetValue ?? 0), negotiatedValue);
      const deal = await this.rebates.registerDeal(adminId, {
        listingId: lead.listingId,
        financingProvider: bank ?? "Banco não informado",
        externalRef: `lead:${lead.id}`,
        assetValue,
        financedAmount: negotiatedValue,
        commissionRate,
      });
      await this.prisma.financingLead.update({ where: { id }, data: { financingDealId: deal.id } });
    }
  }

  async updateFinancingLeadStatus(adminId: string, id: string, status: FinancingLeadStatus): Promise<void> {
    await this.updateFinancingLead(adminId, id, { status });
  }
}

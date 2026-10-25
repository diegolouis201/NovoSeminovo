import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { EmailCampaign, EmailSequence, MarketingContact, Prisma } from "@novoseminovo/db";
import type {
  EmailCampaignInput,
  EmailCampaignView,
  EmailSequenceStep,
  EmailSequenceView,
  MarketingDecisionInput,
} from "@novoseminovo/shared-types";
import { EmailService } from "../email/email.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { TaskQueueService } from "../operations/task-queue.service";
import { brtDayStart } from "../operations/usage.service";
import { ContactsService, REACHABLE } from "./contacts.service";
import { renderMarketingEmail } from "./email-render";
import { contentHash, marketingTarget, notifyReview, publicApiUrl, signLink, slugify } from "./links";

const DAY_MS = 24 * 60 * 60 * 1000;
const SENDS_PER_TICK = 20;
const OPEN_CAMPAIGN = ["awaiting_approval", "changes_requested", "approved", "scheduled"];

// Teto diário de e-mails de marketing (plano grátis do Resend: 100/dia no
// total, e os avisos do site também contam). EMAIL_DAILY_LIMIT muda.
export function emailDailyLimit(): number {
  const value = Number(process.env.EMAIL_DAILY_LIMIT);
  return Number.isFinite(value) && value >= 0 ? value : 80;
}

function sendGapMs(): number {
  const value = Number(process.env.EMAIL_SEND_GAP_MS);
  return Number.isFinite(value) && value >= 0 ? value : 600;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Segment = { interests: string[] };

function campaignHash(campaign: Pick<EmailCampaign, "subject" | "preheader" | "body" | "ctaLabel" | "ctaUrl" | "segment">): string {
  return contentHash({
    subject: campaign.subject,
    preheader: campaign.preheader,
    body: campaign.body,
    ctaLabel: campaign.ctaLabel,
    ctaUrl: campaign.ctaUrl,
    segment: campaign.segment,
  });
}

function sequenceHash(sequence: Pick<EmailSequence, "interests" | "steps">): string {
  return contentHash({ interests: sequence.interests, steps: sequence.steps });
}

export function clickUrl(sendId: string, target: string): string {
  return `${publicApiUrl()}/m/c/${sendId}/${signLink(`${sendId}|${target}`)}?u=${encodeURIComponent(target)}`;
}

export function unsubscribeUrl(token: string): string {
  return `${publicApiUrl()}/m/u/${token}`;
}

// E-mail (campanhas, sequências, envio, webhook do Resend). Nada sai sem
// aprovação: a campanha/sequência aprovada guarda contentHash e cada envio
// confere de novo. Só recebe quem tem consentimento e não saiu da lista.
@Injectable()
export class EmailMarketingService {
  private readonly logger = new Logger(EmailMarketingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly contacts: ContactsService,
    private readonly notifications: NotificationsService,
    private readonly queue: TaskQueueService,
  ) {}

  enabled(): boolean {
    return this.email.isEnabled();
  }

  // ---------------- Campanhas ----------------

  async createCampaign(input: EmailCampaignInput, by: "admin" | "agent", taskId?: string): Promise<EmailCampaign> {
    const campaign = await this.prisma.emailCampaign.create({ data: { ...this.campaignData(input), taskId } });
    if (by === "agent") {
      const audience = await this.audienceSize({ interests: input.interests });
      await notifyReview(this.prisma, this.notifications, `campanha de e-mail "${campaign.name}"`, `Vai para ${audience} contato(s) com permissão. Veja o texto e aprove, peça alteração ou rejeite.`);
    }
    return campaign;
  }

  async updateCampaign(id: string, input: EmailCampaignInput, by: "admin" | "agent"): Promise<EmailCampaign> {
    const current = await this.findCampaign(id);
    if (!OPEN_CAMPAIGN.includes(current.status)) throw new ConflictException("Esta campanha já foi enviada ou rejeitada.");
    if (by === "agent" && current.status !== "changes_requested") throw new ConflictException("O dono não pediu alteração nesta campanha.");
    const campaign = await this.prisma.emailCampaign.update({
      where: { id },
      data: { ...this.campaignData(input), status: "awaiting_approval", contentHash: null, approvedAt: null, approvedById: null, scheduledFor: null },
    });
    if (by === "agent") await notifyReview(this.prisma, this.notifications, `campanha de e-mail "${campaign.name}" (nova versão)`);
    return campaign;
  }

  async decideCampaign(id: string, adminId: string, decision: MarketingDecisionInput): Promise<EmailCampaign> {
    const campaign = await this.findCampaign(id);
    if (!OPEN_CAMPAIGN.includes(campaign.status)) throw new ConflictException("Esta campanha já foi enviada ou rejeitada.");
    switch (decision.action) {
      case "approve":
      case "schedule": {
        if (!this.email.isEnabled()) throw new BadRequestException("O envio de e-mail não está configurado no servidor.");
        const audience = await this.audienceSize(campaign.segment as Segment);
        if (!audience) throw new BadRequestException("Nenhum contato com permissão nesse público ainda.");
        let scheduledFor: Date | null = null;
        if (decision.action === "schedule") {
          scheduledFor = decision.scheduledFor ? new Date(decision.scheduledFor) : null;
          if (!scheduledFor || Number.isNaN(scheduledFor.getTime()) || scheduledFor.getTime() < Date.now() + 5 * 60 * 1000) {
            throw new BadRequestException("Agende para pelo menos 5 minutos a partir de agora.");
          }
        }
        return this.prisma.emailCampaign.update({
          where: { id },
          data: { status: scheduledFor ? "scheduled" : "approved", scheduledFor, contentHash: campaignHash(campaign), approvedById: adminId, approvedAt: new Date() },
        });
      }
      case "changes": {
        if (!decision.note) throw new BadRequestException("Diga o que mudar.");
        const updated = await this.prisma.emailCampaign.update({
          where: { id },
          data: { status: "changes_requested", feedback: decision.note, contentHash: null, approvedAt: null, scheduledFor: null },
        });
        await this.queue.enqueue({
          agent: "marketing",
          createdBy: `admin:${adminId}`,
          objective: `Refazer a campanha de e-mail "${campaign.name}" (campanha_id ${campaign.id}) com revisar_campanha_email. Pedido do dono: ${decision.note}`,
          dedupeKey: `campanha-revisao:${campaign.id}:${campaign.updatedAt.getTime()}`,
        });
        return updated;
      }
      case "reject":
        return this.prisma.emailCampaign.update({ where: { id }, data: { status: "rejected", feedback: decision.note ?? campaign.feedback, contentHash: null } });
      case "pause":
        return this.prisma.emailCampaign.update({ where: { id }, data: { status: "awaiting_approval", contentHash: null, approvedAt: null, scheduledFor: null } });
    }
  }

  async audienceSize(segment: Segment): Promise<number> {
    return this.prisma.marketingContact.count({ where: this.contacts.reachableWhere(segment.interests ?? []) });
  }

  // Campanha aprovada e na hora: vira uma fila de envios (um por contato).
  async prepareDueCampaigns(now = new Date()): Promise<number> {
    const due = await this.prisma.emailCampaign.findMany({
      where: { OR: [{ status: "approved" }, { status: "scheduled", scheduledFor: { lte: now } }] },
      take: 5,
    });
    let prepared = 0;
    for (const campaign of due) {
      const claimed = await this.prisma.emailCampaign.updateMany({ where: { id: campaign.id, status: campaign.status }, data: { status: "sending" } });
      if (!claimed.count) continue;
      if (campaign.contentHash !== campaignHash(campaign)) {
        await this.prisma.emailCampaign.update({ where: { id: campaign.id }, data: { status: "awaiting_approval", contentHash: null } });
        continue;
      }
      const contacts = await this.prisma.marketingContact.findMany({
        where: this.contacts.reachableWhere((campaign.segment as Segment).interests ?? []),
        select: { id: true },
      });
      await this.prisma.emailSend.createMany({
        data: contacts.map((contact) => ({ contactId: contact.id, campaignId: campaign.id, subject: campaign.subject })),
        skipDuplicates: true,
      });
      prepared += 1;
    }
    // Campanha sem nada na fila terminou.
    const sending = await this.prisma.emailCampaign.findMany({ where: { status: "sending" }, select: { id: true } });
    for (const campaign of sending) {
      const queued = await this.prisma.emailSend.count({ where: { campaignId: campaign.id, status: "queued" } });
      if (!queued) await this.prisma.emailCampaign.update({ where: { id: campaign.id }, data: { status: "sent", sentAt: now } });
    }
    return prepared;
  }

  // ---------------- Sequências ----------------

  async proposeSequence(input: { key: string; name: string; interests: string[]; steps: EmailSequenceStep[] }, taskId?: string): Promise<EmailSequence> {
    const data = { name: input.name, interests: input.interests, steps: input.steps as unknown as Prisma.InputJsonValue };
    const sequence = await this.prisma.emailSequence.upsert({
      where: { key: input.key },
      create: { key: input.key, ...data, taskId },
      update: { ...data, status: "awaiting_approval", contentHash: null, taskId },
    });
    await notifyReview(
      this.prisma,
      this.notifications,
      `sequência automática "${sequence.name}"`,
      `${input.steps.length} e-mails para novos contatos. Enquanto não for aprovada, nada é enviado.`,
    );
    return sequence;
  }

  async decideSequence(id: string, adminId: string, decision: MarketingDecisionInput): Promise<EmailSequence> {
    const sequence = await this.prisma.emailSequence.findUnique({ where: { id } });
    if (!sequence) throw new NotFoundException("Sequência não encontrada");
    switch (decision.action) {
      case "approve":
      case "schedule":
        if (!this.email.isEnabled()) throw new BadRequestException("O envio de e-mail não está configurado no servidor.");
        return this.prisma.emailSequence.update({
          where: { id },
          // approvedAt fica o da primeira aprovação: é a partir dele que os contatos novos entram.
          data: { status: "active", contentHash: sequenceHash(sequence), approvedById: adminId, approvedAt: sequence.approvedAt ?? new Date(), feedback: null },
        });
      case "changes": {
        if (!decision.note) throw new BadRequestException("Diga o que mudar.");
        const updated = await this.prisma.emailSequence.update({ where: { id }, data: { status: "changes_requested", feedback: decision.note, contentHash: null } });
        await this.queue.enqueue({
          agent: "marketing",
          createdBy: `admin:${adminId}`,
          objective: `Refazer a sequência de e-mails "${sequence.name}" (chave ${sequence.key}) com propor_sequencia, mantendo a mesma chave. Pedido do dono: ${decision.note}`,
          dedupeKey: `sequencia-revisao:${sequence.id}:${sequence.updatedAt.getTime()}`,
        });
        return updated;
      }
      case "reject":
      case "pause":
        return this.prisma.emailSequence.update({ where: { id }, data: { status: "paused", contentHash: null, feedback: decision.note ?? sequence.feedback } });
    }
  }

  // Contato novo (com permissão) entra na sequência do interesse dele. Cada
  // contato fica em uma sequência só; as com interesse definido têm prioridade.
  async enrollNew(now = new Date()): Promise<number> {
    const sequences = await this.prisma.emailSequence.findMany({ where: { status: "active", approvedAt: { not: null } } });
    sequences.sort((a, b) => (b.interests.length ? 1 : 0) - (a.interests.length ? 1 : 0));
    let enrolled = 0;
    for (const sequence of sequences) {
      const steps = sequence.steps as unknown as EmailSequenceStep[];
      if (!steps.length) continue;
      const contacts = await this.prisma.marketingContact.findMany({
        where: {
          ...this.contacts.reachableWhere(sequence.interests),
          createdAt: { gte: sequence.approvedAt as Date },
          enrollments: { none: {} },
        },
        select: { id: true, createdAt: true },
        take: 200,
      });
      if (!contacts.length) continue;
      const result = await this.prisma.sequenceEnrollment.createMany({
        data: contacts.map((contact) => ({
          sequenceId: sequence.id,
          contactId: contact.id,
          nextAt: new Date(Math.max(now.getTime(), contact.createdAt.getTime() + steps[0].delayDays * DAY_MS)),
        })),
        skipDuplicates: true,
      });
      enrolled += result.count;
    }
    return enrolled;
  }

  // Passo da sequência na hora: confere parada (descadastro, conversão),
  // a condição do passo, e põe o e-mail na fila.
  async advanceSequences(now = new Date()): Promise<number> {
    const due = await this.prisma.sequenceEnrollment.findMany({
      where: { status: "active", nextAt: { lte: now }, sequence: { status: "active" } },
      include: { sequence: true, contact: true },
      orderBy: { nextAt: "asc" },
      take: 50,
    });
    let queued = 0;
    for (const enrollment of due) {
      const { sequence, contact } = enrollment;
      const stop = (reason: string) =>
        this.prisma.sequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: "stopped", stopReason: reason } });
      if (sequence.contentHash !== sequenceHash(sequence)) continue;
      if (!isReachable(contact)) {
        await stop(contact.status === "active" ? "sem permissão" : contact.status === "unsubscribed" ? "descadastrou" : "e-mail com problema");
        continue;
      }
      const stage = await this.contactStage(contact);
      if (stage !== contact.stage) await this.prisma.marketingContact.update({ where: { id: contact.id }, data: { stage } });
      if (stage === "cliente") {
        await stop("converteu");
        continue;
      }
      const steps = sequence.steps as unknown as EmailSequenceStep[];
      const step = steps[enrollment.nextStep];
      if (step && conditionHolds(step, contact)) {
        await this.prisma.emailSend.createMany({
          data: [{ contactId: contact.id, enrollmentId: enrollment.id, stepIndex: enrollment.nextStep, subject: step.subject }],
          skipDuplicates: true,
        });
        queued += 1;
      }
      const next = enrollment.nextStep + 1;
      await this.prisma.sequenceEnrollment.update({
        where: { id: enrollment.id },
        data:
          next >= steps.length
            ? { nextStep: next, status: "completed" }
            : { nextStep: next, nextAt: new Date(now.getTime() + Math.max(0, steps[next].delayDays) * DAY_MS) },
      });
    }
    return queued;
  }

  // novo → cadastrado (criou conta) → cliente (fez o que a jornada pedia).
  async contactStage(contact: MarketingContact): Promise<string> {
    if (!contact.userId) {
      if (contact.email && /comprar/.test(contact.interest)) {
        const financing = await this.prisma.financingLead.count({ where: { email: contact.email } });
        if (financing) return "cliente";
      }
      return contact.stage === "cliente" ? "cliente" : "novo";
    }
    const userId = contact.userId;
    const converted =
      contact.interest === "vender"
        ? await this.prisma.listing.count({ where: { ownerUserId: userId, status: "active" } })
        : contact.interest === "loja"
          ? await this.prisma.partner.count({ where: { ownerUserId: userId } })
          : /comprar/.test(contact.interest)
            ? await this.prisma.lead.count({ where: { buyerId: userId } })
            : 0;
    return converted ? "cliente" : "cadastrado";
  }

  // ---------------- Envio ----------------

  async sentToday(now = new Date()): Promise<number> {
    return this.prisma.emailSend.count({ where: { sentAt: { gte: brtDayStart(now) } } });
  }

  // Manda o que está na fila, dentro do teto diário. Cada envio confere de
  // novo a aprovação e a permissão do contato antes de sair.
  async sendQueued(now = new Date()): Promise<number> {
    if (!this.email.isEnabled()) return 0;
    const remaining = emailDailyLimit() - (await this.sentToday(now));
    if (remaining <= 0) return 0;
    const sends = await this.prisma.emailSend.findMany({
      where: { status: "queued" },
      include: { contact: true, campaign: true },
      orderBy: { createdAt: "asc" },
      take: Math.min(remaining, SENDS_PER_TICK),
    });
    const sequences = new Map<string, EmailSequence | null>();
    let sent = 0;
    for (const send of sends) {
      const fail = (error: string) => this.prisma.emailSend.update({ where: { id: send.id }, data: { status: "failed", error } });
      let content: { subject: string; preheader?: string | null; body: string; ctaLabel?: string | null; ctaUrl?: string | null; campaign: string } | undefined;
      if (send.campaign) {
        if (send.campaign.status !== "sending") continue;
        if (send.campaign.contentHash !== campaignHash(send.campaign)) continue;
        content = { ...send.campaign, campaign: slugify(send.campaign.name) || "campanha" };
      } else if (send.enrollmentId !== null && send.stepIndex !== null) {
        const enrollment = await this.prisma.sequenceEnrollment.findUnique({ where: { id: send.enrollmentId }, select: { sequenceId: true, status: true } });
        if (!enrollment) {
          await fail("Inscrição na sequência não existe mais");
          continue;
        }
        if (!sequences.has(enrollment.sequenceId)) sequences.set(enrollment.sequenceId, await this.prisma.emailSequence.findUnique({ where: { id: enrollment.sequenceId } }));
        const sequence = sequences.get(enrollment.sequenceId);
        if (!sequence || sequence.status !== "active" || sequence.contentHash !== sequenceHash(sequence)) continue;
        const step = (sequence.steps as unknown as EmailSequenceStep[])[send.stepIndex];
        if (!step) {
          await fail("Passo da sequência não existe mais");
          continue;
        }
        content = { ...step, campaign: `sequencia-${sequence.key}` };
      } else {
        await fail("Envio sem campanha nem sequência");
        continue;
      }
      if (!isReachable(send.contact)) {
        await fail("Contato sem permissão ou descadastrado");
        continue;
      }
      const target = marketingTarget(content.ctaUrl, content.campaign);
      const unsubscribe = unsubscribeUrl(send.contact.unsubscribeToken);
      const rendered = renderMarketingEmail({
        subject: content.subject,
        preheader: content.preheader,
        body: content.body,
        name: send.contact.name,
        ctaLabel: content.ctaLabel,
        ctaHref: target ? clickUrl(send.id, target) : undefined,
        unsubscribeUrl: unsubscribe,
        consent: send.contact.consent,
      });
      try {
        const { id } = await this.email.sendMarketing({
          to: send.contact.email as string,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
          replyTo: process.env.EMAIL_REPLY_TO || undefined,
        });
        await this.prisma.$transaction([
          this.prisma.emailSend.update({ where: { id: send.id }, data: { status: "sent", providerId: id, sentAt: new Date(), subject: rendered.subject } }),
          this.prisma.marketingContact.update({ where: { id: send.contact.id }, data: { lastEmailAt: new Date() } }),
        ]);
        sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Envio ${send.id} falhou: ${message}`);
        await fail(message.slice(0, 300));
        // Limite do provedor: para a rodada e tenta na próxima.
        if (/\b429\b/.test(message)) break;
      }
      if (sendGapMs()) await wait(sendGapMs());
    }
    return sent;
  }

  // ---------------- Cliques e webhook ----------------

  async recordClick(sendId: string, target: string): Promise<void> {
    const send = await this.prisma.emailSend.findUnique({ where: { id: sendId }, select: { id: true, firstClickAt: true } });
    if (!send) return;
    await this.prisma.$transaction([
      this.prisma.emailSend.update({ where: { id: sendId }, data: { clicks: { increment: 1 }, firstClickAt: send.firstClickAt ?? new Date() } }),
      this.prisma.emailEvent.create({ data: { sendId, type: "clicked", data: { url: target } } }),
    ]);
  }

  // Eventos do Resend (já com a assinatura conferida pelo controller).
  async handleProviderEvent(event: { type?: string; created_at?: string; data?: { email_id?: string; bounce?: unknown } }): Promise<void> {
    const providerId = event.data?.email_id;
    const type = String(event.type ?? "").replace(/^email\./, "");
    if (!providerId || !type) return;
    const send = await this.prisma.emailSend.findFirst({ where: { providerId }, select: { id: true, contactId: true, status: true } });
    if (!send) return;
    await this.prisma.emailEvent.create({ data: { sendId: send.id, type, data: (event.data ?? {}) as Prisma.InputJsonValue } });
    if (type === "delivered" && send.status === "sent") {
      await this.prisma.emailSend.update({ where: { id: send.id }, data: { status: "delivered", deliveredAt: new Date() } });
    }
    if (type === "failed") await this.prisma.emailSend.update({ where: { id: send.id }, data: { status: "failed", error: "Recusado pelo provedor" } });
    if (type === "bounced" || type === "complained") {
      // E-mail que voltou ou marcou como spam: não recebe mais nada.
      await this.prisma.$transaction([
        this.prisma.emailSend.update({ where: { id: send.id }, data: { status: type } }),
        this.prisma.marketingContact.update({ where: { id: send.contactId }, data: { status: type, ...(type === "complained" ? { unsubscribedAt: new Date() } : {}) } }),
        this.prisma.sequenceEnrollment.updateMany({ where: { contactId: send.contactId, status: "active" }, data: { status: "stopped", stopReason: type === "bounced" ? "e-mail voltou" : "marcou como spam" } }),
      ]);
    }
  }

  // ---------------- Leitura para a tela ----------------

  async campaignViews(take = 20): Promise<EmailCampaignView[]> {
    const campaigns = await this.prisma.emailCampaign.findMany({ orderBy: { createdAt: "desc" }, take });
    return Promise.all(
      campaigns.map(async (campaign) => {
        const grouped = await this.prisma.emailSend.groupBy({ by: ["status"], where: { campaignId: campaign.id }, _count: { _all: true }, _sum: { clicks: true } });
        const count = (status: string) => grouped.find((row) => row.status === status)?._count._all ?? 0;
        const clicked = await this.prisma.emailSend.count({ where: { campaignId: campaign.id, firstClickAt: { not: null } } });
        const unsubscribed = await this.prisma.marketingContact.count({
          where: { status: { in: ["unsubscribed", "complained"] }, sends: { some: { campaignId: campaign.id } }, unsubscribedAt: { gte: campaign.approvedAt ?? campaign.createdAt } },
        });
        const segment = campaign.segment as Segment;
        return {
          id: campaign.id,
          name: campaign.name,
          subject: campaign.subject,
          preheader: campaign.preheader ?? undefined,
          body: campaign.body,
          ctaLabel: campaign.ctaLabel ?? undefined,
          ctaUrl: campaign.ctaUrl ?? undefined,
          segment: { interests: segment.interests ?? [] },
          audienceSize: OPEN_CAMPAIGN.includes(campaign.status) ? await this.audienceSize(segment) : grouped.reduce((sum, row) => sum + row._count._all, 0),
          status: campaign.status,
          feedback: campaign.feedback ?? undefined,
          scheduledFor: campaign.scheduledFor?.toISOString(),
          sentAt: campaign.sentAt?.toISOString(),
          stats: {
            queued: count("queued"),
            sent: count("sent") + count("delivered") + count("bounced") + count("complained"),
            delivered: count("delivered"),
            bounced: count("bounced") + count("complained"),
            failed: count("failed"),
            clicked,
            clicks: grouped.reduce((sum, row) => sum + (row._sum.clicks ?? 0), 0),
            unsubscribed,
          },
          createdAt: campaign.createdAt.toISOString(),
        };
      }),
    );
  }

  async sequenceViews(): Promise<EmailSequenceView[]> {
    const sequences = await this.prisma.emailSequence.findMany({ orderBy: { createdAt: "asc" } });
    return Promise.all(
      sequences.map(async (sequence) => {
        const grouped = await this.prisma.sequenceEnrollment.groupBy({ by: ["status"], where: { sequenceId: sequence.id }, _count: { _all: true } });
        const count = (status: string) => grouped.find((row) => row.status === status)?._count._all ?? 0;
        return {
          id: sequence.id,
          key: sequence.key,
          name: sequence.name,
          interests: sequence.interests,
          steps: sequence.steps as unknown as EmailSequenceStep[],
          status: sequence.status,
          feedback: sequence.feedback ?? undefined,
          enrolled: { active: count("active"), completed: count("completed"), stopped: count("stopped") },
          createdAt: sequence.createdAt.toISOString(),
        };
      }),
    );
  }

  async results30d(now = new Date()) {
    const since = new Date(now.getTime() - 30 * DAY_MS);
    const [emailsSent30d, delivered30d, bounced30d, clicked30d, unsubscribed30d, leads, financing, signups, contactsConverted] = await Promise.all([
      this.prisma.emailSend.count({ where: { sentAt: { gte: since } } }),
      this.prisma.emailSend.count({ where: { sentAt: { gte: since }, status: "delivered" } }),
      this.prisma.emailSend.count({ where: { sentAt: { gte: since }, status: { in: ["bounced", "complained"] } } }),
      this.prisma.emailSend.count({ where: { sentAt: { gte: since }, firstClickAt: { not: null } } }),
      this.prisma.marketingContact.count({ where: { unsubscribedAt: { gte: since } } }),
      this.prisma.lead.count({ where: { createdAt: { gte: since }, acqSource: "email" } }),
      this.prisma.financingLead.count({ where: { createdAt: { gte: since }, acqSource: "email" } }),
      this.prisma.user.count({ where: { createdAt: { gte: since }, acqSource: "email" } }),
      this.prisma.marketingContact.count({ where: { stage: "cliente" } }),
    ]);
    return { emailsSent30d, delivered30d, bounced30d, clicked30d, unsubscribed30d, leadsFromEmail30d: leads + financing, signupsFromEmail30d: signups, contactsConverted };
  }

  private async findCampaign(id: string): Promise<EmailCampaign> {
    const campaign = await this.prisma.emailCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException("Campanha não encontrada");
    return campaign;
  }

  private campaignData(input: EmailCampaignInput) {
    const ctaUrl = input.ctaUrl ? marketingTarget(input.ctaUrl, "x") : undefined;
    if (input.ctaUrl && !ctaUrl) throw new BadRequestException("O link do botão precisa ser uma página do novoseminovo.com.br.");
    return {
      name: input.name,
      subject: input.subject,
      preheader: input.preheader || null,
      body: input.body,
      ctaLabel: input.ctaLabel || null,
      ctaUrl: input.ctaUrl || null,
      segment: { interests: input.interests } as Prisma.InputJsonValue,
    };
  }
}

function isReachable(contact: MarketingContact): boolean {
  return contact.status === REACHABLE.status && Boolean(contact.email) && ["opt_in", "legitimate_interest"].includes(contact.consent);
}

function conditionHolds(step: EmailSequenceStep, contact: MarketingContact): boolean {
  if (step.condition === "sem_conta") return !contact.userId;
  if (step.condition === "com_conta") return Boolean(contact.userId);
  return true;
}

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { MarketingContact } from "@novoseminovo/db";
import type { MarketingContactView, MarketingSummary } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { TaskQueueService } from "../operations/task-queue.service";
import { trackRoutine } from "../operations/routine-health";
import { REACHABLE } from "./contacts.service";
import { EmailMarketingService, emailDailyLimit } from "./email-marketing.service";
import { instagramEnabled } from "./instagram";
import { MarketingArtService } from "./art.service";
import { MarketingPostsService, toPostView } from "./posts.service";

const TICK_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function toContactView(contact: MarketingContact): MarketingContactView {
  return {
    id: contact.id,
    email: contact.email ?? undefined,
    name: contact.name ?? undefined,
    interest: contact.interest,
    source: contact.source,
    consent: contact.consent,
    status: contact.status,
    stage: contact.stage,
    createdAt: contact.createdAt.toISOString(),
  };
}

// Trabalhador do marketing (a cada minuto): publica posts aprovados, busca
// métricas, prepara campanhas, avança sequências e envia a fila de e-mails.
// OPERATIONS_DISABLED=1 desliga, junto com o resto da operação.
@Injectable()
export class MarketingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketingService.name);
  private timer?: NodeJS.Timeout;
  private ticking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: MarketingPostsService,
    private readonly emails: EmailMarketingService,
    private readonly art: MarketingArtService,
    private readonly queue: TaskQueueService,
  ) {}

  onModuleInit(): void {
    if (process.env.OPERATIONS_DISABLED === "1") return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now = new Date()): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await trackRoutine("marketing", TICK_MS, async () => {
        const errors: string[] = [];
        const step = async (name: string, run: () => Promise<unknown>) => {
          await run().catch((error) => {
            this.logger.warn(`Marketing/${name} falhou: ${error}`);
            errors.push(`${name}: ${error instanceof Error ? error.message : error}`);
          });
        };
        await step("publicar", () => this.posts.publishDue(now));
        await step("metricas", () => this.posts.refreshMetrics(now));
        await step("campanhas", () => this.emails.prepareDueCampaigns(now));
        await step("inscrever", () => this.emails.enrollNew(now));
        await step("sequencias", () => this.emails.advanceSequences(now));
        await step("enviar", () => this.emails.sendQueued(now));
        if (errors.length) throw new Error(errors.join(" | "));
      });
    } finally {
      this.ticking = false;
    }
  }

  // Sugestão vira post: o agente de Marketing monta arte e legenda a partir dela.
  async suggestionToPost(suggestionId: string, adminId: string): Promise<{ taskId: string }> {
    const suggestion = await this.prisma.marketingSuggestion.findUniqueOrThrow({ where: { id: suggestionId } });
    const { task } = await this.queue.enqueue({
      agent: "marketing",
      createdBy: `admin:${adminId}`,
      objective: `Transformar a sugestão "${suggestion.title}" (sugestao_id ${suggestion.id}, canal ${suggestion.channel}) em um post do Instagram com criar_post_instagram. Texto da sugestão: ${suggestion.body.slice(0, 1500)}`,
      dedupeKey: `sugestao-post:${suggestion.id}`,
    });
    return { taskId: task.id };
  }

  async summary(now = new Date()): Promise<MarketingSummary> {
    const since = new Date(now.getTime() - 30 * DAY_MS);
    const [posts, campaigns, sequences, total, reachable, new30d, unsubscribed, bySource, byInterest, latest, emailSentToday, postResults, emailResults] = await Promise.all([
      this.posts.list(30),
      this.emails.campaignViews(20),
      this.emails.sequenceViews(),
      this.prisma.marketingContact.count(),
      this.prisma.marketingContact.count({ where: REACHABLE }),
      this.prisma.marketingContact.count({ where: { createdAt: { gte: since } } }),
      this.prisma.marketingContact.count({ where: { status: { not: "active" } } }),
      this.prisma.marketingContact.groupBy({ by: ["source"], _count: { _all: true } }),
      this.prisma.marketingContact.groupBy({ by: ["interest"], _count: { _all: true } }),
      this.prisma.marketingContact.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
      this.emails.sentToday(now),
      this.posts.results30d(now),
      this.emails.results30d(now),
    ]);
    return {
      generatedAt: now.toISOString(),
      integrations: {
        instagram: instagramEnabled(),
        email: this.emails.enabled(),
        emailWebhook: Boolean(process.env.RESEND_WEBHOOK_SECRET),
        images: this.art.imagesEnabled(),
      },
      emailDailyLimit: emailDailyLimit(),
      emailSentToday,
      posts: posts.map(toPostView),
      campaigns,
      sequences,
      contacts: {
        total,
        reachable,
        new30d,
        unsubscribed,
        bySource: bySource.map((row) => ({ source: row.source, count: row._count._all })).sort((a, b) => b.count - a.count),
        byInterest: byInterest.map((row) => ({ interest: row.interest, count: row._count._all })).sort((a, b) => b.count - a.count),
        latest: latest.map(toContactView),
      },
      results: { ...postResults, ...emailResults },
    };
  }

  // Versão enxuta para o agente (sem e-mails nem nomes de contatos).
  async agentReport() {
    const summary = await this.summary();
    const pending = (status: string) => (item: { status: string }) => item.status === status;
    return {
      integracoes: {
        instagramPublicacao: summary.integrations.instagram ? "ligada" : "não configurada (posts aprovados ficam esperando)",
        email: summary.integrations.email ? "ligado" : "não configurado",
        imagensIa: summary.integrations.images ? "ligada" : "não configurada (use fundo anuncio ou marca)",
      },
      resultados30d: summary.results,
      emailHoje: { enviados: summary.emailSentToday, limiteDiario: summary.emailDailyLimit },
      contatos: {
        total: summary.contacts.total,
        comPermissao: summary.contacts.reachable,
        novos30d: summary.contacts.new30d,
        porOrigem: summary.contacts.bySource,
        porInteresse: summary.contacts.byInterest,
      },
      posts: summary.posts.slice(0, 15).map((post) => ({
        id: post.id,
        titulo: post.title,
        status: post.status,
        pedidoDeAlteracao: post.status === "changes_requested" ? post.feedback : undefined,
        // Versão atual completa só quando o agente precisa refazer.
        versaoAtual:
          post.status === "changes_requested"
            ? { legenda: post.caption, hashtags: post.hashtags, texto_complementar: post.extraText, fundo: post.artSource, titulo_arte: post.artHeadline, subtitulo_arte: post.artSubline }
            : undefined,
        publicadoEm: post.publishedAt,
        metricas: post.metrics,
      })),
      campanhas: summary.campaigns.slice(0, 10).map((campaign) => ({
        id: campaign.id,
        nome: campaign.name,
        status: campaign.status,
        pedidoDeAlteracao: campaign.status === "changes_requested" ? campaign.feedback : undefined,
        versaoAtual:
          campaign.status === "changes_requested"
            ? { assunto: campaign.subject, preheader: campaign.preheader, texto: campaign.body, botao_texto: campaign.ctaLabel, botao_link: campaign.ctaUrl, interesses: campaign.segment.interests }
            : undefined,
        publico: campaign.audienceSize,
        resultados: campaign.stats,
      })),
      sequencias: summary.sequences.map((sequence) => ({
        chave: sequence.key,
        nome: sequence.name,
        status: sequence.status,
        pedidoDeAlteracao: sequence.status === "changes_requested" ? sequence.feedback : undefined,
        interesses: sequence.interests,
        passos: sequence.status === "changes_requested" ? sequence.steps : sequence.steps.length,
        inscritos: sequence.enrolled,
      })),
      esperandoAprovacao: {
        posts: summary.posts.filter(pending("awaiting_approval")).length,
        campanhas: summary.campaigns.filter(pending("awaiting_approval")).length,
        sequencias: summary.sequences.filter(pending("awaiting_approval")).length,
      },
    };
  }
}

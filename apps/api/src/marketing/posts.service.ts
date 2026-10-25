import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { MarketingPost } from "@novoseminovo/db";
import type { MarketingDecisionInput, MarketingPostInput, MarketingPostView } from "@novoseminovo/shared-types";
import { getPhotoStorage } from "../common/storage";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { TaskQueueService } from "../operations/task-queue.service";
import { MarketingArtService } from "./art.service";
import { INSIGHT_METRICS, instagramEnabled, mediaInsights, publishImage } from "./instagram";
import { absoluteMediaUrl, contentHash, notifyReview } from "./links";

const DAY_MS = 24 * 60 * 60 * 1000;
// Pode editar/decidir enquanto não foi para o Instagram.
const OPEN_STATUSES = ["awaiting_approval", "changes_requested", "approved", "scheduled", "failed"];
const METRICS_EVERY_MS = 6 * 60 * 60 * 1000;
const METRICS_WINDOW_DAYS = 30;

export function normalizeHashtags(tags: string[]): string[] {
  const seen = new Set<string>();
  for (const raw of tags) {
    const tag = raw.trim().replace(/^#+/, "").replace(/\s+/g, "");
    if (tag) seen.add(`#${tag}`);
  }
  return [...seen].slice(0, 15);
}

// O que vai para o Instagram: legenda + hashtags no fim.
export function fullCaption(post: Pick<MarketingPost, "caption" | "hashtags">): string {
  return [post.caption.trim(), post.hashtags.join(" ")].filter(Boolean).join("\n\n").slice(0, 2200);
}

function postHash(post: Pick<MarketingPost, "caption" | "hashtags" | "imageUrl">): string {
  return contentHash({ caption: post.caption, hashtags: post.hashtags, imageUrl: post.imageUrl });
}

export function toPostView(post: MarketingPost): MarketingPostView {
  return {
    id: post.id,
    title: post.title,
    caption: post.caption,
    hashtags: post.hashtags,
    extraText: post.extraText ?? undefined,
    artSource: post.artSource,
    artHeadline: post.artHeadline,
    artSubline: post.artSubline ?? undefined,
    imageUrl: post.imageUrl ? absoluteMediaUrl(post.imageUrl) : undefined,
    status: post.status,
    feedback: post.feedback ?? undefined,
    revision: post.revision,
    scheduledFor: post.scheduledFor?.toISOString(),
    publishedAt: post.publishedAt?.toISOString(),
    igPermalink: post.igPermalink ?? undefined,
    error: post.error ?? undefined,
    metrics: (post.metrics as Record<string, number> | null) ?? undefined,
    metricsAt: post.metricsAt?.toISOString(),
    createdAt: post.createdAt.toISOString(),
  };
}

export type PostDraft = MarketingPostInput & { suggestionId?: string; taskId?: string };

// Posts do Instagram: o agente (ou o admin) cria o rascunho com a arte, o
// admin vê a prévia e decide. Só o que foi aprovado é publicado, e só se o
// conteúdo ainda for exatamente o aprovado (contentHash).
@Injectable()
export class MarketingPostsService {
  private readonly logger = new Logger(MarketingPostsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly art: MarketingArtService,
    private readonly notifications: NotificationsService,
    private readonly queue: TaskQueueService,
  ) {}

  async create(draft: PostDraft, by: string): Promise<{ post: MarketingPost; fallback?: string }> {
    const { imageUrl, fallback } = await this.renderArt(draft);
    const post = await this.prisma.marketingPost.create({
      data: {
        title: draft.title,
        caption: draft.caption,
        hashtags: normalizeHashtags(draft.hashtags),
        extraText: draft.extraText || null,
        artSource: draft.artSource,
        artPrompt: draft.artPrompt || null,
        artHeadline: draft.artHeadline,
        artSubline: draft.artSubline || null,
        listingId: draft.listingId || null,
        imageUrl,
        suggestionId: draft.suggestionId,
        taskId: draft.taskId,
        error: fallback ? `Fundo pedido não deu certo (${fallback}); usei o fundo da marca.` : null,
      },
    });
    if (draft.suggestionId) {
      await this.prisma.marketingSuggestion.updateMany({ where: { id: draft.suggestionId, status: "nova" }, data: { status: "usada" } }).catch(() => undefined);
    }
    if (by !== "admin") await notifyReview(this.prisma, this.notifications, `post "${post.title}"`, "Veja a arte e a legenda e aprove, peça alteração ou rejeite.");
    return { post, fallback };
  }

  // Nova versão (pedido de alteração atendido pelo agente, ou edição do admin):
  // volta para "esperando aprovação" e a aprovação anterior deixa de valer.
  async update(id: string, draft: MarketingPostInput, by: "admin" | "agent"): Promise<{ post: MarketingPost; fallback?: string }> {
    const current = await this.find(id);
    if (!OPEN_STATUSES.includes(current.status)) throw new ConflictException("Este post já foi publicado ou rejeitado.");
    if (by === "agent" && current.status !== "changes_requested") throw new ConflictException("O dono não pediu alteração neste post.");
    const artChanged =
      draft.artSource !== current.artSource ||
      draft.artHeadline !== current.artHeadline ||
      (draft.artSubline || null) !== current.artSubline ||
      (draft.listingId || null) !== current.listingId ||
      (draft.artPrompt || null) !== current.artPrompt;
    const rendered = artChanged || !current.imageUrl ? await this.renderArt(draft) : { imageUrl: current.imageUrl, fallback: undefined };
    const post = await this.prisma.marketingPost.update({
      where: { id },
      data: {
        title: draft.title,
        caption: draft.caption,
        hashtags: normalizeHashtags(draft.hashtags),
        extraText: draft.extraText || null,
        artSource: draft.artSource,
        artPrompt: draft.artPrompt || null,
        artHeadline: draft.artHeadline,
        artSubline: draft.artSubline || null,
        listingId: draft.listingId || null,
        imageUrl: rendered.imageUrl,
        status: "awaiting_approval",
        revision: { increment: 1 },
        contentHash: null,
        approvedAt: null,
        approvedById: null,
        scheduledFor: null,
        error: rendered.fallback ? `Fundo pedido não deu certo (${rendered.fallback}); usei o fundo da marca.` : null,
      },
    });
    if (by === "agent") await notifyReview(this.prisma, this.notifications, `post "${post.title}" (versão ${post.revision})`);
    return { post, fallback: rendered.fallback };
  }

  async decide(id: string, adminId: string, decision: MarketingDecisionInput): Promise<MarketingPost> {
    const post = await this.find(id);
    if (!OPEN_STATUSES.includes(post.status)) throw new ConflictException("Este post já foi publicado ou rejeitado.");
    switch (decision.action) {
      case "approve":
      case "schedule": {
        if (!post.imageUrl) throw new BadRequestException("O post ainda não tem arte.");
        const scheduledFor = decision.action === "schedule" ? this.scheduleDate(decision.scheduledFor) : null;
        return this.prisma.marketingPost.update({
          where: { id },
          data: {
            status: scheduledFor ? "scheduled" : "approved",
            scheduledFor,
            contentHash: postHash(post),
            approvedById: adminId,
            approvedAt: new Date(),
            error: null,
          },
        });
      }
      case "changes": {
        if (!decision.note) throw new BadRequestException("Diga o que mudar.");
        const updated = await this.prisma.marketingPost.update({
          where: { id },
          data: { status: "changes_requested", feedback: decision.note, contentHash: null, approvedAt: null, scheduledFor: null },
        });
        await this.queue.enqueue({
          agent: "marketing",
          createdBy: `admin:${adminId}`,
          objective: `Refazer o post do Instagram "${post.title}" (post_id ${post.id}) com revisar_post_instagram. Pedido do dono: ${decision.note}`,
          dedupeKey: `post-revisao:${post.id}:${post.revision}`,
        });
        return updated;
      }
      case "reject":
        return this.prisma.marketingPost.update({ where: { id }, data: { status: "rejected", feedback: decision.note ?? post.feedback, contentHash: null } });
      case "pause":
        // Cancela a aprovação/agendamento: volta para a fila de aprovação.
        return this.prisma.marketingPost.update({ where: { id }, data: { status: "awaiting_approval", contentHash: null, approvedAt: null, scheduledFor: null } });
    }
  }

  // Rodada do trabalhador: publica o que está aprovado e na hora.
  async publishDue(now = new Date()): Promise<number> {
    if (!instagramEnabled()) return 0;
    const due = await this.prisma.marketingPost.findMany({
      where: { OR: [{ status: "approved" }, { status: "scheduled", scheduledFor: { lte: now } }] },
      orderBy: { approvedAt: "asc" },
      take: 3,
    });
    let published = 0;
    for (const post of due) {
      const claimed = await this.prisma.marketingPost.updateMany({ where: { id: post.id, status: post.status }, data: { status: "publishing" } });
      if (!claimed.count) continue;
      if (!post.contentHash || post.contentHash !== postHash(post) || !post.imageUrl) {
        await this.prisma.marketingPost.update({
          where: { id: post.id },
          data: { status: "awaiting_approval", contentHash: null, error: "O conteúdo mudou depois da aprovação; aprove de novo." },
        });
        continue;
      }
      try {
        const result = await publishImage(absoluteMediaUrl(post.imageUrl), fullCaption(post));
        await this.prisma.marketingPost.update({
          where: { id: post.id },
          data: { status: "published", publishedAt: new Date(), igMediaId: result.mediaId, igPermalink: result.permalink, error: null },
        });
        published += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Publicação do post ${post.id} falhou: ${message}`);
        await this.prisma.marketingPost.update({ where: { id: post.id }, data: { status: "failed", error: message.slice(0, 500) } });
      }
    }
    return published;
  }

  // Métricas dos posts publicados nos últimos 30 dias, no máximo a cada 6 h.
  async refreshMetrics(now = new Date(), force = false): Promise<number> {
    if (!instagramEnabled()) return 0;
    const posts = await this.prisma.marketingPost.findMany({
      where: {
        status: "published",
        igMediaId: { not: null },
        publishedAt: { gte: new Date(now.getTime() - METRICS_WINDOW_DAYS * DAY_MS) },
        ...(force ? {} : { OR: [{ metricsAt: null }, { metricsAt: { lt: new Date(now.getTime() - METRICS_EVERY_MS) } }] }),
      },
      take: 20,
    });
    let updated = 0;
    for (const post of posts) {
      try {
        const metrics = await mediaInsights(post.igMediaId as string);
        await this.prisma.marketingPost.update({ where: { id: post.id }, data: { metrics, metricsAt: now } });
        updated += 1;
      } catch (error) {
        this.logger.warn(`Métricas do post ${post.id} falharam: ${error}`);
        await this.prisma.marketingPost.update({ where: { id: post.id }, data: { metricsAt: now } });
      }
    }
    return updated;
  }

  async list(take = 30): Promise<MarketingPost[]> {
    return this.prisma.marketingPost.findMany({ orderBy: { createdAt: "desc" }, take });
  }

  async results30d(now = new Date()) {
    const posts = await this.prisma.marketingPost.findMany({
      where: { status: "published", publishedAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } },
      select: { metrics: true },
    });
    const sum = (name: (typeof INSIGHT_METRICS)[number]) =>
      posts.reduce((total, post) => total + Number((post.metrics as Record<string, number> | null)?.[name] ?? 0), 0);
    return { postsPublished30d: posts.length, reach: sum("reach"), likes: sum("likes"), comments: sum("comments"), saves: sum("saved") };
  }

  async find(id: string): Promise<MarketingPost> {
    const post = await this.prisma.marketingPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException("Post não encontrado");
    return post;
  }

  private scheduleDate(raw: string | undefined): Date {
    const date = raw ? new Date(raw) : undefined;
    if (!date || Number.isNaN(date.getTime())) throw new BadRequestException("Escolha data e hora para agendar.");
    if (date.getTime() < Date.now() + 5 * 60 * 1000) throw new BadRequestException("Agende para pelo menos 5 minutos a partir de agora.");
    if (date.getTime() > Date.now() + 60 * DAY_MS) throw new BadRequestException("Agende para no máximo 60 dias.");
    return date;
  }

  private async renderArt(draft: MarketingPostInput): Promise<{ imageUrl: string; fallback?: string }> {
    const { image, fallback } = await this.art.render({
      source: draft.artSource,
      headline: draft.artHeadline,
      subline: draft.artSubline,
      listingId: draft.listingId,
      prompt: draft.artPrompt,
    });
    const imageUrl = await getPhotoStorage().save(image, "post-instagram.jpg", "image/jpeg");
    return { imageUrl, fallback };
  }
}

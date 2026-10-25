import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { z } from "zod";
import type { Prisma } from "@novoseminovo/db";
import { OPS_AGENT_LABELS, OPS_GOAL_METRICS, PARTNER_TRIAL_DAYS, PLAN_REQUIRED_PARTNER_TYPES } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { AdminOverviewService } from "../admin/overview.service";
import { SUBSCRIPTION_STATUSES_IN_EFFECT } from "../partners/partners.service";
import { GoalsService } from "./goals.service";
import { TaskQueueService } from "./task-queue.service";
import { windsorEnabled, windsorRows } from "./windsor";
import { AGENT_TOOL_ALLOWLIST, APPROVAL_TTL_MS, actionHash, decide, type OpsTool, type OpsToolContext } from "./policy";

export type ToolOutcome =
  | { status: "done"; output: unknown }
  | { status: "awaiting_approval"; approvalId: string }
  | { status: "blocked"; reason: string }
  | { status: "invalid"; reason: string };

const DAY_MS = 24 * 60 * 60 * 1000;
// Tarefas que um agente pode criar: por tarefa de origem e por dia. Segura um
// laço de "tarefa que cria tarefa" antes de virar custo.
const MAX_CHILD_TASKS = 5;
const MAX_TASKS_PER_AGENT_PER_DAY = 30;
// Avisos dos agentes a donos de anúncio e parceiros: no máximo 1 por anúncio
// (ou por loja e assunto) a cada 7 dias, e um teto diário no site todo.
const TIP_COOLDOWN_DAYS = 7;
const MAX_SUGGESTIONS_PER_TASK = 6;

function maxMessagesPerDay(): number {
  const value = Number(process.env.OPS_MAX_MESSAGES_PER_DAY);
  return Number.isFinite(value) && value >= 0 ? value : 30;
}

const SEGMENTS = ["all", "vehicle", "property"] as const;
const segment = z.enum(SEGMENTS).optional();
const segmentSchema = { type: "string", enum: SEGMENTS, description: "all = site todo, vehicle = carros, property = imóveis" };
const LISTING_PROBLEMS = ["sem_fotos", "poucas_fotos", "descricao_curta", "preco_fora_fipe", "parado", "duplicado"] as const;
const PARTNER_SUBJECTS = {
  leads_parados: { title: "Tem cliente esperando a sua resposta", link: "/parceiro/leads" },
  teste_sem_anuncio: { title: "Seu período grátis já começou — publique o primeiro anúncio", link: "/anunciar" },
} as const;
const MARKETING_CHANNELS = ["instagram", "facebook", "tiktok", "whatsapp", "google", "youtube", "email", "blog"] as const;

function normalizeTitle(title: string): string {
  return title.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Link de sugestão de marketing sempre aponta pro site e sai rastreado (utm),
// pra origem aparecer no painel geral.
export function trackedLink(raw: string | undefined, channel: string): string | undefined {
  if (!raw) return undefined;
  let url: URL;
  try {
    url = new URL(raw, "https://novoseminovo.com.br");
  } catch {
    return undefined;
  }
  if (!/(^|\.)novoseminovo\.com\.br$/.test(url.hostname)) return undefined;
  url.protocol = "https:";
  if (!url.searchParams.get("utm_source")) url.searchParams.set("utm_source", channel);
  if (!url.searchParams.get("utm_campaign")) url.searchParams.set("utm_campaign", "sugestao-ia");
  return url.toString();
}

// Ferramentas de negócio dos agentes. Toda ação passa por request(): a regra
// de cor (policy.decide) roda antes de qualquer efeito, e ação amarela só
// executa depois que um admin aprova a ação exata (approve()).
@Injectable()
export class OpsToolsService {
  private readonly tools = new Map<string, OpsTool<any>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly overview: AdminOverviewService,
    private readonly queue: TaskQueueService,
    private readonly goals: GoalsService,
  ) {
    this.registerReadTools();
    this.registerActionTools();
  }

  // ---------------- Leitura (verdes) ----------------

  private registerReadTools(): void {
    this.register({
      name: "ler_painel",
      color: "green",
      description: "Lê os grandes números do painel geral dos últimos 30 dias: receita nas 3 linhas, anúncios, leads, cadastros e de onde vêm (origens).",
      input: z.object({ segmento: segment }),
      schema: { type: "object", properties: { segmento: segmentSchema } },
      run: async ({ segmento }) => {
        const data = await this.overview.overview(segmento ?? "all");
        return {
          anuncios: data.listings,
          receita: { ...data.revenue, storeEntries: undefined },
          negociacao: data.engagement,
          usuarios: data.users,
          parceiros: data.partners,
          ia: data.ai,
          origens: data.origins,
          campanhas: data.campaigns,
        };
      },
    });

    this.register({
      name: "ler_metas",
      color: "green",
      description: "Lê as metas do mês atual, com o valor atual de cada uma (calculado pelo sistema).",
      input: z.object({}),
      schema: { type: "object", properties: {} },
      run: async () => {
        const goals = await this.goals.current();
        const now = new Date();
        const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
        return {
          diaDoMes: now.getUTCDate(),
          diasNoMes: daysInMonth,
          metas: goals.map((goal) => ({
            indicador: OPS_GOAL_METRICS[goal.metric] ?? goal.metric,
            recorte: goal.segment,
            meta: goal.target,
            atual: goal.current,
            percentual: goal.current !== undefined && goal.target > 0 ? Math.round((goal.current / goal.target) * 100) : undefined,
            responsavel: goal.agent,
          })),
        };
      },
    });

    this.register({
      name: "ler_trafego_site",
      color: "green",
      description: "Visitas ao site por origem (Google Analytics 4): sessões e usuários por fonte/meio.",
      input: z.object({ periodo: z.enum(["last_7d", "last_30d"]).optional() }),
      schema: { type: "object", properties: { periodo: { type: "string", enum: ["last_7d", "last_30d"] } } },
      run: async ({ periodo }) => {
        if (!windsorEnabled()) return { disponivel: false, motivo: "Integração com o Google Analytics (Windsor.ai) ainda não configurada no servidor." };
        const rows = await windsorRows("googleanalytics4", ["source", "medium", "sessions", "totalusers"], periodo ?? "last_7d");
        const sorted = rows
          .map((row) => ({ fonte: String(row.source ?? ""), meio: String(row.medium ?? ""), sessoes: Number(row.sessions ?? 0), usuarios: Number(row.totalusers ?? 0) }))
          .sort((a, b) => b.sessoes - a.sessoes);
        return { periodo: periodo ?? "last_7d", totalSessoes: sorted.reduce((sum, row) => sum + row.sessoes, 0), porOrigem: sorted.slice(0, 15) };
      },
    });

    this.register({
      name: "ler_instagram",
      color: "green",
      description: "Posts do Instagram @novoseminovooficial nos últimos 30 dias, com alcance, curtidas e comentários.",
      input: z.object({}),
      schema: { type: "object", properties: {} },
      run: async () => {
        if (!windsorEnabled()) return { disponivel: false, motivo: "Integração com o Instagram (Windsor.ai) ainda não configurada no servidor." };
        const rows = await windsorRows(
          "instagram",
          ["date", "media_type", "media_caption", "media_like_count", "media_comments_count", "media_reach", "media_permalink"],
          "last_30d",
        );
        return {
          posts: rows.slice(0, 20).map((row) => ({
            data: row.date,
            tipo: row.media_type,
            legenda: String(row.media_caption ?? "").slice(0, 200),
            curtidas: Number(row.media_like_count ?? 0),
            comentarios: Number(row.media_comments_count ?? 0),
            alcance: Number(row.media_reach ?? 0),
            link: row.media_permalink,
          })),
        };
      },
    });

    this.register({
      name: "listar_anuncios_com_problema",
      color: "green",
      description:
        "Anúncios ativos com problema que atrapalha a venda: sem fotos, menos de 5 fotos, descrição curta, preço muito fora da FIPE, parado há 60+ dias ou duplicado. Não traz anúncios que já receberam aviso nos últimos 7 dias.",
      input: z.object({ segmento: segment, limite: z.number().int().min(1).max(30).optional() }),
      schema: { type: "object", properties: { segmento: segmentSchema, limite: { type: "integer", minimum: 1, maximum: 30 } } },
      run: async ({ segmento, limite }) => this.listingProblems(segmento ?? "all", limite ?? 20),
    });

    this.register({
      name: "listar_leads_parados",
      color: "green",
      description: "Lojas e imobiliárias com leads sem andamento no kanban (novo ou contatado) há mais de N dias. Só contagens, sem dados dos clientes.",
      input: z.object({ dias: z.number().int().min(1).max(30).optional() }),
      schema: { type: "object", properties: { dias: { type: "integer", minimum: 1, maximum: 30 } } },
      run: async ({ dias }) => this.staleLeads(dias ?? 3),
    });

    this.register({
      name: "listar_lojas_em_teste_sem_anuncio",
      color: "green",
      description: "Lojas, imobiliárias, corretores e construtoras no período grátis que ainda não publicaram nenhum anúncio.",
      input: z.object({}),
      schema: { type: "object", properties: {} },
      run: async () => this.trialWithoutListings(),
    });
  }

  // ---------------- Ações ----------------

  private registerActionTools(): void {
    this.register({
      name: "criar_tarefa",
      color: "green",
      description: "Cria uma tarefa para outro agente da operação (diretor, operacoes, comercial ou marketing).",
      input: z.object({
        agente: z.enum(Object.keys(AGENT_TOOL_ALLOWLIST) as [string, ...string[]]),
        objetivo: z.string().trim().min(5).max(500),
        segmento: segment,
      }),
      schema: {
        type: "object",
        properties: { agente: { type: "string", enum: Object.keys(AGENT_TOOL_ALLOWLIST) }, objetivo: { type: "string" }, segmento: segmentSchema },
        required: ["agente", "objetivo"],
      },
      run: async ({ agente, objetivo, segmento }, context) => {
        if (agente === context.agent) throw new Error("Um agente não cria tarefa para si mesmo");
        if (context.taskId) {
          const children = await this.prisma.agentTask.count({ where: { parentId: context.taskId } });
          if (children >= MAX_CHILD_TASKS) throw new Error(`Limite de ${MAX_CHILD_TASKS} tarefas por tarefa de origem`);
        }
        const today = await this.prisma.agentTask.count({ where: { createdBy: context.agent, createdAt: { gte: new Date(Date.now() - DAY_MS) } } });
        if (today >= MAX_TASKS_PER_AGENT_PER_DAY) throw new Error(`Limite de ${MAX_TASKS_PER_AGENT_PER_DAY} tarefas por dia para ${context.agent}`);
        const { task } = await this.queue.enqueue({ agent: agente, createdBy: context.agent, objective: objetivo, segment: segmento ?? "all", parentId: context.taskId });
        return { tarefaId: task.id };
      },
    });

    this.register({
      name: "avisar_dono_anuncio",
      color: "green",
      description:
        "Manda ao dono do anúncio uma dica curta e educada para melhorar o anúncio (notificação no site e e-mail). No máximo 1 aviso por anúncio a cada 7 dias.",
      input: z.object({ anuncio_id: z.string().min(5).max(40), problema: z.enum(LISTING_PROBLEMS), mensagem: z.string().trim().min(20).max(400) }),
      schema: {
        type: "object",
        properties: {
          anuncio_id: { type: "string" },
          problema: { type: "string", enum: LISTING_PROBLEMS },
          mensagem: { type: "string", description: "Até 400 caracteres, tom de ajuda, sem prometer nada que o site não oferece." },
        },
        required: ["anuncio_id", "problema", "mensagem"],
      },
      run: async ({ anuncio_id, problema, mensagem }) => {
        const listing = await this.prisma.listing.findUnique({ where: { id: anuncio_id } });
        if (!listing || listing.status !== "active") throw new Error("Anúncio não encontrado ou fora do ar");
        await this.checkDailyMessageCap();
        const recent = await this.prisma.notification.count({
          where: { type: "listing_tip", createdAt: { gte: new Date(Date.now() - TIP_COOLDOWN_DAYS * DAY_MS) }, payload: { path: ["listingId"], equals: anuncio_id } },
        });
        if (recent) throw new Error("Este anúncio já recebeu um aviso nos últimos 7 dias");
        await this.notifications.notify(listing.ownerUserId, "listing_tip", { listingId: listing.id, listingTitle: listing.title, problem: problema, message: mensagem });
        return { avisado: anuncio_id };
      },
    });

    this.register({
      name: "lembrar_parceiro",
      color: "green",
      description:
        "Manda à loja/imobiliária um lembrete curto (notificação e e-mail): leads esperando resposta ou período grátis sem anúncio. No máximo 1 por loja e assunto a cada 7 dias.",
      input: z.object({ parceiro_id: z.string().min(5).max(40), assunto: z.enum(["leads_parados", "teste_sem_anuncio"]), mensagem: z.string().trim().min(20).max(400) }),
      schema: {
        type: "object",
        properties: {
          parceiro_id: { type: "string" },
          assunto: { type: "string", enum: ["leads_parados", "teste_sem_anuncio"] },
          mensagem: { type: "string", description: "Até 400 caracteres, tom de ajuda e direto ao ponto." },
        },
        required: ["parceiro_id", "assunto", "mensagem"],
      },
      run: async ({ parceiro_id, assunto, mensagem }) => {
        const partner = await this.prisma.partner.findUnique({ where: { id: parceiro_id } });
        if (!partner) throw new Error("Parceiro não encontrado");
        await this.checkDailyMessageCap();
        const recent = await this.prisma.notification.count({
          where: {
            type: "partner_tip",
            createdAt: { gte: new Date(Date.now() - TIP_COOLDOWN_DAYS * DAY_MS) },
            AND: [{ payload: { path: ["partnerId"], equals: parceiro_id } }, { payload: { path: ["subject"], equals: assunto } }],
          },
        });
        if (recent) throw new Error("Esta loja já recebeu este lembrete nos últimos 7 dias");
        const subject = PARTNER_SUBJECTS[assunto];
        await this.notifications.notify(partner.ownerUserId, "partner_tip", { partnerId: partner.id, subject: assunto, title: subject.title, message: mensagem, link: subject.link });
        return { lembrado: parceiro_id };
      },
    });

    this.register({
      name: "suspender_anuncio",
      color: "yellow",
      description: "Pede para suspender (pausar) um anúncio com sinal claro de golpe ou irregularidade. Só executa depois que o admin aprovar.",
      input: z.object({ anuncio_id: z.string().min(5).max(40), motivo: z.string().trim().min(10).max(300) }),
      schema: {
        type: "object",
        properties: { anuncio_id: { type: "string" }, motivo: { type: "string", description: "O motivo, que também vai para o dono do anúncio." } },
        required: ["anuncio_id", "motivo"],
      },
      summarize: ({ anuncio_id, motivo }) => `Suspender o anúncio ${anuncio_id} — ${motivo}`,
      impact: () => "O anúncio sai da busca até o dono corrigir; se for de loja pagante, ela perde uma vaga ativa nesse período.",
      run: async ({ anuncio_id, motivo }, context) => {
        const listing = await this.prisma.listing.findUnique({ where: { id: anuncio_id } });
        if (!listing) throw new NotFoundException("Anúncio não encontrado");
        if (listing.status !== "active") throw new ConflictException("O anúncio não está mais ativo");
        await this.prisma.$transaction([
          this.prisma.listing.update({ where: { id: anuncio_id }, data: { status: "paused" } }),
          this.prisma.moderationLog.create({
            data: { listingId: anuncio_id, adminId: context.approvedBy ?? null, automated: !context.approvedBy, action: "suspended", reason: motivo },
          }),
        ]);
        await this.notifications.notify(listing.ownerUserId, "listing_suspended", { listingId: listing.id, listingTitle: listing.title, reason: motivo });
        return { suspenso: anuncio_id };
      },
    });

    this.register({
      name: "registrar_resumo_diario",
      color: "green",
      description: "Grava o resumo do dia para o dono da empresa (aparece no painel e vai por e-mail). Use uma vez, no fim da análise.",
      input: z.object({
        resumo: z.string().trim().min(50).max(4000),
        metas_em_risco: z.array(z.string().max(200)).max(10).optional(),
        prioridades: z.array(z.string().max(200)).max(5).optional(),
      }),
      schema: {
        type: "object",
        properties: {
          resumo: { type: "string", description: "Texto corrido, até 4000 caracteres, só com números lidos nas ferramentas." },
          metas_em_risco: { type: "array", items: { type: "string" } },
          prioridades: { type: "array", items: { type: "string" }, description: "Até 5 ações recomendadas para hoje." },
        },
        required: ["resumo"],
      },
      run: async ({ resumo, metas_em_risco, prioridades }, context) => {
        const lines = [resumo];
        if (metas_em_risco?.length) lines.push("", "Metas em risco:", ...metas_em_risco.map((item) => `• ${item}`));
        if (prioridades?.length) lines.push("", "Prioridades sugeridas:", ...prioridades.map((item, index) => `${index + 1}. ${item}`));
        const body = lines.join("\n");
        const report = await this.prisma.opsReport.create({
          data: { agent: context.agent, kind: "resumo_diario", body, data: { metas_em_risco, prioridades } as Prisma.InputJsonValue, taskId: context.taskId },
        });
        const dayLabel = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
        const admins = await this.prisma.user.findMany({ where: { role: "admin", status: "active" }, select: { id: true } });
        for (const admin of admins) await this.notifications.notify(admin.id, "ops_daily_summary", { dayLabel, body }).catch(() => undefined);
        return { resumoId: report.id };
      },
    });

    this.register({
      name: "registrar_sugestao_marketing",
      color: "green",
      description: "Grava uma sugestão de post ou campanha para o dono aprovar e publicar. Nada é publicado automaticamente. Até 6 por tarefa.",
      input: z.object({
        titulo: z.string().trim().min(5).max(120),
        canal: z.enum(MARKETING_CHANNELS),
        publico: z.string().trim().max(200).optional(),
        texto: z.string().trim().min(20).max(1500),
        link: z.string().trim().max(300).optional(),
      }),
      schema: {
        type: "object",
        properties: {
          titulo: { type: "string" },
          canal: { type: "string", enum: MARKETING_CHANNELS },
          publico: { type: "string", description: "Para quem é (ex.: lojas de carros, quem procura apartamento)." },
          texto: { type: "string", description: "Legenda ou roteiro pronto para usar, sem inventar números ou promessas." },
          link: { type: "string", description: "Página do novoseminovo.com.br; o sistema acrescenta o rastreio utm." },
        },
        required: ["titulo", "canal", "texto"],
      },
      run: async ({ titulo, canal, publico, texto, link }, context) => {
        if (context.taskId) {
          const count = await this.prisma.marketingSuggestion.count({ where: { taskId: context.taskId } });
          if (count >= MAX_SUGGESTIONS_PER_TASK) throw new Error(`Limite de ${MAX_SUGGESTIONS_PER_TASK} sugestões por tarefa`);
        }
        const suggestion = await this.prisma.marketingSuggestion.create({
          data: { title: titulo, channel: canal, audience: publico, body: texto, link: trackedLink(link, canal), taskId: context.taskId },
        });
        return { sugestaoId: suggestion.id, link: suggestion.link };
      },
    });
  }

  private async checkDailyMessageCap(): Promise<void> {
    const sent = await this.prisma.notification.count({ where: { type: { in: ["listing_tip", "partner_tip"] }, createdAt: { gte: new Date(Date.now() - DAY_MS) } } });
    if (sent >= maxMessagesPerDay()) throw new Error(`Teto de ${maxMessagesPerDay()} avisos por dia atingido`);
  }

  private async recentlyTipped(type: "listing_tip" | "partner_tip", key: "listingId" | "partnerId", subject?: string): Promise<Set<string>> {
    const rows = await this.prisma.notification.findMany({
      where: { type, createdAt: { gte: new Date(Date.now() - TIP_COOLDOWN_DAYS * DAY_MS) } },
      select: { payload: true },
    });
    return new Set(
      rows
        .map((row) => row.payload as Record<string, unknown>)
        .filter((payload) => !subject || payload.subject === subject)
        .map((payload) => String(payload[key] ?? "")),
    );
  }

  private async listingProblems(scope: (typeof SEGMENTS)[number], limit: number) {
    const listings = await this.prisma.listing.findMany({
      where: { status: "active", ...(scope === "all" ? {} : { type: scope }) },
      select: {
        id: true,
        type: true,
        title: true,
        description: true,
        price: true,
        city: true,
        state: true,
        ownerUserId: true,
        partnerId: true,
        createdAt: true,
        updatedAt: true,
        vehicleDetails: { select: { fipePrice: true } },
        _count: { select: { photos: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 1000,
    });
    const tipped = await this.recentlyTipped("listing_tip", "listingId");
    const seen = new Map<string, string>();
    const now = Date.now();
    const found: Record<string, unknown>[] = [];
    for (const listing of listings) {
      const problems: string[] = [];
      const photos = listing._count.photos;
      if (photos === 0) problems.push("sem_fotos");
      else if (photos < 5) problems.push("poucas_fotos");
      if (listing.description.trim().length < 80) problems.push("descricao_curta");
      const fipe = listing.vehicleDetails?.fipePrice ? Number(listing.vehicleDetails.fipePrice) : undefined;
      const ratio = fipe ? Number(listing.price) / fipe : undefined;
      if (ratio !== undefined && (ratio < 0.7 || ratio > 1.4)) problems.push("preco_fora_fipe");
      const idleDays = Math.floor((now - listing.updatedAt.getTime()) / DAY_MS);
      if (idleDays >= 60) problems.push("parado");
      const dupKey = `${listing.ownerUserId}|${normalizeTitle(listing.title)}|${Number(listing.price)}`;
      if (seen.has(dupKey)) problems.push("duplicado");
      else seen.set(dupKey, listing.id);
      if (!problems.length || tipped.has(listing.id)) continue;
      found.push({
        id: listing.id,
        titulo: listing.title,
        tipo: listing.type,
        cidade: `${listing.city}/${listing.state}`,
        preco: Number(listing.price),
        fipe,
        percentualDaFipe: ratio ? Math.round(ratio * 100) : undefined,
        fotos: photos,
        caracteresNaDescricao: listing.description.trim().length,
        diasSemAtualizar: idleDays,
        vendedor: listing.partnerId ? "loja" : "particular",
        problemas: problems,
        duplicadoDe: problems.includes("duplicado") ? seen.get(dupKey) : undefined,
      });
      if (found.length >= limit) break;
    }
    return { total: found.length, anuncios: found };
  }

  private async staleLeads(days: number) {
    const before = new Date(Date.now() - days * DAY_MS);
    const leads = await this.prisma.lead.findMany({
      where: { status: { in: ["new", "contacted"] }, statusChangedAt: { lt: before } },
      select: { partnerId: true, statusChangedAt: true, partner: { select: { legalName: true, type: true } } },
    });
    const reminded = await this.recentlyTipped("partner_tip", "partnerId", "leads_parados");
    const byPartner = new Map<string, { parceiroId: string; nome: string; tipo: string; leadsParados: number; maisAntigoDias: number }>();
    for (const lead of leads) {
      if (reminded.has(lead.partnerId)) continue;
      const row = byPartner.get(lead.partnerId) ?? { parceiroId: lead.partnerId, nome: lead.partner.legalName, tipo: lead.partner.type, leadsParados: 0, maisAntigoDias: 0 };
      row.leadsParados += 1;
      row.maisAntigoDias = Math.max(row.maisAntigoDias, Math.floor((Date.now() - lead.statusChangedAt.getTime()) / DAY_MS));
      byPartner.set(lead.partnerId, row);
    }
    return { diasSemAndamento: days, parceiros: [...byPartner.values()].sort((a, b) => b.leadsParados - a.leadsParados).slice(0, 30) };
  }

  private async trialWithoutListings() {
    const now = Date.now();
    const partners = await this.prisma.partner.findMany({
      where: {
        type: { in: [...PLAN_REQUIRED_PARTNER_TYPES] },
        createdAt: { gt: new Date(now - PARTNER_TRIAL_DAYS * DAY_MS), lt: new Date(now - 2 * DAY_MS) },
        subscriptions: { none: { status: { in: [...SUBSCRIPTION_STATUSES_IN_EFFECT] } } },
        listings: { none: {} },
      },
      select: { id: true, legalName: true, type: true, createdAt: true },
      take: 50,
    });
    const reminded = await this.recentlyTipped("partner_tip", "partnerId", "teste_sem_anuncio");
    return {
      diasDeTeste: PARTNER_TRIAL_DAYS,
      parceiros: partners
        .filter((partner) => !reminded.has(partner.id))
        .map((partner) => ({
          parceiroId: partner.id,
          nome: partner.legalName,
          tipo: partner.type,
          diasDesdeOCadastro: Math.floor((now - partner.createdAt.getTime()) / DAY_MS),
        })),
    };
  }

  // ---------------- Registro, pedido e aprovação ----------------

  register<Input>(tool: OpsTool<Input>): void {
    this.tools.set(tool.name, tool as OpsTool<any>);
  }

  // Ferramentas do agente no formato que o modelo recebe.
  toolsFor(agent: string): { name: string; description: string; color: string; schema: OpsTool["schema"] }[] {
    return (AGENT_TOOL_ALLOWLIST[agent] ?? [])
      .map((name) => this.tools.get(name))
      .filter((tool): tool is OpsTool<any> => Boolean(tool))
      .map((tool) => ({ name: tool.name, description: tool.description, color: tool.color, schema: tool.schema }));
  }

  async request(agent: string, toolName: string, rawInput: unknown, context: Omit<OpsToolContext, "agent" | "approvedBy"> = {}): Promise<ToolOutcome> {
    const tool = this.tools.get(toolName);
    const decision = decide(agent, tool, toolName);
    const note = (message: string) => (context.taskId ? this.queue.event(context.taskId, "tool", message) : Promise.resolve());

    if (decision.kind === "blocked") {
      await note(`Bloqueado pelo Risco: ${decision.reason}`);
      return { status: "blocked", reason: decision.reason };
    }
    const parsed = tool!.input.safeParse(rawInput);
    if (!parsed.success) return { status: "invalid", reason: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") };

    if (decision.kind === "run") {
      const output = await tool!.run(parsed.data, { agent, taskId: context.taskId });
      if (tool!.name.startsWith("ler_") || tool!.name.startsWith("listar_")) await note(`Consultou ${tool!.name}`);
      else await note(`Usou ${tool!.name}`);
      return { status: "done", output };
    }

    // Amarela: grava o pedido com a assinatura da ação exata e para aqui.
    const paramsHash = actionHash(tool!.name, parsed.data);
    const existing = await this.prisma.agentApproval.findFirst({ where: { paramsHash, status: "pending" } });
    if (existing) return { status: "awaiting_approval", approvalId: existing.id };
    const summary = tool!.summarize?.(parsed.data) ?? tool!.name;
    const approval = await this.prisma.agentApproval.create({
      data: {
        taskId: context.taskId,
        agent,
        tool: tool!.name,
        params: parsed.data as Prisma.InputJsonValue,
        paramsHash,
        summary,
        impact: tool!.impact?.(parsed.data),
        reason: (rawInput as { motivo?: string })?.motivo,
        expiresAt: new Date(Date.now() + APPROVAL_TTL_MS),
      },
    });
    await note(`Pediu aprovação: ${summary}`);
    const admins = await this.prisma.user.findMany({ where: { role: "admin", status: "active" }, select: { id: true } });
    for (const admin of admins) {
      await this.notifications
        .notify(admin.id, "ops_approval_requested", { agentLabel: OPS_AGENT_LABELS[agent] ?? agent, summary })
        .catch(() => undefined);
    }
    return { status: "awaiting_approval", approvalId: approval.id };
  }

  // Executa a ação aprovada, e só ela: confere de novo a cor, os parâmetros e
  // a assinatura. Aprovar duas vezes não executa duas vezes.
  async approve(approvalId: string, adminId: string, note?: string): Promise<{ status: string }> {
    const approval = await this.prisma.agentApproval.findUnique({ where: { id: approvalId } });
    if (!approval) throw new NotFoundException("Pedido de aprovação não encontrado");
    if (approval.expiresAt < new Date()) {
      await this.prisma.agentApproval.updateMany({ where: { id: approvalId, status: "pending" }, data: { status: "expired" } });
      throw new ConflictException("Este pedido expirou. O agente pode pedir de novo se ainda fizer sentido.");
    }
    const claimed = await this.prisma.agentApproval.updateMany({
      where: { id: approvalId, status: "pending" },
      data: { status: "approved", decidedById: adminId, decidedAt: new Date(), decisionNote: note },
    });
    if (!claimed.count) throw new ConflictException("Este pedido já foi decidido.");

    const finish = async (status: "executed" | "failed", result: unknown) => {
      await this.prisma.agentApproval.update({
        where: { id: approvalId },
        data: { status, executedAt: new Date(), result: result as Prisma.InputJsonValue },
      });
      if (approval.taskId) await this.resumeTask(approval.taskId, `Aprovação ${status === "executed" ? "executada" : "falhou"}: ${approval.summary}`);
      return { status };
    };

    const tool = this.tools.get(approval.tool);
    if (!tool || tool.color !== "yellow") return finish("failed", { erro: "A ferramenta não existe mais ou mudou de cor" });
    const parsed = tool.input.safeParse(approval.params);
    if (!parsed.success || actionHash(tool.name, parsed.data) !== approval.paramsHash) {
      return finish("failed", { erro: "Os parâmetros não batem com a assinatura aprovada" });
    }
    try {
      const output = await tool.run(parsed.data, { agent: approval.agent, taskId: approval.taskId ?? undefined, approvedBy: adminId });
      return finish("executed", output ?? null);
    } catch (error) {
      return finish("failed", { erro: error instanceof Error ? error.message : String(error) });
    }
  }

  async reject(approvalId: string, adminId: string, note?: string): Promise<{ status: string }> {
    const approval = await this.prisma.agentApproval.findUnique({ where: { id: approvalId } });
    if (!approval) throw new NotFoundException("Pedido de aprovação não encontrado");
    const updated = await this.prisma.agentApproval.updateMany({
      where: { id: approvalId, status: "pending" },
      data: { status: "rejected", decidedById: adminId, decidedAt: new Date(), decisionNote: note },
    });
    if (!updated.count) throw new ConflictException("Este pedido já foi decidido.");
    if (approval.taskId) await this.resumeTask(approval.taskId, `Recusado pelo admin: ${approval.summary}${note ? ` (${note})` : ""}`);
    return { status: "rejected" };
  }

  async expireOld(now = new Date()): Promise<number> {
    const result = await this.prisma.agentApproval.updateMany({ where: { status: "pending", expiresAt: { lt: now } }, data: { status: "expired" } });
    return result.count;
  }

  // A decisão fica registrada no histórico da tarefa. A tarefa não roda de novo
  // sozinha (isso gastaria IA à toa): a próxima rodada do agente já vê o resultado.
  private async resumeTask(taskId: string, message: string): Promise<void> {
    await this.queue.event(taskId, "approval", message);
    const pending = await this.prisma.agentApproval.count({ where: { taskId, status: "pending" } });
    if (pending) return;
    await this.prisma.agentTask.updateMany({
      where: { id: taskId, status: "awaiting_approval" },
      data: { status: "completed", completedAt: new Date() },
    });
  }
}

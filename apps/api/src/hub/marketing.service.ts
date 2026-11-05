import { BadRequestException, Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import {
  MktBudgetInputSchema,
  MktContentInputSchema,
  MktMediaInputSchema,
  MktPublishedInputSchema,
  MktReviseInputSchema,
  type MktContentInput,
} from "@novoseminovo/shared-types";
import type { Prisma } from "@novoseminovo/db";
import type { z } from "zod";
import { safeSharp, sanitizeUpload } from "../common/image-safety";
import { getPhotoStorage } from "../common/storage";
import { windsorEnabled, windsorRows } from "../operations/windsor";
import { PrismaService } from "../prisma/prisma.service";
import { type LinhaGasto, calendarioMes, custoPorCadastro, proximoStatus, publicacaoAutomatica, resumoGastos } from "./marketing-regras";
import { MetaError, facebookEnabled, instagramEnabled, metricasInstagram, publicarFacebook, publicarInstagram } from "./meta-graph";

// Marketing do Hub: o Claude do Marketing envia os conteúdos (chave do
// marketing), o Diego aprova ou pede ajuste no Hub, e o Hub publica sozinho
// no Instagram e no Facebook na hora marcada. Nada publica sem aprovação.

type Links = Record<string, string>;
const ehNosso = (url: string) => url.startsWith("/uploads/") || Boolean(process.env.S3_PUBLIC_URL_BASE && url.startsWith(process.env.S3_PUBLIC_URL_BASE));
const publica = (url: string) => (url.startsWith("http") ? url : `${(process.env.PUBLIC_API_URL ?? "").replace(/\/$/, "")}${url}`);
const legendaCompleta = (c: { legenda: string; hashtags: string[] }) => [c.legenda, c.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")].filter(Boolean).join("\n\n");
const CONECTORES: Record<string, string> = { meta_ads: "facebook", google_ads: "google_ads", tiktok_ads: "tiktok" };

@Injectable()
export class MarketingHubService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketingHubService.name);
  private timer?: NodeJS.Timeout;
  private rodando = false;

  constructor(private readonly prisma: PrismaService) {}

  // Publicador: a cada 2 minutos olha o que foi aprovado e chegou a hora.
  onModuleInit() {
    if (process.env.MKT_PUBLISHER_DISABLED || process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => {
      if (this.rodando) return;
      this.rodando = true;
      this.publicarPendentes(new Date())
        .catch((e: Error) => this.logger.error(`Publicador: ${e.message}`))
        .finally(() => (this.rodando = false));
    }, 120_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // Imagem enviada pelo Claude ou pelo Hub: passa pela checagem de sempre
  // (tipo pelos bytes, tamanho, antivírus) e é salva em JPEG, que é o que o
  // Instagram aceita.
  async salvarMidia(raw: z.input<typeof MktMediaInputSchema>): Promise<string> {
    const i = MktMediaInputSchema.parse(raw);
    const buffer = Buffer.from(i.base64.replace(/^data:[^,]*,/, ""), "base64");
    if (!buffer.length || buffer.length > 8_000_000) throw new BadRequestException("A imagem precisa ter até 8 MB.");
    const limpa = await sanitizeUpload({ buffer, mimetype: "application/octet-stream", originalname: i.nome }).catch(() => {
      throw new BadRequestException("Este arquivo não é uma imagem JPEG, PNG ou WebP válida.");
    });
    const jpeg = limpa.mimetype === "image/jpeg" ? limpa.buffer : await safeSharp(limpa.buffer).flatten({ background: "#ffffff" }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    return getPhotoStorage().save(jpeg, `${i.nome.replace(/\.[^.]*$/, "")}.jpg`, "image/jpeg");
  }

  private async historico(contentId: string, acao: string, autor: string, texto?: string) {
    await this.prisma.mktHistory.create({ data: { contentId, acao, autor, texto: texto?.slice(0, 2000) } });
  }

  async criar(raw: MktContentInput, origem: "claude" | "hub", autor: string) {
    const i = MktContentInputSchema.parse(raw);
    const c = await this.prisma.mktContent.create({
      data: {
        tipo: i.tipo,
        redes: i.redes,
        titulo: i.titulo,
        legenda: i.legenda,
        hashtags: i.hashtags,
        midias: i.midias,
        dataPlanejada: i.dataPlanejada ? new Date(i.dataPlanejada) : null,
        campanha: (i.campanha as Prisma.InputJsonValue) ?? undefined,
        observacao: i.observacao,
        ordemId: i.ordemId,
        origem,
        status: "em_aprovacao",
      },
      select: { id: true },
    });
    await this.historico(c.id, "enviado", autor);
    return c;
  }

  private async carregar(id: string) {
    const c = await this.prisma.mktContent.findUnique({ where: { id } });
    if (!c) throw new NotFoundException("Conteúdo não encontrado.");
    return c;
  }

  private async mudar(id: string, acao: Parameters<typeof proximoStatus>[1], data: Prisma.MktContentUpdateInput = {}) {
    const c = await this.carregar(id);
    const para = proximoStatus(c.status, acao);
    if (!para) throw new BadRequestException(`Este conteúdo não pode ${{ aprovar: "ser aprovado", ajuste: "receber pedido de ajuste", revisar: "ser revisado", cancelar: "ser cancelado" }[acao as string] ?? "mudar"} agora (está "${c.status}").`);
    const { count } = await this.prisma.mktContent.updateMany({ where: { id, status: c.status }, data: { ...(data as Prisma.MktContentUpdateManyMutationInput), status: para } });
    if (!count) throw new BadRequestException("O conteúdo mudou enquanto você salvava. Atualize a página.");
    return { antes: c, para };
  }

  async aprovar(id: string, i: { publicarEm?: string }, userId: string) {
    const c = await this.carregar(id);
    const quando = i.publicarEm ? new Date(i.publicarEm) : c.dataPlanejada;
    if (!quando && proximoStatus(c.status, "aprovar")) throw new BadRequestException("Escolha a data e a hora de publicar.");
    await this.mudar(id, "aprovar", { dataPlanejada: quando, aprovadoPorId: userId, aprovadoEm: new Date(), erro: null });
    await this.historico(id, "aprovado", userId, quando ? `Publicar em ${quando.toISOString()}` : undefined);
  }

  async pedirAjuste(id: string, feedback: string, userId: string) {
    const texto = feedback.trim().slice(0, 2000);
    if (!texto) throw new BadRequestException("Escreva o que precisa ajustar.");
    await this.mudar(id, "ajuste", { feedback: texto });
    await this.historico(id, "ajuste", userId, texto);
  }

  // Nova versão depois do ajuste (ou correção antes da aprovação).
  async revisar(id: string, raw: z.input<typeof MktReviseInputSchema>, autor: string) {
    const i = MktReviseInputSchema.parse(raw);
    const c = await this.carregar(id);
    await this.mudar(id, "revisar", {
      revisao: c.revisao + 1,
      ...(i.tipo ? { tipo: i.tipo } : {}),
      ...(i.redes ? { redes: i.redes } : {}),
      ...(i.titulo ? { titulo: i.titulo } : {}),
      ...(i.legenda !== undefined ? { legenda: i.legenda } : {}),
      ...(i.hashtags ? { hashtags: i.hashtags } : {}),
      ...(i.midias ? { midias: i.midias } : {}),
      ...(i.dataPlanejada ? { dataPlanejada: new Date(i.dataPlanejada) } : {}),
      ...(i.campanha ? { campanha: i.campanha as Prisma.InputJsonValue } : {}),
      ...(i.observacao !== undefined ? { observacao: i.observacao } : {}),
    });
    await this.historico(id, "revisado", autor, i.resposta);
  }

  async cancelar(id: string, userId: string) {
    await this.mudar(id, "cancelar");
    await this.historico(id, "cancelado", userId);
  }

  // Rede sem publicação automática (TikTok, YouTube, e-mail...): marca o link.
  async marcarPublicado(id: string, raw: z.input<typeof MktPublishedInputSchema>, userId: string) {
    const i = MktPublishedInputSchema.parse(raw);
    const c = await this.carregar(id);
    if (!c.redes.includes(i.rede)) throw new BadRequestException("Esta rede não faz parte do conteúdo.");
    if (!["aprovado", "erro", "publicado"].includes(c.status)) throw new BadRequestException("Aprove o conteúdo antes de marcar como publicado.");
    const links: Links = { ...((c.links as Links) ?? {}), [i.rede]: i.link };
    const tudo = c.redes.every((r) => links[r]);
    await this.prisma.mktContent.update({ where: { id }, data: { links, ...(tudo ? { status: "publicado", publicadoEm: c.publicadoEm ?? new Date() } : {}) } });
    await this.historico(id, "publicado", userId, `${i.rede}: ${i.link}`);
  }

  // Publica o que foi aprovado e chegou a hora, só no Instagram e no Facebook
  // (o resto fica para publicar à mão). Cada rede publicada guarda o link e
  // não é publicada de novo.
  async publicarPendentes(agora: Date) {
    const devidos = await this.prisma.mktContent.findMany({ where: { status: "aprovado", dataPlanejada: { lte: agora } }, take: 20, orderBy: { dataPlanejada: "asc" } });
    let publicados = 0;
    for (const c of devidos) {
      const links: Links = { ...((c.links as Links) ?? {}) };
      const nossas = c.midias.every(ehNosso);
      const auto = nossas ? publicacaoAutomatica(c).automatico : [];
      const pendentes = auto.filter((r) => !links[r]).filter((r) => (r === "instagram" ? instagramEnabled() : facebookEnabled()));
      if (!pendentes.length) {
        if (c.redes.every((r) => links[r])) await this.prisma.mktContent.update({ where: { id: c.id }, data: { status: "publicado", publicadoEm: c.publicadoEm ?? agora } });
        continue;
      }
      const { count } = await this.prisma.mktContent.updateMany({ where: { id: c.id, status: "aprovado" }, data: { status: "publicando" } });
      if (!count) continue;
      const imagens = c.midias.map(publica);
      const legenda = legendaCompleta(c);
      const extra: Prisma.MktContentUpdateInput = {};
      try {
        for (const rede of pendentes) {
          if (rede === "instagram") {
            const r = await publicarInstagram(imagens, legenda);
            links.instagram = r.link ?? `https://www.instagram.com/`;
            extra.igMediaId = r.mediaId;
          } else {
            const r = await publicarFacebook(imagens, legenda);
            links.facebook = r.link;
            extra.fbPostId = r.postId;
          }
          await this.historico(c.id, "publicado", "Hub", `${rede}: ${links[rede]}`);
        }
        const tudo = c.redes.every((r) => links[r]);
        await this.prisma.mktContent.update({ where: { id: c.id }, data: { ...extra, links, status: tudo ? "publicado" : "aprovado", publicadoEm: c.publicadoEm ?? agora, erro: null } });
        publicados++;
      } catch (e) {
        const msg = e instanceof MetaError ? e.message : "Falha inesperada ao publicar.";
        await this.prisma.mktContent.update({ where: { id: c.id }, data: { ...extra, links, status: "erro", erro: msg.slice(0, 500) } });
        await this.historico(c.id, "erro", "Hub", msg);
      }
    }
    return { publicados };
  }

  async atualizarMetricas(id: string) {
    const c = await this.carregar(id);
    if (!c.igMediaId) throw new BadRequestException("Só posts publicados pelo Hub no Instagram têm métricas automáticas.");
    const metricas = await metricasInstagram(c.igMediaId).catch((e: Error) => {
      throw new BadRequestException(e.message);
    });
    await this.prisma.mktContent.update({ where: { id }, data: { metricas, metricasEm: new Date() } });
    return metricas;
  }

  // ----------------------------------------------------------- Consultas

  private vista(c: Awaited<ReturnType<MarketingHubService["carregar"]>>) {
    const auto = c.midias.every(ehNosso) ? publicacaoAutomatica(c) : { automatico: [], manual: c.redes };
    return {
      id: c.id,
      tipo: c.tipo,
      redes: c.redes,
      titulo: c.titulo,
      legenda: c.legenda,
      hashtags: c.hashtags,
      midias: c.midias,
      dataPlanejada: c.dataPlanejada?.toISOString(),
      status: c.status,
      feedback: c.feedback ?? undefined,
      revisao: c.revisao,
      campanha: (c.campanha as Record<string, unknown> | null) ?? undefined,
      origem: c.origem,
      observacao: c.observacao ?? undefined,
      links: (c.links as Links) ?? {},
      erro: c.erro ?? undefined,
      metricas: (c.metricas as Record<string, number> | null) ?? undefined,
      publicadoEm: c.publicadoEm?.toISOString(),
      automatico: auto.automatico,
      manual: auto.manual,
      criadoEm: c.createdAt.toISOString(),
    };
  }

  async listar(f: { status?: string; mes?: string; rede?: string } = {}) {
    const rows = await this.prisma.mktContent.findMany({
      where: {
        ...(f.status ? { status: f.status } : {}),
        ...(f.rede ? { redes: { has: f.rede } } : {}),
        ...(f.mes ? { OR: [{ dataPlanejada: { gte: new Date(`${f.mes}-01T03:00:00Z`), lt: new Date(new Date(`${f.mes}-01T03:00:00Z`).setUTCMonth(new Date(`${f.mes}-01T03:00:00Z`).getUTCMonth() + 1)) } }, { dataPlanejada: null }] } : {}),
      },
      orderBy: [{ dataPlanejada: "asc" }, { createdAt: "desc" }],
      take: 500,
    });
    return rows.map((c) => this.vista(c));
  }

  async detalhe(id: string) {
    const c = await this.prisma.mktContent.findUnique({ where: { id }, include: { historico: { orderBy: { createdAt: "asc" } } } });
    if (!c) throw new NotFoundException("Conteúdo não encontrado.");
    return { ...this.vista(c), historico: c.historico.map((h) => ({ acao: h.acao, texto: h.texto ?? undefined, autor: h.autor, em: h.createdAt.toISOString() })) };
  }

  async calendario(mes: string) {
    return calendarioMes(mes, await this.listar({ mes }));
  }

  async orcamentos(mes: string): Promise<Record<string, number>> {
    const rows = await this.prisma.mktBudget.findMany({ where: { month: mes } });
    return Object.fromEntries(rows.map((r) => [r.plataforma, Number(r.valor)]));
  }

  async salvarOrcamento(raw: z.input<typeof MktBudgetInputSchema>) {
    const i = MktBudgetInputSchema.parse(raw);
    await this.prisma.mktBudget.upsert({ where: { month_plataforma: { month: i.mes, plataforma: i.plataforma } }, create: { month: i.mes, plataforma: i.plataforma, valor: i.valor }, update: { valor: i.valor } });
  }

  // Gastos com anúncios do mês (Meta, Google e TikTok pelo Windsor.ai), contra
  // o orçamento e com o custo por cadastro e por assinatura (CRM).
  async gastos(mes: string, hoje: string) {
    const preset = mes === hoje.slice(0, 7) ? "this_month" : mes === new Date(new Date(`${hoje.slice(0, 7)}-15T00:00:00Z`).setUTCMonth(new Date(`${hoje.slice(0, 7)}-15T00:00:00Z`).getUTCMonth() - 1)).toISOString().slice(0, 7) ? "last_month" : null;
    const orc = await this.orcamentos(mes);
    const linhas: LinhaGasto[] = [];
    const conexoes: Record<string, "ok" | "sem_dados" | "nao_conectado"> = {};
    if (preset && windsorEnabled()) {
      for (const [plataforma, conector] of Object.entries(CONECTORES)) {
        try {
          const rows = await windsorRows(conector, ["date", "campaign", "spend", "clicks", "impressions"], preset);
          for (const r of rows) linhas.push({ plataforma, campanha: String(r.campaign ?? "Sem nome"), data: String(r.date ?? ""), gasto: Number(r.spend ?? 0), cliques: Number(r.clicks ?? 0), impressoes: Number(r.impressions ?? 0), conversoes: 0 });
          conexoes[plataforma] = rows.length ? "ok" : "sem_dados";
        } catch {
          conexoes[plataforma] = "nao_conectado";
        }
      }
    }
    const resumo = resumoGastos(linhas, orc);
    const inicio = new Date(`${mes}-01T03:00:00Z`);
    const fim = new Date(new Date(inicio).setUTCMonth(inicio.getUTCMonth() + 1));
    const [cadastros, assinaturas] = await Promise.all([
      this.prisma.partner.count({ where: { createdAt: { gte: inicio, lt: fim } } }),
      this.prisma.subscriptionPayment.groupBy({ by: ["partnerId"], having: { paidAt: { _min: { gte: inicio, lt: fim } } } }).then((r) => r.length),
    ]);
    return { mes, windsor: windsorEnabled(), periodoDisponivel: Boolean(preset), conexoes, orcamentos: orc, ...resumo, cadastros, assinaturas, custo: custoPorCadastro(resumo.total.gasto, { cadastros, assinaturas }) };
  }

  // Análises: Instagram orgânico (Windsor), visitas do site por origem
  // (Google Analytics) e os posts publicados pelo Hub com métricas.
  async analises() {
    const out: {
      windsor: boolean;
      instagram?: { data: string; tipo: string; legenda: string; curtidas: number; comentarios: number; alcance: number; link?: string }[];
      origens?: { fonte: string; meio: string; sessoes: number; usuarios: number }[];
      erros: string[];
    } = { windsor: windsorEnabled(), erros: [] };
    if (windsorEnabled()) {
      try {
        const rows = await windsorRows("instagram", ["date", "media_type", "media_caption", "media_like_count", "media_comments_count", "media_reach", "media_permalink"], "last_30d");
        out.instagram = rows
          .map((r) => ({ data: String(r.date ?? ""), tipo: String(r.media_type ?? ""), legenda: String(r.media_caption ?? "").slice(0, 140), curtidas: Number(r.media_like_count ?? 0), comentarios: Number(r.media_comments_count ?? 0), alcance: Number(r.media_reach ?? 0), link: typeof r.media_permalink === "string" ? r.media_permalink : undefined }))
          .sort((a, b) => b.alcance - a.alcance || b.curtidas - a.curtidas)
          .slice(0, 20);
      } catch {
        out.erros.push("Instagram (Windsor) não respondeu.");
      }
      try {
        const rows = await windsorRows("googleanalytics4", ["source", "medium", "sessions", "totalusers"], "last_30d");
        const soma = new Map<string, { fonte: string; meio: string; sessoes: number; usuarios: number }>();
        for (const r of rows) {
          const k = `${r.source}|${r.medium}`;
          const x = soma.get(k) ?? { fonte: String(r.source ?? ""), meio: String(r.medium ?? ""), sessoes: 0, usuarios: 0 };
          x.sessoes += Number(r.sessions ?? 0);
          x.usuarios += Number(r.totalusers ?? 0);
          soma.set(k, x);
        }
        out.origens = [...soma.values()].sort((a, b) => b.sessoes - a.sessoes).slice(0, 15);
      } catch {
        out.erros.push("Google Analytics (Windsor) não respondeu.");
      }
    }
    const publicados = (await this.prisma.mktContent.findMany({ where: { status: "publicado" }, orderBy: { publicadoEm: "desc" }, take: 30 })).map((c) => this.vista(c));
    return { ...out, publicados };
  }

  async resumo(hoje: string) {
    const [aguardando, aprovados, ajustes, erros] = await Promise.all([
      this.prisma.mktContent.count({ where: { status: "em_aprovacao" } }),
      this.prisma.mktContent.count({ where: { status: "aprovado" } }),
      this.prisma.mktContent.count({ where: { status: "ajuste" } }),
      this.prisma.mktContent.count({ where: { status: "erro" } }),
    ]);
    const semana = new Date(new Date(`${hoje}T03:00:00Z`).getTime() + 7 * 86_400_000);
    const proximos = (await this.prisma.mktContent.findMany({ where: { status: { in: ["aprovado", "em_aprovacao"] }, dataPlanejada: { gte: new Date(`${hoje}T03:00:00Z`), lt: semana } }, orderBy: { dataPlanejada: "asc" } })).map((c) => this.vista(c));
    return { aguardando, aprovados, ajustes, erros, proximos, instagram: instagramEnabled(), facebook: facebookEnabled() };
  }
}

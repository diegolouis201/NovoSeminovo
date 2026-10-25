import { createHmac, timingSafeEqual } from "node:crypto";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  type RawBodyRequest,
} from "@nestjs/common";
import type { Request, Response } from "express";
import {
  EmailCampaignInputSchema,
  MarketingDecisionInputSchema,
  MarketingPostInputSchema,
  NewsletterSubscribeInputSchema,
} from "@novoseminovo/shared-types";
import { AdminGuard } from "../admin/admin.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { acquisitionFrom } from "../common/acquisition";
import { parseOrBadRequest } from "../common/parse";
import { ContactsService } from "./contacts.service";
import { EmailMarketingService } from "./email-marketing.service";
import { verifyLink, webOrigin } from "./links";
import { MarketingService } from "./marketing.service";
import { MarketingPostsService, toPostView } from "./posts.service";

// Tela /admin/marketing: prévia, edição e decisão de posts, campanhas e
// sequências. Toda ação que publica ou envia passa por aqui (admin).
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin/marketing")
export class MarketingAdminController {
  constructor(
    private readonly marketing: MarketingService,
    private readonly posts: MarketingPostsService,
    private readonly emails: EmailMarketingService,
  ) {}

  @Get()
  summary() {
    return this.marketing.summary();
  }

  @Post("posts")
  async createPost(@Body() body: unknown) {
    const { post } = await this.posts.create(parseOrBadRequest(MarketingPostInputSchema, body), "admin");
    return toPostView(post);
  }

  @Patch("posts/:id")
  async updatePost(@Param("id") id: string, @Body() body: unknown) {
    const { post } = await this.posts.update(id, parseOrBadRequest(MarketingPostInputSchema, body), "admin");
    return toPostView(post);
  }

  @Post("posts/:id/decision")
  async decidePost(@CurrentUser() user: { id: string }, @Param("id") id: string, @Body() body: unknown) {
    return toPostView(await this.posts.decide(id, user.id, parseOrBadRequest(MarketingDecisionInputSchema, body)));
  }

  @Post("posts/metrics")
  async refreshMetrics() {
    return { updated: await this.posts.refreshMetrics(new Date(), true) };
  }

  @Post("campaigns")
  async createCampaign(@Body() body: unknown) {
    const campaign = await this.emails.createCampaign(parseOrBadRequest(EmailCampaignInputSchema, body), "admin");
    return { id: campaign.id };
  }

  @Patch("campaigns/:id")
  async updateCampaign(@Param("id") id: string, @Body() body: unknown) {
    const campaign = await this.emails.updateCampaign(id, parseOrBadRequest(EmailCampaignInputSchema, body), "admin");
    return { id: campaign.id };
  }

  @Post("campaigns/:id/decision")
  async decideCampaign(@CurrentUser() user: { id: string }, @Param("id") id: string, @Body() body: unknown) {
    const campaign = await this.emails.decideCampaign(id, user.id, parseOrBadRequest(MarketingDecisionInputSchema, body));
    return { id: campaign.id, status: campaign.status };
  }

  @Post("sequences/:id/decision")
  async decideSequence(@CurrentUser() user: { id: string }, @Param("id") id: string, @Body() body: unknown) {
    const sequence = await this.emails.decideSequence(id, user.id, parseOrBadRequest(MarketingDecisionInputSchema, body));
    return { id: sequence.id, status: sequence.status };
  }

  @Post("suggestions/:id/post")
  suggestionToPost(@CurrentUser() user: { id: string }, @Param("id") id: string) {
    return this.marketing.suggestionToPost(id, user.id);
  }
}

// Inscrições por formulário: no máximo 5 por IP a cada hora (memória da API).
const SUBSCRIBE_WINDOW_MS = 60 * 60 * 1000;
const SUBSCRIBE_MAX = 5;
const subscribeHits = new Map<string, number[]>();

function rateLimited(ip: string, now = Date.now()): boolean {
  const hits = (subscribeHits.get(ip) ?? []).filter((at) => now - at < SUBSCRIBE_WINDOW_MS);
  hits.push(now);
  subscribeHits.set(ip, hits);
  if (subscribeHits.size > 5000) subscribeHits.clear();
  return hits.length > SUBSCRIBE_MAX;
}

function page(title: string, message: string, form?: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:480px;margin:48px auto;padding:32px;background:#fff;border-radius:16px;text-align:center;">
<img src="${webOrigin()}/marca/novoseminovo-logo.png" alt="NovoSeminovo" width="140"><h1 style="font-size:20px;color:#1a1a1a;">${title}</h1>
<p style="color:#444;line-height:1.5;">${message}</p>${form ?? ""}
<p style="margin-top:24px;"><a href="${webOrigin()}" style="color:#006aa4;">Ir para o NovoSeminovo</a></p></div></body></html>`;
}

// Svix (usado pelo Resend): HMAC-SHA256 de "id.timestamp.corpo" com a chave
// do whsec_; cabeçalho "v1,assinatura" (pode vir mais de uma).
export function verifySvix(secret: string, id: string, timestamp: string, signatures: string, rawBody: string, now = Date.now()): boolean {
  const ts = Number(timestamp);
  if (!id || !Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 5 * 60) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest();
  return signatures.split(" ").some((part) => {
    const [version, signature] = part.split(",");
    if (version !== "v1" || !signature) return false;
    const given = Buffer.from(signature, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

// Rotas públicas: inscrição no site, descadastro, clique rastreado e webhook do Resend.
@Controller()
export class MarketingPublicController {
  private readonly logger = new Logger(MarketingPublicController.name);

  constructor(
    private readonly contacts: ContactsService,
    private readonly emails: EmailMarketingService,
  ) {}

  @Post("marketing/subscribe")
  @HttpCode(200)
  async subscribe(@Req() req: Request, @Body() body: unknown) {
    // Atrás do Caddy: o IP do visitante vem no X-Forwarded-For.
    const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
    if (rateLimited(forwarded || req.ip || "?")) throw new BadRequestException("Muitas tentativas. Tente de novo mais tarde.");
    const input = parseOrBadRequest(NewsletterSubscribeInputSchema, body);
    const acquisition = acquisitionFrom(req);
    await this.contacts.upsert({
      email: input.email,
      name: input.name,
      interest: input.interest,
      source: acquisition?.source ?? "direto",
      sourceDetail: acquisition?.campaign ? `formulario:${acquisition.campaign}` : "formulario",
      consent: "opt_in",
      consentText: "Formulário do site: quero receber novidades do NovoSeminovo por e-mail.",
    });
    return { ok: true };
  }

  @Get("m/u/:token")
  unsubscribePage(@Res() res: Response) {
    // Só mostra o botão: leitores de e-mail abrem links sozinhos, e isso não pode descadastrar ninguém.
    res
      .type("html")
      .send(
        page(
          "Descadastrar dos e-mails",
          "Clique no botão para não receber mais e-mails de novidades do NovoSeminovo. Avisos da sua conta (mensagens, anúncios) continuam chegando.",
          `<form method="post"><button type="submit" style="padding:12px 24px;border:0;border-radius:999px;background:#76b82a;color:#fff;font-weight:700;font-size:15px;cursor:pointer;">Descadastrar</button></form>`,
        ),
      );
  }

  @Post("m/u/:token")
  @HttpCode(200)
  async unsubscribe(@Param("token") token: string, @Res() res: Response) {
    const contact = await this.contacts.unsubscribe(token);
    res.type("html").send(contact ? page("Pronto, você foi descadastrado", "Você não vai mais receber e-mails de novidades do NovoSeminovo.") : page("Link inválido", "Não encontramos este cadastro."));
  }

  @Get("m/c/:sendId/:signature")
  async click(@Param("sendId") sendId: string, @Param("signature") signature: string, @Query("u") target: string | undefined, @Res() res: Response) {
    if (!target || !verifyLink(`${sendId}|${target}`, signature)) return res.redirect(302, webOrigin());
    await this.emails.recordClick(sendId, target).catch((error) => this.logger.warn(`Clique não registrado: ${error}`));
    return res.redirect(302, target);
  }

  @Post("webhooks/resend")
  @HttpCode(200)
  async resendWebhook(@Req() req: RawBodyRequest<Request>) {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) throw new BadRequestException("Webhook do Resend não configurado");
    const header = (name: string) => String(req.headers[name] ?? "");
    const raw = req.rawBody?.toString("utf8") ?? "";
    if (!verifySvix(secret, header("svix-id"), header("svix-timestamp"), header("svix-signature"), raw)) {
      throw new UnauthorizedException("Assinatura inválida");
    }
    await this.emails.handleProviderEvent(JSON.parse(raw));
    return { ok: true };
  }
}

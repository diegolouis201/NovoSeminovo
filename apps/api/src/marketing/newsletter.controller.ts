import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { NewsletterSubscribeInputSchema } from "@novoseminovo/shared-types";
import { acquisitionFrom } from "../common/acquisition";
import { parseOrBadRequest } from "../common/parse";
import { LOGO_PATH } from "../email/email-template";
import { ContactsService } from "./contacts.service";
import { verifyLink, webOrigin } from "./links";

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
<img src="${webOrigin()}${LOGO_PATH}" alt="NovoSeminovo" width="150"><h1 style="font-size:20px;color:#1a1a1a;">${title}</h1>
<p style="color:#444;line-height:1.5;">${message}</p>${form ?? ""}
<p style="margin-top:24px;"><a href="${webOrigin()}" style="color:#006aa4;">Ir para o NovoSeminovo</a></p></div></body></html>`;
}

// O que sobrou do marketing no site: o formulário "Receba novidades" do
// rodapé, o descadastro (LGPD) e o redirecionamento dos links de e-mails já
// enviados. Os contatos ficam em ContactsService.
@Controller()
export class NewsletterController {
  constructor(private readonly contacts: ContactsService) {}

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

  // Links de e-mails antigos continuam levando ao site (só com assinatura válida).
  @Get("m/c/:sendId/:signature")
  click(@Param("sendId") sendId: string, @Param("signature") signature: string, @Query("u") target: string | undefined, @Res() res: Response) {
    if (!target || !verifyLink(`${sendId}|${target}`, signature)) return res.redirect(302, webOrigin());
    return res.redirect(302, target);
  }
}

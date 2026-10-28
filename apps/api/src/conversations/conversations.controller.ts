import { Body, Controller, Get, HttpException, HttpStatus, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ListingContactInputSchema, SendMessageInputSchema } from "@novoseminovo/shared-types";
import { OptionalJwtAuthGuard } from "../auth/optional-jwt-auth.guard";
import { SkipThrottle } from "@nestjs/throttler";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { acquisitionFrom } from "../common/acquisition";
import { parseOrBadRequest } from "../common/parse";
import { ConversationsService } from "./conversations.service";
import { ListingContactService } from "./listing-contact.service";

@UseGuards(JwtAuthGuard)
@Controller()
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post("listings/:id/conversations")
  start(@CurrentUser() user: { id: string }, @Param("id") listingId: string, @Req() request: Request) {
    return this.conversationsService.startConversation(user.id, listingId, acquisitionFrom(request));
  }

  @Post("leads/:id/conversation")
  openForLead(@CurrentUser() user: { id: string }, @Param("id") leadId: string) {
    return this.conversationsService.openForLead(user.id, leadId);
  }

  @Get("me/conversations")
  listMine(@CurrentUser() user: { id: string }) {
    return this.conversationsService.listMine(user.id);
  }

  @Get("conversations/:id")
  getDetail(@CurrentUser() user: { id: string }, @Param("id") id: string) {
    return this.conversationsService.getDetail(id, user.id);
  }

  @Post("conversations/:id/messages")
  sendMessage(@CurrentUser() user: { id: string }, @Param("id") id: string, @Body() body: unknown) {
    const input = parseOrBadRequest(SendMessageInputSchema, body);
    return this.conversationsService.sendMessage(id, user.id, input.body);
  }
}

// Formulário "Enviar mensagem" do anúncio: aberto a quem não tem conta, com
// limite por visitante (8 envios a cada 10 min) além do limite por e-mail no
// serviço. O site chama pela server action, então o IP do visitante vem no
// x-client-ip que o site repassa (ver apps/web/lib/actions/listing-contact.ts).
const CONTACT_LIMIT = 8;
const CONTACT_WINDOW_MS = 10 * 60 * 1000;
const contactHits = new Map<string, number[]>();

export function contactRateLimited(ip: string, now = Date.now()): boolean {
  const hits = (contactHits.get(ip) ?? []).filter((at) => now - at < CONTACT_WINDOW_MS);
  if (hits.length >= CONTACT_LIMIT) {
    contactHits.set(ip, hits);
    return true;
  }
  hits.push(now);
  contactHits.set(ip, hits);
  if (contactHits.size > 5000) contactHits.clear();
  return false;
}

@SkipThrottle()
@Controller()
export class ListingContactController {
  constructor(private readonly contact: ListingContactService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Post("listings/:id/contact")
  send(@CurrentUser() user: { id: string } | undefined, @Param("id") listingId: string, @Body() body: unknown, @Req() request: Request) {
    const forwarded = request.headers["x-client-ip"];
    const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() || request.ip || "desconhecido";
    if (contactRateLimited(ip)) throw new HttpException("Muitas mensagens em pouco tempo. Tente de novo daqui a alguns minutos.", HttpStatus.TOO_MANY_REQUESTS);
    const input = parseOrBadRequest(ListingContactInputSchema, body);
    return this.contact.send(listingId, { ...input, wantsSimilar: input.wantsSimilar ?? false }, user?.id, acquisitionFrom(request));
  }
}

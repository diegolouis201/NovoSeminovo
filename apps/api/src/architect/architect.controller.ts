import { Body, Controller, Get, Param, Post, Res, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { z } from "zod";
import { ArchitectMessageInputSchema } from "@novoseminovo/shared-types";
import { AdminGuard } from "../admin/admin.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { parseOrBadRequest } from "../common/parse";
import { isStoreId } from "./affiliate";
import { ArchitectService } from "./architect.service";

const OpenSessionSchema = z.object({ listingId: z.string().min(1) });

@Controller()
export class ArchitectController {
  constructor(private readonly architect: ArchitectService) {}

  @UseGuards(JwtAuthGuard)
  @Post("architect/sessions")
  open(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    const input = parseOrBadRequest(OpenSessionSchema, body);
    return this.architect.openSession(user.id, input.listingId);
  }

  @UseGuards(JwtAuthGuard)
  @Get("architect/sessions/:id")
  get(@CurrentUser() user: { id: string }, @Param("id") id: string) {
    return this.architect.getSession(user.id, id);
  }

  // Cada mensagem pode gerar imagem via IA (custo real em R$, ver
  // ARCHITECT_DAILY_IMAGES) — o limite diário de negócio já existe no
  // service, mas nada impedia uma rajada curta; isso aqui é só pra isso.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  @Post("architect/sessions/:id/messages")
  message(@CurrentUser() user: { id: string }, @Param("id") id: string, @Body() body: unknown) {
    const input = parseOrBadRequest(ArchitectMessageInputSchema, body);
    return this.architect.sendMessage(user.id, id, input);
  }

  // Link de loja da lista de compras: conta o clique e redireciona. Público
  // (o link abre numa aba nova, sem o token) — o id da conversa não é adivinhável.
  @Get("architect/go/:sessionId/:index/:store")
  async go(@Param("sessionId") sessionId: string, @Param("index") index: string, @Param("store") store: string, @Res() res: Response) {
    if (!isStoreId(store)) return res.status(404).send("Loja desconhecida");
    const url = await this.architect.trackClick(sessionId, Number(index), store);
    return res.redirect(302, url);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get("admin/architect/stats")
  stats() {
    return this.architect.stats();
  }
}

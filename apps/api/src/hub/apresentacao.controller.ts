import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { CampaignVisitInputSchema } from "@novoseminovo/shared-types";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { parseOrBadRequest } from "../common/parse";
import { HubGuard, HubPermissionRequired } from "./hub.guard";
import { ApresentacaoVisitasService, visitaRepetida } from "./apresentacao.service";

// Limites da contagem pública: 20 por visitante e 600 no total a cada 10 min.
// Passou disso, responde normal e não conta (o visitante não percebe nada).
const JANELA_MS = 10 * 60 * 1000;
const porIp = new Map<string, number[]>();
let global: number[] = [];
export function contagemLimitada(ip: string, now = Date.now()): boolean {
  global = global.filter((t) => now - t < JANELA_MS);
  const hits = (porIp.get(ip) ?? []).filter((t) => now - t < JANELA_MS);
  if (hits.length >= 20 || global.length >= 600) {
    porIp.set(ip, hits);
    return true;
  }
  hits.push(now);
  global.push(now);
  porIp.set(ip, hits);
  if (porIp.size > 5000) porIp.clear();
  return false;
}

// O site (/apresentacao-empresas, route handler) chama aqui antes de mandar a
// pessoa para o PDF, com o IP do visitante em x-client-ip (só para o limite e
// para não contar duas vezes; nunca gravado).
@SkipThrottle()
@Controller("campaign-visits")
export class CampaignVisitsController {
  constructor(private readonly visitas: ApresentacaoVisitasService) {}

  @Post()
  @HttpCode(204)
  async registrar(@Body() body: unknown, @Req() request: Request): Promise<void> {
    const input = parseOrBadRequest(CampaignVisitInputSchema, body);
    const forwarded = request.headers["x-client-ip"];
    const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim().slice(0, 64) || request.ip || "desconhecido";
    if (contagemLimitada(ip)) return;
    if (visitaRepetida([ip, input.target, input.campaign ?? "", input.content ?? ""].join("|"))) return;
    await this.visitas.registrar(input);
  }
}

// Hub: aberturas da apresentação (página /prospeccao).
@UseGuards(JwtAuthGuard, HubGuard)
@Controller("hub/prospeccao")
export class ApresentacaoHubController {
  constructor(private readonly visitas: ApresentacaoVisitasService) {}

  @HubPermissionRequired("crm.ver")
  @Get("apresentacao")
  resumo() {
    return this.visitas.resumo();
  }
}

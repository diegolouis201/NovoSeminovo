import { Controller, Injectable, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import { parseOrBadRequest } from "../common/parse";
import { chaveDoDia } from "../partners/dashboard";

// Contadores agregados por anúncio e por dia (tabela listing_daily_counts).
// Guardam só anúncio, dia, tipo e quantidade — nunca quem foi (sem usuário,
// IP, sessão nem cookie). Tipos numa lista fixa.
export const LISTING_COUNT_KINDS = ["assistente_abriu"] as const;
export type ListingCountKind = (typeof LISTING_COUNT_KINDS)[number];

// Link de anúncio que o assistente virtual (comprador) entrega: marcado com
// ?de=assistente para a página do anúncio contar a visita (ver
// apps/web/components/AssistantVisitCounter.tsx).
export function linkDoAssistente(id: string, canal: string, siteUrl: string): string {
  const caminho = `/anuncio/${id}?de=assistente`;
  return canal === "web" ? caminho : `${siteUrl}${caminho}`;
}

// Id de anúncio (cuid do Prisma): letras minúsculas e números, tamanho fixo
// razoável. Qualquer outra coisa nem chega ao banco.
export const ListingIdParamSchema = z.string().regex(/^[a-z0-9]{8,64}$/);

// Dia (coluna DATE) da contagem, no fuso de São Paulo.
export function diaDaContagem(agora: Date): Date {
  return new Date(`${chaveDoDia(agora)}T00:00:00Z`);
}

@Injectable()
export class ListingCountsService {
  constructor(private readonly prisma: PrismaService) {}

  // Só anúncio no ar conta. Devolve se contou.
  async registrarVisitaDoAssistente(listingId: string, agora = new Date()): Promise<boolean> {
    if (!ListingIdParamSchema.safeParse(listingId).success) return false;
    const ativo = await this.prisma.listing.count({ where: { id: listingId, status: "active" } });
    if (!ativo) return false;
    await this.incrementar(listingId, "assistente_abriu", agora);
    return true;
  }

  private async incrementar(listingId: string, kind: ListingCountKind, agora: Date) {
    const day = diaDaContagem(agora);
    await this.prisma.listingDailyCount.upsert({
      where: { listingId_day_kind: { listingId, day, kind } },
      create: { listingId, day, kind, count: 1 },
      update: { count: { increment: 1 } },
    });
  }
}

// Público (quem abre o link pode não ter conta) e sem corpo. Limite por
// endereço para não inflar a contagem em massa.
@Controller("listings")
export class ListingCountsController {
  constructor(private readonly counts: ListingCountsService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(":id/visita-assistente")
  async visitaDoAssistente(@Param("id") id: string) {
    const listingId = parseOrBadRequest(ListingIdParamSchema, id);
    return { counted: await this.counts.registrarVisitaDoAssistente(listingId) };
  }
}

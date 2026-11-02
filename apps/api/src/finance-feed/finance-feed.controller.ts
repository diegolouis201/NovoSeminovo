import { Controller, Get, Headers, HttpException, HttpStatus, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { currentSecret } from "../auth/secret-file";
import { parseOrBadRequest } from "../common/parse";
import { feedKeyCheck } from "../marketing/conversions.service";
import { FinanceFeedService } from "./finance-feed.service";

const QuerySchema = z.object({ dias: z.coerce.number().int().min(1).max(730).default(30) });

function feedKey(): string | undefined {
  try {
    return currentSecret("FINANCE_FEED_KEY");
  } catch {
    return undefined;
  }
}

// Usado pela sessão "Financeiro NovoSeminovo" com a chave de secrets/finance_feed_key:
//   curl -H "Authorization: Bearer $CHAVE" https://api.novoseminovo.com.br/financeiro/eventos?dias=30
@Controller("financeiro")
export class FinanceFeedController {
  constructor(private readonly finance: FinanceFeedService) {}

  @Get("eventos")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async events(@Headers("authorization") authorization: string | undefined, @Query() query: unknown) {
    const check = feedKeyCheck(authorization, feedKey());
    if (check === "not_configured") throw new HttpException("Feed financeiro não configurado no servidor.", HttpStatus.SERVICE_UNAVAILABLE);
    if (check === "denied") throw new HttpException("Chave inválida.", HttpStatus.UNAUTHORIZED);
    const { dias } = parseOrBadRequest(QuerySchema, query);
    return this.finance.feed(new Date(Date.now() - (dias ?? 30) * 86_400_000));
  }
}

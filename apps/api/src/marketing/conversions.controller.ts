import { Controller, Get, Headers, HttpException, HttpStatus, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { currentSecret } from "../auth/secret-file";
import { parseOrBadRequest } from "../common/parse";
import { ConversionsService, feedKeyCheck } from "./conversions.service";

const QuerySchema = z.object({ dias: z.coerce.number().int().min(1).max(365).default(30) });

function feedKey(): string | undefined {
  try {
    return currentSecret("MARKETING_FEED_KEY");
  } catch {
    return undefined;
  }
}

// Usado pela sessão de marketing (CRM) com a chave de secrets/marketing_feed_key:
//   curl -H "Authorization: Bearer $CHAVE" https://api.novoseminovo.com.br/marketing/conversoes?dias=30
@Controller("marketing")
export class ConversionsController {
  constructor(private readonly conversions: ConversionsService) {}

  @Get("conversoes")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async list(@Headers("authorization") authorization: string | undefined, @Query() query: unknown) {
    const check = feedKeyCheck(authorization, feedKey());
    if (check === "not_configured") throw new HttpException("Feed de conversões não configurado no servidor.", HttpStatus.SERVICE_UNAVAILABLE);
    if (check === "denied") throw new HttpException("Chave inválida.", HttpStatus.UNAUTHORIZED);
    const { dias } = parseOrBadRequest(QuerySchema, query);
    return this.conversions.feed(new Date(Date.now() - (dias ?? 30) * 86_400_000));
  }
}

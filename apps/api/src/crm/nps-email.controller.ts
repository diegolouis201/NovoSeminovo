import { BadRequestException, Body, Controller, HttpCode, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { NpsEmailFollowUpSchema, NpsEmailTokenSchema } from "@novoseminovo/shared-types";
import { parseOrBadRequest } from "../common/parse";
import { NpsEmailService } from "./nps-email.service";

// Pesquisa NPS por e-mail (público, sem login): a página /nps/r/:token do
// site chama aqui; o descadastro de um clique do Gmail (List-Unsubscribe-Post)
// e a página /nps/sair/:token também. Só token assinado; corpo validado.
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller("nps")
export class NpsEmailPublicController {
  constructor(private readonly nps: NpsEmailService) {}

  @Post("clique")
  @HttpCode(200)
  clique(@Body() body: unknown) {
    return this.nps.click(parseOrBadRequest(NpsEmailTokenSchema, body).token);
  }

  @Post("acompanhamento")
  @HttpCode(200)
  acompanhamento(@Body() body: unknown) {
    return this.nps.followUp(parseOrBadRequest(NpsEmailFollowUpSchema, body));
  }

  @Post("sair/:token")
  @HttpCode(200)
  async sair(@Param("token") token: string) {
    const ok = await this.nps.unsubscribe(parseOrBadRequest(NpsEmailTokenSchema, { token }).token);
    if (!ok) throw new BadRequestException("Link inválido.");
    return { ok: true };
  }
}

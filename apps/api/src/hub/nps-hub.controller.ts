import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { NpsHubQuerySchema, NpsPausaSchema } from "@novoseminovo/shared-types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { parseOrBadRequest } from "../common/parse";
import { NpsEmailService } from "../crm/nps-email.service";
import { HubGuard, HubPermissionRequired } from "./hub.guard";

type Me = { id: string };

// NPS no Hub: painel (quem vê o CRM) e o envio automático por e-mail, que só
// o dono liga, pausa ou testa.
@UseGuards(JwtAuthGuard, HubGuard)
@Controller("hub/nps")
export class NpsHubController {
  constructor(private readonly nps: NpsEmailService) {}

  @HubPermissionRequired("crm.ver")
  @Get()
  painel(@Query() query: unknown) {
    return this.nps.dashboard(parseOrBadRequest(NpsHubQuerySchema, query));
  }

  @HubPermissionRequired("crm.ver")
  @Get("envio")
  config() {
    return this.nps.config();
  }

  @HubPermissionRequired("equipe")
  @Post("envio/aprovar")
  async aprovar(@CurrentUser() me: Me) {
    await this.nps.approve(me.id);
    return { ok: true };
  }

  @HubPermissionRequired("equipe")
  @Post("envio/pausa")
  async pausa(@CurrentUser() me: Me, @Body() body: unknown) {
    await this.nps.setPaused(me.id, parseOrBadRequest(NpsPausaSchema, body).pausado);
    return { ok: true };
  }

  @HubPermissionRequired("equipe")
  @Post("envio/teste")
  teste(@CurrentUser() me: Me) {
    return this.nps.sendTest(me.id);
  }
}

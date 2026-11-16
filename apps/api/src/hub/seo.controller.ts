import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import { SeoAtualizarSchema, SeoQuerySchema, type SeoDias } from "@novoseminovo/shared-types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { parseOrBadRequest } from "../common/parse";
import { HubGuard, HubPermissionRequired } from "./hub.guard";
import { SeoService } from "./seo.service";

// SEO no Hub (Google Search Console). Vê quem tem a permissão "marketing"
// (dono e perfil Marketing); só o dono ("equipe") força a atualização.
@UseGuards(JwtAuthGuard, HubGuard)
@HubPermissionRequired("marketing")
@Controller("hub/seo")
export class SeoController {
  constructor(private readonly seo: SeoService) {}

  @Get()
  async ver(@Query() q: unknown) {
    const { dias } = parseOrBadRequest(SeoQuerySchema, q);
    return this.seo.ler(Number(dias ?? 28) as SeoDias);
  }

  @HubPermissionRequired("equipe")
  @Post("atualizar")
  @HttpCode(200)
  async atualizar(@Body() body: unknown) {
    return this.seo.atualizar(parseOrBadRequest(SeoAtualizarSchema, body).dias);
  }
}

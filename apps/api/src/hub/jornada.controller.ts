import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { JornadaPremissasSchema } from "@novoseminovo/shared-types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { parseOrBadRequest } from "../common/parse";
import { HubGuard, HubPermissionRequired } from "./hub.guard";
import { JornadaService } from "./jornada.service";

// Jornada do Hub: marcos de receita e de clientes. Toda a equipe vê; só o
// dono (permissão "equipe") muda as premissas.
@UseGuards(JwtAuthGuard, HubGuard)
@Controller("hub/jornada")
export class JornadaController {
  constructor(private readonly jornada: JornadaService) {}

  @HubPermissionRequired("entrar")
  @Get()
  ver() {
    return this.jornada.ler();
  }

  @HubPermissionRequired("equipe")
  @Post("premissas")
  async salvar(@Body() body: unknown) {
    await this.jornada.salvarPremissas(parseOrBadRequest(JornadaPremissasSchema, body));
    return { ok: true };
  }
}

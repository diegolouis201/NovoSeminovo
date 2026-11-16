import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { JornadaPremissasSchema, JornadaSeguidoresManualSchema } from "@novoseminovo/shared-types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { parseOrBadRequest } from "../common/parse";
import { HubGuard, HubPermissionRequired } from "./hub.guard";
import { JornadaService } from "./jornada.service";

// Jornada do Hub: marcos de receita e de clientes. Toda a equipe vê; só o
// dono (permissão "equipe") muda as premissas e digita seguidores.
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

  // Número de seguidores digitado (redes sem leitura automática, ou quando
  // ela falha). Zod: rede da lista e inteiro de 0 a 1 bilhão.
  @HubPermissionRequired("equipe")
  @Post("seguidores")
  async salvarSeguidores(@Body() body: unknown) {
    const { rede, valor } = parseOrBadRequest(JornadaSeguidoresManualSchema, body);
    return { ok: true, rede: await this.jornada.salvarSeguidoresManual(rede, valor) };
  }
}

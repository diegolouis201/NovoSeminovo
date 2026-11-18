import { Body, Controller, Get, Headers, HttpCode, HttpException, HttpStatus, Param, Post, Query, UnauthorizedException, UseGuards } from "@nestjs/common";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import { AprovarRascunhoSchema, IngestSchema, RejeitarRascunhoSchema, VendedorAjustesSchema, VendedorIdSchema, VendedoresGeralSchema } from "@novoseminovo/shared-types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { parseOrBadRequest } from "../common/parse";
import { HubGuard, HubPermissionRequired } from "../hub/hub.guard";
import { chaveDeIngestaoConfere, LimiteIngestao } from "../prospeccao/ingestao";
import { ProspeccaoImportService } from "../prospeccao/prospeccao-import.service";
import { VendedoresService } from "./vendedores.service";

type Me = { id: string };

// Vendedores IA no Hub. Ver: quem vê o CRM. Aprovar/editar/rejeitar
// respostas, pausar e trocar o modo (supervisionado/automático): só o dono
// (permissão "equipe"), porque isso fala com empresas em nome da NovoSeminovo.
@UseGuards(JwtAuthGuard, HubGuard)
@Controller("hub/vendedores")
export class VendedoresController {
  constructor(private readonly vendedores: VendedoresService) {}

  @HubPermissionRequired("crm.ver")
  @Get()
  painel() {
    return this.vendedores.painel();
  }

  @HubPermissionRequired("equipe")
  @Get("respostas")
  fila(@Query("vendedor") vendedor?: string) {
    return this.vendedores.fila(vendedor ? parseOrBadRequest(VendedorIdSchema, vendedor) : undefined);
  }

  // Arrumação das sequências (Caio = lojas; Nina = imobiliárias e corretores):
  // prévia (GET) e aplicar (POST). Só o dono. Nada é enviado.
  @HubPermissionRequired("equipe")
  @Get("arrumacao")
  previaArrumacao(@CurrentUser() me: Me) {
    return this.vendedores.arrumarSequencias(false, me.id);
  }

  @HubPermissionRequired("equipe")
  @Post("arrumacao")
  aplicarArrumacao(@CurrentUser() me: Me) {
    return this.vendedores.arrumarSequencias(true, me.id);
  }

  @HubPermissionRequired("crm.ver")
  @Get(":id")
  detalhe(@Param("id") id: string) {
    return this.vendedores.detalhe(parseOrBadRequest(VendedorIdSchema, id));
  }

  @HubPermissionRequired("equipe")
  @Post("geral")
  geral(@Body() body: unknown) {
    return this.vendedores.salvarGeral(parseOrBadRequest(VendedoresGeralSchema, body));
  }

  @HubPermissionRequired("equipe")
  @Post(":id/ajustes")
  async ajustes(@Param("id") id: string, @Body() body: unknown) {
    await this.vendedores.ajustar(parseOrBadRequest(VendedorIdSchema, id), parseOrBadRequest(VendedorAjustesSchema, body));
    return { ok: true };
  }

  @HubPermissionRequired("equipe")
  @Post("respostas/:id/aprovar")
  aprovar(@CurrentUser() me: Me, @Param("id") id: string, @Body() body: unknown) {
    return this.vendedores.aprovar(parseOrBadRequest(VendedorIdSchema, id), parseOrBadRequest(AprovarRascunhoSchema, body ?? {}), me.id);
  }

  @HubPermissionRequired("equipe")
  @Post("respostas/:id/rejeitar")
  async rejeitar(@CurrentUser() me: Me, @Param("id") id: string, @Body() body: unknown) {
    await this.vendedores.rejeitar(parseOrBadRequest(VendedorIdSchema, id), parseOrBadRequest(RejeitarRascunhoSchema, body ?? {}), me.id);
    return { ok: true };
  }
}

// Entrada de empresas por automação (agendamento fora do servidor). Sem
// login: chave de API no cabeçalho x-api-key (arquivo
// secrets/prospeccao_ingest_key), limite por hora e por chave errada.
const limite = new LimiteIngestao();

@SkipThrottle()
@Controller("hub/prospects")
export class ProspectsIngestController {
  constructor(private readonly importacao: ProspeccaoImportService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @SkipThrottle({ default: false })
  @Post("ingest")
  @HttpCode(200)
  async ingest(@Headers("x-api-key") chave: string | undefined, @Body() body: unknown) {
    if (limite.bloqueado()) throw new HttpException("Muitas tentativas com chave errada. Tente daqui a uma hora.", HttpStatus.TOO_MANY_REQUESTS);
    const r = chaveDeIngestaoConfere(chave);
    if (r === "desligada") throw new HttpException("Entrada automática desligada (sem chave configurada no servidor).", HttpStatus.SERVICE_UNAVAILABLE);
    if (r === "recusada") {
      limite.errou();
      throw new UnauthorizedException("Chave inválida.");
    }
    if (!limite.permitir()) throw new HttpException("Limite de envios por hora atingido.", HttpStatus.TOO_MANY_REQUESTS);
    return this.importacao.importarAutomatico(parseOrBadRequest(IngestSchema, body));
  }
}

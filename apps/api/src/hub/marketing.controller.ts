import { BadRequestException, Body, Controller, Get, Headers, HttpException, HttpStatus, Param, Post, Query, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { MktApproveInputSchema, MktBoostRulesSchema, MktBudgetInputSchema, MktProspectImportSchema, MktStrategyInputSchema, MktContentInputSchema, MktMediaInputSchema, MktPublishedInputSchema, MktReviseInputSchema } from "@novoseminovo/shared-types";
import { z } from "zod";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { currentSecret } from "../auth/secret-file";
import { parseOrBadRequest } from "../common/parse";
import { feedKeyCheck } from "../marketing/conversions.service";
import { HubGuard, HubPermissionRequired } from "./hub.guard";
import { MarketingHubService } from "./marketing.service";

type Me = { id: string };
const Id = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);
const Mes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const Filtro = z.object({ status: z.string().max(20).optional(), mes: Mes.optional(), rede: z.string().max(20).optional() });
const hoje = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
const Plataforma = z.string().regex(/^[a-z_]{2,20}$/);
// Vídeo (reels) em memória até 150 MB; o tipo real é conferido pelos bytes no serviço.
const videoInterceptor = FileInterceptor("video", { storage: memoryStorage(), limits: { fileSize: 150 * 1024 * 1024 } });
type Upload = { buffer: Buffer; originalname: string } | undefined;

// Telas do Marketing no Hub (permissão "marketing": dono e perfil Marketing).
@UseGuards(JwtAuthGuard, HubGuard)
@HubPermissionRequired("marketing")
@Controller("hub/marketing")
export class MarketingHubController {
  constructor(private readonly mkt: MarketingHubService) {}

  @Get("resumo")
  resumo() {
    return this.mkt.resumo(hoje());
  }

  @Get("conteudos")
  listar(@Query() q: unknown) {
    return this.mkt.listar(parseOrBadRequest(Filtro, q));
  }

  @Get("conteudos/:id")
  detalhe(@Param("id") id: string) {
    return this.mkt.detalhe(parseOrBadRequest(Id, id));
  }

  @Post("conteudos")
  criar(@CurrentUser() me: Me, @Body() body: unknown) {
    return this.mkt.criar(parseOrBadRequest(MktContentInputSchema, body), "hub", me.id);
  }

  @Post("midias")
  async midia(@Body() body: unknown) {
    return { url: await this.mkt.salvarMidia(parseOrBadRequest(MktMediaInputSchema, body)) };
  }

  @Post("conteudos/:id/aprovar")
  async aprovar(@CurrentUser() me: Me, @Param("id") id: string, @Body() body: unknown) {
    await this.mkt.aprovar(parseOrBadRequest(Id, id), parseOrBadRequest(MktApproveInputSchema, body), me.id);
    return { ok: true };
  }

  @Post("conteudos/:id/ajuste")
  async ajuste(@CurrentUser() me: Me, @Param("id") id: string, @Body() body: unknown) {
    await this.mkt.pedirAjuste(parseOrBadRequest(Id, id), parseOrBadRequest(z.object({ feedback: z.string().max(2000) }), body).feedback, me.id);
    return { ok: true };
  }

  @Post("conteudos/:id/cancelar")
  async cancelar(@CurrentUser() me: Me, @Param("id") id: string) {
    await this.mkt.cancelar(parseOrBadRequest(Id, id), me.id);
    return { ok: true };
  }

  @Post("conteudos/:id/publicado")
  async publicado(@CurrentUser() me: Me, @Param("id") id: string, @Body() body: unknown) {
    await this.mkt.marcarPublicado(parseOrBadRequest(Id, id), parseOrBadRequest(MktPublishedInputSchema, body), me.id);
    return { ok: true };
  }

  @Post("conteudos/:id/metricas")
  metricas(@Param("id") id: string) {
    return this.mkt.atualizarMetricas(parseOrBadRequest(Id, id));
  }

  @Get("calendario/:mes")
  calendario(@Param("mes") mes: string) {
    return this.mkt.calendario(parseOrBadRequest(Mes, mes));
  }

  @Get("gastos/:mes")
  gastos(@Param("mes") mes: string) {
    return this.mkt.gastos(parseOrBadRequest(Mes, mes), hoje());
  }

  @Post("orcamentos")
  async orcamento(@Body() body: unknown) {
    await this.mkt.salvarOrcamento(parseOrBadRequest(MktBudgetInputSchema, body));
    return { ok: true };
  }

  @Get("analises")
  analises() {
    return this.mkt.analises();
  }

  @Post("aprovar-todos")
  aprovarTodos(@CurrentUser() me: Me) {
    return this.mkt.aprovarTodos(me.id);
  }

  @Post("midias/video")
  @UseInterceptors(videoInterceptor)
  async video(@UploadedFile() file: Upload) {
    if (!file) throw new BadRequestException("Envie o vídeo.");
    return { url: await this.mkt.salvarVideo(file.buffer, file.originalname) };
  }

  @Get("estrategias")
  estrategias() {
    return this.mkt.estrategias();
  }

  @Post("estrategias/:plataforma")
  async estrategia(@Param("plataforma") p: string, @Body() body: unknown) {
    await this.mkt.salvarEstrategia(parseOrBadRequest(Plataforma, p), parseOrBadRequest(MktStrategyInputSchema, body));
    return { ok: true };
  }

  @Get("impulso")
  async impulso() {
    const [regras, lista] = await Promise.all([this.mkt.impulsoRegras(), this.mkt.impulsos()]);
    return { regras, lista };
  }

  @Post("impulso/regras")
  async impulsoRegras(@Body() body: unknown) {
    await this.mkt.salvarImpulsoRegras(parseOrBadRequest(MktBoostRulesSchema, body));
    return { ok: true };
  }

  @Post("conteudos/:id/impulso/aprovar")
  async aprovarImpulso(@CurrentUser() me: Me, @Param("id") id: string) {
    await this.mkt.aprovarImpulso(parseOrBadRequest(Id, id), me.id);
    return { ok: true };
  }
}

function assertKey(authorization: string | undefined) {
  let secret: string | undefined;
  try {
    secret = currentSecret("MARKETING_FEED_KEY");
  } catch {
    secret = undefined;
  }
  const check = feedKeyCheck(authorization, secret);
  if (check === "not_configured") throw new HttpException("Feed de marketing não configurado no servidor.", HttpStatus.SERVICE_UNAVAILABLE);
  if (check === "denied") throw new HttpException("Chave inválida.", HttpStatus.UNAUTHORIZED);
}

// Claude do Marketing (chave de secrets/marketing_feed_key):
//   POST /marketing/midias                 imagem em base64 → url
//   POST /marketing/conteudos              envia para aprovação no Hub
//   GET  /marketing/conteudos?status=      o que está em aprovação, ajuste, aprovado...
//   GET  /marketing/conteudos/:id          detalhe com o pedido de ajuste
//   POST /marketing/conteudos/:id/revisao  nova versão depois do ajuste
//   POST /marketing/conteudos/:id/recolher {acao: ajuste|cancelar, motivo}
//   GET  /marketing/resultados             gastos do mês e análises
@Controller("marketing")
export class MarketingFeedController {
  constructor(private readonly mkt: MarketingHubService) {}

  @Post("midias")
  async midia(@Headers("authorization") a: string | undefined, @Body() body: unknown) {
    assertKey(a);
    return { url: await this.mkt.salvarMidia(parseOrBadRequest(MktMediaInputSchema, body)) };
  }

  @Post("conteudos")
  criar(@Headers("authorization") a: string | undefined, @Body() body: unknown) {
    assertKey(a);
    return this.mkt.criar(parseOrBadRequest(MktContentInputSchema, body), "claude", "Claude Marketing");
  }

  @Get("conteudos")
  async listar(@Headers("authorization") a: string | undefined, @Query() q: unknown) {
    assertKey(a);
    return this.mkt.listar(parseOrBadRequest(Filtro, q));
  }

  @Get("conteudos/:id")
  detalhe(@Headers("authorization") a: string | undefined, @Param("id") id: string) {
    assertKey(a);
    return this.mkt.detalhe(parseOrBadRequest(Id, id));
  }

  @Post("conteudos/:id/revisao")
  async revisao(@Headers("authorization") a: string | undefined, @Param("id") id: string, @Body() body: unknown) {
    assertKey(a);
    await this.mkt.revisar(parseOrBadRequest(Id, id), parseOrBadRequest(MktReviseInputSchema, body), "Claude Marketing");
    return { ok: true };
  }

  // Recolher um conteúdo que ainda não foi ao ar: volta para ajuste (com o
  // motivo) ou é cancelado. Ex.: mudança no modelo de negócios.
  @Post("conteudos/:id/recolher")
  async recolher(@Headers("authorization") a: string | undefined, @Param("id") id: string, @Body() body: unknown) {
    assertKey(a);
    const i = parseOrBadRequest(z.object({ acao: z.enum(["ajuste", "cancelar"]), motivo: z.string().trim().min(3).max(2000) }), body);
    const conteudo = parseOrBadRequest(Id, id);
    if (i.acao === "ajuste") await this.mkt.pedirAjuste(conteudo, i.motivo, "claude");
    else await this.mkt.cancelar(conteudo, "claude", i.motivo);
    return { ok: true };
  }

  @Post("midias/video")
  @UseInterceptors(videoInterceptor)
  async video(@Headers("authorization") a: string | undefined, @UploadedFile() file: Upload) {
    assertKey(a);
    if (!file) throw new BadRequestException("Envie o vídeo no campo \"video\".");
    return { url: await this.mkt.salvarVideo(file.buffer, file.originalname) };
  }

  @Post("estrategias/:plataforma")
  async estrategia(@Headers("authorization") a: string | undefined, @Param("plataforma") p: string, @Body() body: unknown) {
    assertKey(a);
    await this.mkt.salvarEstrategia(parseOrBadRequest(Plataforma, p), parseOrBadRequest(MktStrategyInputSchema, body));
    return { ok: true };
  }

  @Post("impulso/regras")
  async impulsoRegras(@Headers("authorization") a: string | undefined, @Body() body: unknown) {
    assertKey(a);
    await this.mkt.salvarImpulsoRegras(parseOrBadRequest(MktBoostRulesSchema, body));
    return { ok: true };
  }

  // Lista de prospecção (até 3.000 empresas por vez) → cards "A abordar".
  @Post("prospeccao")
  importarProspeccao(@Headers("authorization") a: string | undefined, @Body() body: unknown) {
    assertKey(a);
    return this.mkt.importarProspeccao(parseOrBadRequest(MktProspectImportSchema, body));
  }

  @Get("resultados")
  async resultados(@Headers("authorization") a: string | undefined) {
    assertKey(a);
    const mes = hoje().slice(0, 7);
    const [gastos, analises] = await Promise.all([this.mkt.gastos(mes, hoje()), this.mkt.analises()]);
    return { gastos, analises };
  }
}

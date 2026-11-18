import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { type ProspeccaoAjustes, ProspeccaoAjustesSchema, ProspeccaoCardSegmentoSchema, ProspeccaoConfirmarSchema, ProspeccaoInscreverSchema, ProspeccaoRemetenteSchema, ProspeccaoRemoverSchema, ProspeccaoSequenciaSchema } from "@novoseminovo/shared-types";
import { z } from "zod";
import { memoryStorage } from "multer";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { parseOrBadRequest } from "../common/parse";
import { HubGuard, HubPermissionRequired } from "../hub/hub.guard";
import { IMPORT_MAX_BYTES } from "./importacao";
import { ProspeccaoImportService } from "./prospeccao-import.service";
import { ProspeccaoSequenciasService } from "./sequencias.service";

const IdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "Identificador inválido.");
const TokenSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}\.[A-Za-z0-9_-]{22}$/, "Link inválido.");

type Me = { id: string };
type Arquivo = { buffer: Buffer; originalname?: string } | undefined;
// Um pouco acima de 5 MB: quem passa do limite recebe a mensagem em português
// do decodificarCsv; muito acima disso o multer corta antes de ler tudo.
const arquivoCsv = FileInterceptor("arquivo", { storage: memoryStorage(), limits: { fileSize: IMPORT_MAX_BYTES + 64 * 1024, files: 1, fields: 10 } });

function exigirArquivo(arquivo: Arquivo): Buffer {
  if (!arquivo?.buffer?.length) throw new BadRequestException("Escolha o arquivo CSV exportado do Mailerfind.");
  return arquivo.buffer;
}

// Prospecção pelo CRM do Hub. Importar cria cards (não manda nada para
// ninguém): dono e Comercial (crm.editar), os mesmos que já cadastram
// empresas à mão no funil.
@UseGuards(JwtAuthGuard, HubGuard)
@Controller("hub/prospeccao")
export class ProspeccaoController {
  constructor(
    private readonly importacao: ProspeccaoImportService,
    private readonly sequencias: ProspeccaoSequenciasService,
  ) {}

  @HubPermissionRequired("crm.editar")
  @Post("importar/analisar")
  @UseInterceptors(arquivoCsv)
  async analisar(@UploadedFile() arquivo: Arquivo) {
    return this.importacao.analisar(exigirArquivo(arquivo), arquivo?.originalname);
  }

  @HubPermissionRequired("crm.editar")
  @Post("importar/confirmar")
  @UseInterceptors(arquivoCsv)
  async confirmar(@CurrentUser() me: Me, @UploadedFile() arquivo: Arquivo, @Body() body: unknown) {
    const bytes = exigirArquivo(arquivo);
    const opcoes = parseOrBadRequest(ProspeccaoConfirmarSchema, { ...(body as object), nomeArquivo: arquivo?.originalname?.slice(0, 200) });
    return this.importacao.confirmar(bytes, opcoes, me.id);
  }

  @HubPermissionRequired("crm.ver")
  @Get("etiquetas")
  etiquetas() {
    return this.importacao.etiquetas();
  }

  // ---------------------------------------------------------- sequências
  // Ver: quem vê o CRM. Escrever, aprovar, inscrever e ajustar o envio: só o
  // dono (equipe), porque isso manda e-mail para empresas. Marcar que a
  // empresa respondeu: Comercial também.

  @HubPermissionRequired("crm.ver")
  @Get("sequencias")
  painel() {
    return this.sequencias.painel();
  }

  @HubPermissionRequired("crm.ver")
  @Get("sequencias/:id")
  async detalhe(@Param("id") id: string) {
    return this.sequencias.detalhe(parseOrBadRequest(IdSchema, id));
  }

  @HubPermissionRequired("equipe")
  @Post("sequencias")
  async criarSequencia(@CurrentUser() me: Me, @Body() body: unknown) {
    return this.sequencias.salvar(undefined, parseOrBadRequest(ProspeccaoSequenciaSchema, body), me.id);
  }

  @HubPermissionRequired("equipe")
  @Post("sequencias/:id")
  async salvarSequencia(@CurrentUser() me: Me, @Param("id") id: string, @Body() body: unknown) {
    return this.sequencias.salvar(parseOrBadRequest(IdSchema, id), parseOrBadRequest(ProspeccaoSequenciaSchema, body), me.id);
  }

  @HubPermissionRequired("equipe")
  @Post("sequencias/:id/aprovar")
  async aprovar(@CurrentUser() me: Me, @Param("id") id: string) {
    await this.sequencias.aprovar(parseOrBadRequest(IdSchema, id), me.id);
    return { ok: true };
  }

  @HubPermissionRequired("equipe")
  @Post("sequencias/:id/pausar")
  async pausar(@Param("id") id: string) {
    await this.sequencias.pausar(parseOrBadRequest(IdSchema, id));
    return { ok: true };
  }

  @HubPermissionRequired("equipe")
  @Post("sequencias/:id/inscrever")
  async inscrever(@CurrentUser() me: Me, @Param("id") id: string, @Body() body: unknown) {
    return this.sequencias.inscrever(parseOrBadRequest(IdSchema, id), parseOrBadRequest(ProspeccaoInscreverSchema, body), me.id);
  }

  // Tirar empresas da sequência (uma ou várias): só o dono. Nada é enviado.
  @HubPermissionRequired("equipe")
  @Post("sequencias/:id/remover")
  async remover(@Param("id") id: string, @Body() body: unknown) {
    return this.sequencias.remover(parseOrBadRequest(IdSchema, id), parseOrBadRequest(ProspeccaoRemoverSchema, body));
  }

  // Vendedor (remetente) da sequência: só o dono.
  @HubPermissionRequired("equipe")
  @Post("sequencias/:id/remetente")
  async remetente(@Param("id") id: string, @Body() body: unknown) {
    await this.sequencias.definirRemetente(parseOrBadRequest(IdSchema, id), parseOrBadRequest(ProspeccaoRemetenteSchema, body));
    return { ok: true };
  }

  @HubPermissionRequired("equipe")
  @Post("ajustes")
  async ajustes(@Body() body: unknown) {
    return this.sequencias.salvarAjustes(parseOrBadRequest(ProspeccaoAjustesSchema as z.ZodType<ProspeccaoAjustes>, body));
  }

  @HubPermissionRequired("crm.editar")
  @Post("empresas/:id/respondeu")
  async respondeu(@CurrentUser() me: Me, @Param("id") id: string) {
    await this.sequencias.respondeu(parseOrBadRequest(IdSchema, id), me.id);
    return { ok: true };
  }

  // Tipo da empresa (loja / imobiliária / corretor / outro): quem edita o CRM corrige.
  @HubPermissionRequired("crm.editar")
  @Post("empresas/:id/segmento")
  async segmento(@CurrentUser() me: Me, @Param("id") id: string, @Body() body: unknown) {
    await this.sequencias.mudarSegmento(parseOrBadRequest(IdSchema, id), parseOrBadRequest(ProspeccaoCardSegmentoSchema, body).segmento, me.id);
    return { ok: true };
  }
}

// Link de saída dos e-mails de prospecção (público, sem login): a página
// /sair/:token do site chama aqui, e o "descadastrar" de um clique do Gmail
// (List-Unsubscribe-Post) também. Token assinado; nada a mais no corpo.
@Controller("prospeccao")
export class ProspeccaoSairController {
  constructor(private readonly sequencias: ProspeccaoSequenciasService) {}

  @Post("sair/:token")
  @HttpCode(200)
  async sair(@Param("token") token: string) {
    const ok = await this.sequencias.sair(parseOrBadRequest(TokenSchema, token));
    if (!ok) throw new BadRequestException("Link inválido.");
    return { ok: true };
  }
}

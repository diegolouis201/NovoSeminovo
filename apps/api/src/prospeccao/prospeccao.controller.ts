import { BadRequestException, Body, Controller, Get, Post, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ProspeccaoConfirmarSchema } from "@novoseminovo/shared-types";
import { memoryStorage } from "multer";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { parseOrBadRequest } from "../common/parse";
import { HubGuard, HubPermissionRequired } from "../hub/hub.guard";
import { IMPORT_MAX_BYTES } from "./importacao";
import { ProspeccaoImportService } from "./prospeccao-import.service";

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
  constructor(private readonly importacao: ProspeccaoImportService) {}

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
}

import { Catch, HttpStatus, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";

// Erro do multer (envio de arquivo) é erro de quem enviou: 413 para arquivo
// grande demais, 400 para o resto. O Nest 10 reconhecia o erro pela
// mensagem, e o multer 2.5 (correções de DoS) mudou algumas mensagens — sem
// este filtro, "campo de arquivo errado" virava erro 500.
// A comparação é pelo nome (MulterError), não por instanceof: o Nest e a API
// podem carregar cópias diferentes do multer.
class MulterErrorLike {
  static [Symbol.hasInstance](value: unknown): boolean {
    return (value as { name?: unknown } | null)?.name === "MulterError";
  }
}

@Catch(MulterErrorLike)
export class UploadErrorFilter implements ExceptionFilter {
  catch(exception: { code?: string; message?: string }, host: ArgumentsHost): void {
    if (host.getType() !== "http") throw exception;
    const status = exception.code === "LIMIT_FILE_SIZE" ? HttpStatus.PAYLOAD_TOO_LARGE : HttpStatus.BAD_REQUEST;
    const message = typeof exception.message === "string" ? exception.message.slice(0, 200) : "Envio de arquivo inválido";
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({ statusCode: status, message, error: status === HttpStatus.PAYLOAD_TOO_LARGE ? "Payload Too Large" : "Bad Request" });
  }
}

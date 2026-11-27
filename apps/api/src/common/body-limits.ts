import { json } from "body-parser";
import type { NextFunction, Request, Response } from "express";

// Tamanho máximo do corpo JSON (main.ts). O corpo é lido antes do limite de
// pedidos (ThrottlerGuard): com 12 MB em toda rota, qualquer um fazia a API
// ler e decodificar 12 MB por pedido no login, no contato, no cadastro.
// 12 MB só onde chega imagem em base64 (Hub/marketing, até ~8 MB) ou lote
// grande (API de integração: até 100 anúncios; importações do Hub).
export const JSON_LIMIT_SMALL = "1mb";
export const JSON_LIMIT_LARGE = "12mb";

const LARGE_PREFIXES = ["/hub/", "/integrations/", "/marketing/"];
const SMALL_EXCEPTIONS = new Set(["/marketing/subscribe"]);

export function usesLargeJsonLimit(path: string): boolean {
  return LARGE_PREFIXES.some((prefix) => path.startsWith(prefix)) && !SMALL_EXCEPTIONS.has(path);
}

// Guarda o corpo cru para conferir assinatura de webhook (Stripe, WhatsApp,
// Meta) — o mesmo que o rawBody: true do Nest fazia.
function keepRawBody(req: Request & { rawBody?: Buffer }, _res: Response, buffer: Buffer): void {
  if (Buffer.isBuffer(buffer)) req.rawBody = buffer;
}

const small = json({ limit: JSON_LIMIT_SMALL, verify: keepRawBody });
const large = json({ limit: JSON_LIMIT_LARGE, verify: keepRawBody });

export function jsonBodyLimit(req: Request, res: Response, next: NextFunction): void {
  (usesLargeJsonLimit(req.path) ? large : small)(req, res, next);
}

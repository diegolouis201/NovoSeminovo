import { isIP } from "node:net";
import type { ThrottlerModuleOptions } from "@nestjs/throttler";

// IP do visitante — um lugar só para todos os limites por pessoa e para o
// registro do consentimento de crédito.
//
// Em produção quem conversa com a API é o Caddy (que grava o IP real do
// visitante em X-Forwarded-For e descarta o que veio do visitante nesse
// cabeçalho) ou os servidores do site/Hub, que repassam o IP do visitante em
// x-client-ip. Esses dois cabeçalhos só valem quando a conexão vem de um
// endereço interno (rede do Docker, loopback): de outro jeito qualquer um
// escolheria o próprio "IP" a cada pedido e passaria por cima dos limites.

type RequestLike = {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
  ip?: string;
};

function normalize(value: string | undefined): string | undefined {
  const ip = value?.trim().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, "");
  return ip && isIP(ip) ? ip : undefined;
}

export function isInternalAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const lower = ip.toLowerCase();
  return lower === "::1" || /^f[cd][0-9a-f]{0,2}:/.test(lower) || /^fe[89ab][0-9a-f]?:/.test(lower);
}

function headerValue(request: RequestLike, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function clientIp(request: RequestLike): string {
  const socket = normalize(request.socket?.remoteAddress ?? request.ip);
  let edge = socket;
  // Atrás do Caddy: o último valor é o que o próprio proxy viu.
  if (socket && isInternalAddress(socket)) {
    edge = normalize(headerValue(request, "x-forwarded-for")?.split(",").pop()) ?? socket;
  }
  // Servidor nosso (site/Hub) chamando: vale o IP do visitante repassado.
  if (edge && isInternalAddress(edge)) {
    const visitor = normalize(headerValue(request, "x-client-ip")?.split(",")[0]);
    if (visitor) return visitor;
  }
  return edge ?? "desconhecido";
}

// Limite global (app.module.ts): 120 pedidos por minuto por visitante. As
// rotas sensíveis apertam com @Throttle (login, cadastro, IA, e-mail…).
export const THROTTLER_OPTIONS = {
  throttlers: [{ name: "default", ttl: 60_000, limit: 120 }],
  getTracker: (request: Record<string, unknown>) => clientIp(request as RequestLike),
} satisfies ThrottlerModuleOptions;

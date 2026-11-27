import { isIP } from "node:net";
import { headers } from "next/headers";

// IP do visitante para os limites por pessoa da API: o site chama a API pelo
// servidor, então a API só enxerga o IP do próprio site — o do visitante vai
// em x-client-ip (a API só aceita esse cabeçalho vindo da rede interna; ver
// apps/api/src/common/client-ip.ts). O Caddy grava o IP real em
// X-Forwarded-For. Só para servidor (server action, route handler).

export function visitorIpFrom(get: (name: string) => string | null): string | undefined {
  const raw = (get("x-forwarded-for") ?? get("x-real-ip"))?.split(",")[0]?.trim();
  return raw && isIP(raw) ? raw : undefined;
}

export function visitorIp(): string | undefined {
  const h = headers();
  return visitorIpFrom((name) => h.get(name));
}

export function visitorIpHeaders(): Record<string, string> {
  const ip = visitorIp();
  return ip ? { "x-client-ip": ip } : {};
}


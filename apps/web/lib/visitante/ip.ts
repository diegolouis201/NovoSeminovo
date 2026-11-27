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


// Junta o x-client-ip aos cabeçalhos de uma chamada à API, sem trocar um
// valor que a chamada já tenha informado.
export function withVisitorIp(headers: HeadersInit | undefined, ip: string | undefined): HeadersInit | undefined {
  if (!ip) return headers;
  const merged = new Headers(headers);
  if (!merged.has("x-client-ip")) merged.set("x-client-ip", ip);
  return merged;
}

// Para as chamadas gerais à API (lib/api.ts): fora de uma requisição
// (build, geração estática) não há visitante e nada é enviado. O sinal do
// Next de "página dinâmica" (digest DYNAMIC_SERVER_USAGE) segue adiante.
export function visitorIpIfAny(): string | undefined {
  try {
    return visitorIp();
  } catch (error) {
    if ((error as { digest?: unknown } | undefined)?.digest === "DYNAMIC_SERVER_USAGE") throw error;
    return undefined;
  }
}

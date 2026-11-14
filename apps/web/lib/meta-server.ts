import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import {
  CONSENT_COOKIE,
  META_EVENT_COOKIE,
  META_HEADERS,
  cleanFbc,
  cleanFbp,
  parseMetaEventQueue,
  serializeMetaEventQueue,
  type MetaContentCategory,
  type MetaEventName,
} from "@novoseminovo/shared-types";
import { META_PIXEL_ID } from "@/lib/meta-pixel";

// Só no servidor (server actions). Conversão da Meta (Lead, cadastro):
// gera o id do evento, manda à API nos cabeçalhos META_HEADERS (a API envia
// pela API de Conversões) e, se a ação der certo, `queue()` deixa o mesmo id
// num cookie curto para o navegador disparar o pixel (lib/meta-events.ts).
// Sem o "Aceitar" do aviso de cookies: nenhum cabeçalho, nada na fila.
export function metaTracking(name: MetaEventName, category?: MetaContentCategory): { headers: Record<string, string>; queue: () => void } {
  const store = cookies();
  if (store.get(CONSENT_COOKIE)?.value !== "granted") return { headers: {}, queue: () => undefined };
  const eventId = randomUUID();
  const request = headers();
  const ip = (request.get("x-forwarded-for") ?? request.get("x-real-ip"))?.split(",")[0]?.trim();
  const userAgent = request.get("user-agent")?.slice(0, 500);
  const page = request.get("referer")?.slice(0, 1000);
  const fbp = cleanFbp(store.get("_fbp")?.value);
  const fbc = cleanFbc(store.get("_fbc")?.value);
  const sent: Record<string, string> = {
    [META_HEADERS.consent]: "granted",
    [META_HEADERS.eventId]: eventId,
    ...(fbp ? { [META_HEADERS.fbp]: fbp } : {}),
    ...(fbc ? { [META_HEADERS.fbc]: fbc } : {}),
    ...(page ? { [META_HEADERS.pageUrl]: page } : {}),
    ...(ip ? { "x-client-ip": ip } : {}),
    ...(userAgent ? { "x-client-user-agent": userAgent } : {}),
  };
  return {
    headers: sent,
    queue: () => {
      if (!META_PIXEL_ID) return;
      const pending = parseMetaEventQueue(store.get(META_EVENT_COOKIE)?.value);
      store.set(META_EVENT_COOKIE, serializeMetaEventQueue([...pending, { name, eventId, ...(category ? { category } : {}) }]), {
        maxAge: 300,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    },
  };
}

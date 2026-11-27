"use client";

import { META_EVENT_COOKIE, parseMetaEventQueue, type MetaContentCategory, type MetaEventName } from "@novoseminovo/shared-types/dist/navegador";

type Fbq = ((...args: unknown[]) => void) & { queue?: unknown[] };

function fbq(): Fbq | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { fbq?: Fbq }).fbq;
}

// Evento padrão da Meta pelo navegador. eventID = o mesmo que a API mandou
// pela API de Conversões: a Meta junta os dois e conta uma vez. Sem pixel
// carregado (sem aceite dos cookies ou sem ID configurado), não faz nada.
export function trackMetaEvent(name: MetaEventName, eventId: string, category?: MetaContentCategory): boolean {
  const track = fbq();
  if (!track) return false;
  track("track", name, category ? { content_category: category } : {}, { eventID: eventId });
  return true;
}

export function metaPageView(): void {
  fbq()?.("track", "PageView");
}

// A server action que deu certo deixa os eventos no cookie META_EVENT_COOKIE
// (lib/meta-server.ts); aqui o navegador dispara e apaga. Chamado depois da
// ação e a cada troca de página (cadastro termina num redirecionamento).
export function flushMetaEvents(): void {
  if (typeof document === "undefined" || !fbq()) return;
  const raw = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${META_EVENT_COOKIE}=`))
    ?.slice(META_EVENT_COOKIE.length + 1);
  if (!raw) return;
  document.cookie = `${META_EVENT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
  for (const event of parseMetaEventQueue(raw)) trackMetaEvent(event.name, event.eventId, event.category);
}

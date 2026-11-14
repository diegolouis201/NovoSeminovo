"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { META_PIXEL_ID } from "@/lib/meta-pixel";
import { flushMetaEvents, metaPageView } from "@/lib/meta-events";

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  push: Fbq;
  loaded: boolean;
  version: string;
};

// Carrega o pixel da Meta (fbevents.js) do mesmo jeito do código oficial, mas
// sem script embutido no HTML: roda aqui, só depois do "Aceitar" do aviso de
// cookies (quem renderiza é o Analytics) e só com ID numérico configurado.
function loadPixel(id: string): void {
  const w = window as unknown as { fbq?: Fbq; _fbq?: Fbq };
  if (w.fbq) return;
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as Fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  w.fbq = fbq;
  w._fbq = fbq;
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
  fbq("init", id);
  fbq("track", "PageView");
}

export function MetaPixel() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const firstPage = useRef(true);

  useEffect(() => {
    if (!META_PIXEL_ID) return;
    loadPixel(META_PIXEL_ID);
    flushMetaEvents();
  }, []);

  // App Router não recarrega a página: cada troca de rota é um PageView.
  useEffect(() => {
    if (!META_PIXEL_ID) return;
    if (firstPage.current) {
      firstPage.current = false;
      return;
    }
    metaPageView();
    flushMetaEvents();
  }, [pathname, search]);

  return null;
}

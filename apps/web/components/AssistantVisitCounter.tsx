"use client";

import { useEffect } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Anúncio aberto por um link do assistente virtual (?de=assistente): soma 1
// num contador do anúncio por dia na API. Não manda nada de quem é (sem
// login, sem corpo, sem cookie) e conta uma vez por anúncio na mesma aba.
export function AssistantVisitCounter({ listingId }: { listingId: string }) {
  useEffect(() => {
    const key = `ns-assistente-${listingId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // sem sessionStorage: conta mesmo assim
    }
    void fetch(`${API_URL}/listings/${encodeURIComponent(listingId)}/visita-assistente`, {
      method: "POST",
      credentials: "omit",
      keepalive: true,
    }).catch(() => undefined);
  }, [listingId]);
  return null;
}

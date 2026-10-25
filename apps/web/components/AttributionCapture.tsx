"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { ACQUISITION_COOKIE, ACQUISITION_MAX_AGE, classifyAcquisition, serializeAcquisition } from "@novoseminovo/shared-types";

const SESSION_FLAG = "ns_origem_lida";

// De onde o visitante veio (Google, Instagram, link de afiliado, campanha com
// utm_*…). Vale a última origem que não foi "direto": quem chegou pelo
// Instagram e volta depois digitando o endereço continua contando como
// Instagram por 90 dias. O site de origem (referrer) só é lido na primeira
// página da visita; links com utm/ref valem sempre.
export function AttributionCapture() {
  const params = useSearchParams();
  const utmSource = params.get("utm_source");
  const ref = params.get("ref");

  useEffect(() => {
    let firstPage = true;
    try {
      firstPage = !sessionStorage.getItem(SESSION_FLAG);
      sessionStorage.setItem(SESSION_FLAG, "1");
    } catch {
      // sem sessionStorage: trata como primeira página
    }
    if (!utmSource && !ref && !firstPage) return;
    const origin = classifyAcquisition({
      utmSource,
      utmMedium: params.get("utm_medium"),
      utmCampaign: params.get("utm_campaign"),
      ref,
      referrer: firstPage ? document.referrer : undefined,
      ownHost: window.location.hostname,
    });
    const hasCookie = document.cookie.split("; ").some((item) => item.startsWith(`${ACQUISITION_COOKIE}=`));
    if (origin.source === "direto" && hasCookie) return;
    document.cookie = `${ACQUISITION_COOKIE}=${encodeURIComponent(serializeAcquisition(origin))}; Max-Age=${ACQUISITION_MAX_AGE}; Path=/; SameSite=Lax`;
  }, [utmSource, ref, params]);

  return null;
}

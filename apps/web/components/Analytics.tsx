"use client";

import Link from "next/link";
import Script from "next/script";
import { Suspense, useEffect, useState } from "react";
import { CONSENT_COOKIE } from "@novoseminovo/shared-types";
import { MetaPixel } from "@/components/MetaPixel";
import { META_PIXEL_ID } from "@/lib/meta-pixel";
import { CONSENT_STORAGE_KEY } from "@/lib/consent";

// Google Analytics 4 do NovoSeminovo. ID público (vai no HTML de qualquer
// jeito) — NEXT_PUBLIC_GA_ID troca sem mexer no código.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "G-S75ZFMVLXE";
const CONSENT_KEY = CONSENT_STORAGE_KEY;

type Consent = "granted" | "denied";

// Cookie de estatística não é essencial pro site funcionar — pela LGPD e
// pela orientação da ANPD sobre cookies, só carrega depois do "Aceitar".
// A escolha fica no navegador; sem armazenamento disponível (aba anônima
// bloqueada), o aviso aparece de novo e nada é carregado sem resposta.
function readConsent(): Consent | undefined {
  try {
    const value = window.localStorage.getItem(CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : undefined;
  } catch {
    return undefined;
  }
}

// Cópia da escolha num cookie: o servidor do site lê para só mandar a
// conversão à Meta (API de Conversões) de quem aceitou (lib/meta-server.ts).
function mirrorConsent(value: Consent) {
  document.cookie = `${CONSENT_COOKIE}=${value}; Max-Age=${365 * 24 * 60 * 60}; Path=/; SameSite=Lax`;
}

function saveConsent(value: Consent) {
  mirrorConsent(value);
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // sem armazenamento: vale só pra esta visita
  }
}

export function Analytics() {
  const [consent, setConsent] = useState<Consent | undefined>();

  useEffect(() => {
    const saved = readConsent();
    if (saved) mirrorConsent(saved);
    setConsent(saved);
  }, []);

  function choose(value: Consent) {
    saveConsent(value);
    setConsent(value);
  }

  return (
    <>
      {consent === "granted" && GA_ID && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
          </Script>
        </>
      )}

      {/* Pixel da Meta: mesmo aceite do Google Analytics, só com ID configurado. */}
      {consent === "granted" && META_PIXEL_ID && (
        <Suspense fallback={null}>
          <MetaPixel />
        </Suspense>
      )}

      {/* Vem no HTML do servidor (não espera o JavaScript para aparecer, ver
          globals.css); some assim que a escolha é lida ou feita. */}
      {!consent && (
        <div
          role="dialog"
          aria-label="Aviso de cookies"
          data-cookie-banner=""
          className="fixed inset-x-2 bottom-20 z-50 mx-auto max-w-xl rounded-brand border border-border bg-surface-raised p-4 shadow-pop sm:bottom-4"
        >
          <p className="text-sm text-ink">
            {META_PIXEL_ID
              ? "Usamos cookies de estatística e de anúncios (Google Analytics e Meta) para entender como o site é usado, melhorá-lo e medir nossos anúncios. Você pode aceitar ou recusar — o site funciona igual."
              : "Usamos cookies de estatística (Google Analytics) para entender como o site é usado e melhorá-lo. Você pode aceitar ou recusar — o site funciona igual."}{" "}
            <Link href="/privacidade" className="font-semibold text-brand-blue hover:underline">
              Política de Privacidade
            </Link>
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => choose("granted")}
              className="rounded-brand bg-brand-green px-4 py-2 text-sm font-bold text-on-green"
            >
              Aceitar
            </button>
            <button
              type="button"
              onClick={() => choose("denied")}
              className="rounded-brand border border-border px-4 py-2 text-sm font-bold text-ink hover:bg-surface-sober"
            >
              Recusar
            </button>
          </div>
        </div>
      )}
    </>
  );
}

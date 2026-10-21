"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";

// Google Analytics 4 do NovoSeminovo. ID público (vai no HTML de qualquer
// jeito) — NEXT_PUBLIC_GA_ID troca sem mexer no código.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "G-S75ZFMVLXE";
const CONSENT_KEY = "ns-cookie-consent";

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

function saveConsent(value: Consent) {
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // sem armazenamento: vale só pra esta visita
  }
}

export function Analytics() {
  const [consent, setConsent] = useState<Consent | undefined>();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setConsent(readConsent());
    setReady(true);
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

      {ready && !consent && (
        <div
          role="dialog"
          aria-label="Aviso de cookies"
          className="fixed inset-x-2 bottom-20 z-50 mx-auto max-w-xl rounded-brand border border-border bg-surface-raised p-4 shadow-pop sm:bottom-4"
        >
          <p className="text-sm text-ink">
            Usamos cookies de estatística (Google Analytics) para entender como o site é usado e melhorá-lo. Você pode
            aceitar ou recusar — o site funciona igual.{" "}
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

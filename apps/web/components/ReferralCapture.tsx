"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { recordAffiliateClickAction } from "@/lib/actions/affiliates";
import { REFERRAL_COOKIE, REFERRAL_MAX_AGE, cleanReferralCode } from "@/lib/referral";

// Quem chega por um link de afiliado (?ref=CODIGO em qualquer página): guarda
// o código num cookie (vale o último link clicado) e conta o clique uma vez
// por sessão do navegador.
export function ReferralCapture() {
  const params = useSearchParams();
  const code = cleanReferralCode(params.get("ref"));

  useEffect(() => {
    if (!code) return;
    document.cookie = `${REFERRAL_COOKIE}=${code}; Max-Age=${REFERRAL_MAX_AGE}; Path=/; SameSite=Lax`;
    try {
      const key = `ns_ref_click_${code}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // sem sessionStorage (aba anônima restrita): conta mesmo assim
    }
    void recordAffiliateClickAction(code);
  }, [code]);

  return null;
}

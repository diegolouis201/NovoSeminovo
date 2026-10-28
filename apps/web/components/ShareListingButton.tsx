"use client";

import { useState } from "react";
import { ShareNetwork } from "@phosphor-icons/react";
import { shareLink } from "@/lib/native-app";

export function ShareListingButton({ title, priceLabel }: { title: string; priceLabel: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const result = await shareLink({ title, text: `${title} — ${priceLabel} no NovoSeminovo`, url: `${window.location.origin}${window.location.pathname}` });
    if (result === "copied") {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void share()}
      className="inline-flex items-center gap-1.5 self-start rounded-full border border-border px-3 py-1.5 text-sm font-semibold text-ink hover:bg-surface-sober"
    >
      <ShareNetwork size={18} weight="bold" />
      {copied ? "Link copiado" : "Compartilhar"}
    </button>
  );
}

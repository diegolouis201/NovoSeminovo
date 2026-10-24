"use client";

import { useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";

// Campo só de leitura com botão de copiar (link e código do afiliado, legendas).
export function CopyField({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // sem permissão de área de transferência: a pessoa seleciona o texto à mão
    }
  }
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="font-semibold text-ink">{label}</span>
      <div className="flex items-start gap-2">
        {multiline ? (
          <textarea readOnly value={value} rows={4} className="min-w-0 flex-1 resize-none rounded-brand border border-border bg-surface-page px-3 py-2 text-ink" />
        ) : (
          <input readOnly value={value} onFocus={(event) => event.target.select()} className="min-w-0 flex-1 rounded-brand border border-border bg-surface-page px-3 py-2 font-semibold text-ink" />
        )}
        <button type="button" onClick={() => void copy()} className="flex shrink-0 items-center gap-1 rounded-brand border border-border px-3 py-2 font-semibold text-ink hover:bg-surface-sober">
          {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

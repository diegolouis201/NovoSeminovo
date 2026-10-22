"use client";

import { useState } from "react";

// CEP preenche cidade, UF, bairro e (no imóvel) a rua, pelo ViaCEP — chamado
// direto do navegador (ViaCEP libera CORS, é gratuito e sem chave). O CEP em
// si não é guardado: só ajuda a preencher os campos de sempre, que a pessoa
// ainda pode corrigir.
type ViaCep = { logradouro?: string; bairro?: string; localidade?: string; uf?: string; erro?: boolean | string };

function setField(name: string, value: string | undefined) {
  const input = document.querySelector<HTMLInputElement>(`[name="${name}"]`);
  if (input && value) input.value = value;
}

export function CepLookup() {
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");

  async function lookup(raw: string) {
    const cep = raw.replace(/\D/g, "");
    if (cep.length !== 8) {
      setStatus("idle");
      return;
    }
    setStatus("loading");
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = (await res.json()) as ViaCep;
      if (!res.ok || data.erro) throw new Error("CEP não encontrado");
      setField("city", data.localidade);
      setField("state", data.uf);
      setField("neighborhood", data.bairro);
      const street = document.querySelector<HTMLInputElement>('[name="streetAddress"]');
      if (street && !street.value.trim() && data.logradouro) street.value = `${data.logradouro}, `;
      setStatus("ok");
    } catch {
      setStatus("error");
    }
  }

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-semibold text-ink">CEP</span>
      <input
        inputMode="numeric"
        maxLength={9}
        placeholder="00000-000"
        onChange={(event) => void lookup(event.target.value)}
        className="rounded-brand border border-border bg-surface-page px-3 py-2 text-ink placeholder:text-ink-muted sm:w-48"
      />
      <span className="text-xs text-ink-muted">
        {status === "loading"
          ? "Buscando endereço…"
          : status === "ok"
            ? "Cidade e bairro preenchidos — confira abaixo."
            : status === "error"
              ? "CEP não encontrado. Preencha cidade e bairro à mão."
              : "Preenche cidade e bairro sozinho. O CEP não aparece no anúncio."}
      </span>
    </label>
  );
}

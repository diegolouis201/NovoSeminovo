"use client";

import { useState } from "react";

// Busca estado/cidade pelo CEP (ViaCEP, público e sem chave) direto no
// navegador da pessoa — client component só nessa parte do formulário; os
// inputs continuam com "name", então o valor vai junto no FormData quando o
// <form action={...}> em volta (server action) for submetido.
export function CepLookupFields({
  initialZipCode,
  initialState,
  initialCity,
}: {
  initialZipCode?: string;
  initialState?: string;
  initialCity?: string;
}) {
  const [zipCode, setZipCode] = useState(initialZipCode ?? "");
  const [state, setState] = useState(initialState ?? "");
  const [city, setCity] = useState(initialCity ?? "");
  const [loading, setLoading] = useState(false);

  async function handleCepBlur() {
    const digits = zipCode.replace(/\D/g, "");
    if (digits.length !== 8) return;

    setLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setState(data.uf ?? "");
        setCity(data.localidade ?? "");
      }
    } catch {
      // Falha silenciosa — a pessoa ainda pode preencher estado/cidade à mão.
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold text-ink">
          CEP <span className="font-normal text-ink-muted">(opcional)</span>
        </span>
        <input
          name="zipCode"
          value={zipCode}
          onChange={(event) => setZipCode(event.target.value)}
          onBlur={handleCepBlur}
          placeholder="30000-000"
          className="rounded-brand border border-border bg-surface-page px-3 py-2 text-ink placeholder:text-ink-muted"
        />
        {loading && <span className="text-xs text-ink-muted">Buscando endereço...</span>}
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold text-ink">
          Estado <span className="font-normal text-ink-muted">(opcional)</span>
        </span>
        <input
          name="state"
          value={state}
          onChange={(event) => setState(event.target.value)}
          placeholder="UF"
          className="rounded-brand border border-border bg-surface-page px-3 py-2 text-ink placeholder:text-ink-muted"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold text-ink">
          Cidade <span className="font-normal text-ink-muted">(opcional)</span>
        </span>
        <input
          name="city"
          value={city}
          onChange={(event) => setCity(event.target.value)}
          placeholder="Cidade"
          className="rounded-brand border border-border bg-surface-page px-3 py-2 text-ink placeholder:text-ink-muted"
        />
      </label>
    </div>
  );
}

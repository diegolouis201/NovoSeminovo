"use client";

import { useEffect, useState } from "react";
import { BRAZIL_STATES } from "@/lib/brazil-states";

// Filtro de local da busca: escolhe o estado e a lista de cidades daquele
// estado carrega sozinha. "bar" é a barra de cima (imóveis); "side" é a
// coluna de filtros (carros).
export function StateCityFields({
  defaultState,
  defaultCity,
  variant,
}: {
  defaultState?: string;
  defaultCity?: string;
  variant: "bar" | "side";
}) {
  const [state, setState] = useState(defaultState?.toUpperCase() ?? "");
  const [city, setCity] = useState(defaultCity ?? "");
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!state) {
      setCities([]);
      return;
    }
    let active = true;
    setLoading(true);
    fetch(`/dados/cidades/${state}.json`)
      .then((res) => (res.ok ? (res.json() as Promise<string[]>) : []))
      .catch(() => [] as string[])
      .then((list) => {
        if (!active) return;
        setCities(list);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [state]);

  // Cidade digitada antes (link antigo, busca salva) que não está na lista oficial continua valendo.
  const cityOptions = city && !cities.includes(city) ? [city, ...cities] : cities;

  const labelClass = variant === "bar" ? "flex flex-col gap-0.5 text-xs font-semibold text-ink-muted" : "flex flex-col gap-1 text-sm";
  const titleClass = variant === "bar" ? "" : "font-semibold text-ink";
  const selectClass =
    variant === "bar"
      ? "rounded-brand border border-border bg-surface-page px-3 py-2 text-sm font-normal text-ink disabled:opacity-60"
      : "rounded-brand border border-border bg-surface-page px-3 py-2 text-ink disabled:opacity-60";

  return (
    <>
      <label className={labelClass}>
        <span className={titleClass}>Estado</span>
        <select
          name="state"
          value={state}
          onChange={(event) => {
            setState(event.target.value);
            setCity("");
          }}
          className={selectClass}
        >
          <option value="">Todos os estados</option>
          {BRAZIL_STATES.map((item) => (
            <option key={item.uf} value={item.uf}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        <span className={titleClass}>Cidade</span>
        <select name="city" value={city} onChange={(event) => setCity(event.target.value)} disabled={!state && !city} className={selectClass}>
          <option value="">{!state ? "Escolha o estado" : loading ? "Carregando…" : "Todas as cidades"}</option>
          {cityOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

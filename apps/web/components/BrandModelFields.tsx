"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Filtro de carro: todas as marcas (FIPE + as que têm anúncio) e, depois de
// escolher a marca, os modelos dela.
export function BrandModelFields({ brands, defaultBrand, defaultModel }: { brands: string[]; defaultBrand?: string; defaultModel?: string }) {
  const [brand, setBrand] = useState(defaultBrand ?? "");
  const [model, setModel] = useState(defaultModel ?? "");
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!brand) {
      setModels([]);
      return;
    }
    let active = true;
    setLoading(true);
    fetch(`${API_URL}/listings/search-models?brand=${encodeURIComponent(brand)}`)
      .then((res) => (res.ok ? (res.json() as Promise<string[]>) : []))
      .catch(() => [] as string[])
      .then((list) => {
        if (!active) return;
        setModels(list);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [brand]);

  // Marca ou modelo de um link antigo que não está na lista continua valendo.
  const brandOptions = brand && !brands.includes(brand) ? [brand, ...brands] : brands;
  const modelOptions = model && !models.includes(model) ? [model, ...models] : models;
  const selectClass = "rounded-brand border border-border bg-surface-page px-3 py-2 text-ink disabled:opacity-60";

  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold text-ink">Marca</span>
        <select
          name="brand"
          value={brand}
          onChange={(event) => {
            setBrand(event.target.value);
            setModel("");
          }}
          className={selectClass}
        >
          <option value="">Todas as marcas</option>
          {brandOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold text-ink">Modelo</span>
        <select name="model" value={model} onChange={(event) => setModel(event.target.value)} disabled={!brand && !model} className={selectClass}>
          <option value="">{!brand ? "Escolha a marca" : loading ? "Carregando…" : "Todos os modelos"}</option>
          {modelOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

"use client";

import { useState } from "react";
import { CheckCircle, MagnifyingGlass, WarningCircle } from "@phosphor-icons/react";
import { allowedAssetTypes, isValidCnpj, type CnpjLookup } from "@novoseminovo/shared-types";
import { cnpjLookupAction } from "@/lib/actions/partners";

// CNPJ da empresa com consulta na Receita: o ramo de atividade (CNAE) decide
// o tipo de conta — e com ele, que tipo de anúncio a empresa faz (imóvel ou
// carro). Só pede o tipo à mão quando a consulta não identifica o ramo ou
// está fora do ar. Usado no /cadastro (Empresa) e no "Sou loja ou imobiliária".

const TYPE_OPTIONS = [
  { value: "real_estate_agency", label: "Imobiliária" },
  { value: "builder", label: "Construtora" },
  { value: "broker", label: "Corretor(a)" },
  { value: "dealership", label: "Loja de veículos / concessionária" },
];

function formatCnpj(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

const inputClass = "rounded-brand border border-border bg-surface-page px-3 py-2 text-ink placeholder:text-ink-muted";

export function CompanyCnpjFields({ cnpjName = "cnpj", typeName = "partnerType" }: { cnpjName?: string; typeName?: string }) {
  const [cnpj, setCnpj] = useState("");
  const [result, setResult] = useState<CnpjLookup | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [manualType, setManualType] = useState("");

  async function search(value = cnpj) {
    setResult(undefined);
    setError(undefined);
    setUnavailable(false);
    if (!isValidCnpj(value)) {
      setError("CNPJ inválido — confira os 14 números.");
      return;
    }
    setLoading(true);
    const found = await cnpjLookupAction(value).catch(() => ({ ok: false as const, error: "Não conseguimos consultar o CNPJ agora." }));
    setLoading(false);
    if (found.ok) {
      setResult(found.value);
      setManualType(found.value.detectedFromSecondary ? found.value.detectedType ?? "" : "");
    }
    else {
      setError(found.error);
      setUnavailable(/consultar o CNPJ agora/i.test(found.error));
    }
  }

  const confirmSuggestion = Boolean(result?.active && result.detectedFromSecondary);
  const needsManualType = unavailable || confirmSuggestion || Boolean(result?.active && !result.detectedType);
  const type = result?.detectedType && !result.detectedFromSecondary ? result.detectedType : manualType;
  const sells = type ? (allowedAssetTypes(type).includes("property") ? "imóveis" : "veículos") : undefined;

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold text-ink">CNPJ da empresa</span>
        <span className="flex gap-2">
          <input
            name={cnpjName}
            value={cnpj}
            required
            inputMode="numeric"
            placeholder="00.000.000/0000-00"
            onChange={(event) => {
              const next = formatCnpj(event.target.value);
              setCnpj(next);
              setResult(undefined);
              if (next.replace(/\D/g, "").length === 14) void search(next);
            }}
            className={`${inputClass} min-w-0 flex-1`}
          />
          <button
            type="button"
            onClick={() => void search()}
            disabled={loading}
            className="flex shrink-0 items-center gap-1.5 rounded-brand bg-brand-blue/10 px-4 text-sm font-bold text-brand-blue hover:bg-brand-blue/20 disabled:opacity-60"
          >
            <MagnifyingGlass size={16} weight="bold" /> {loading ? "Buscando…" : "Buscar"}
          </button>
        </span>
      </label>

      {error && (
        <p className="flex gap-2 rounded-brand bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
          <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" /> {error}
        </p>
      )}

      {result && !result.active && (
        <p className="flex gap-2 rounded-brand bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
          <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" />
          {result.legalName}: situação &quot;{result.situation}&quot; na Receita Federal. Só aceitamos empresas ativas.
        </p>
      )}

      {result?.active && (
        <div className="rounded-brand border border-brand-green/40 bg-brand-green/10 px-3 py-2 text-sm text-ink">
          <p className="flex items-center gap-1.5 font-semibold">
            <CheckCircle size={18} weight="fill" className="text-brand-green" /> {result.tradeName || result.legalName}
          </p>
          {result.tradeName && <p className="text-xs text-ink-muted">{result.legalName}</p>}
          {result.activity && <p className="text-xs text-ink-muted">Atividade: {result.activity}</p>}
          {result.city && (
            <p className="text-xs text-ink-muted">
              {result.city}/{result.state}
            </p>
          )}
          {result.detectedLabel && !confirmSuggestion && (
            <p className="mt-1">
              Tipo de conta: <strong>{result.detectedLabel}</strong> — você vai anunciar {sells}.
            </p>
          )}
        </div>
      )}

      {needsManualType && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-ink">
            {unavailable
              ? "Tipo de empresa"
              : confirmSuggestion
                ? "A atividade principal do CNPJ não é de imóveis nem de veículos. Confirme o tipo de empresa:"
                : "Não identificamos o ramo pelo CNPJ — qual é o tipo de empresa?"}
          </span>
          <select value={manualType} onChange={(event) => setManualType(event.target.value)} required className={inputClass}>
            <option value="">Selecione</option>
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {manualType && <span className="text-xs text-ink-muted">Você vai anunciar {sells}. Nossa equipe confere os dados da empresa.</span>}
        </label>
      )}
      {unavailable && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-ink">Razão social ou nome fantasia</span>
          <input name="legalName" required minLength={3} className={inputClass} />
        </label>
      )}

      <input type="hidden" name={typeName} value={type} />
    </div>
  );
}

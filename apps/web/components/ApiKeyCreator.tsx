"use client";

import { useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";
import { createPartnerApiKeyAction } from "@/lib/actions/integrations";

// A chave inteira só existe na resposta da criação (a API guarda só o
// hash) — por isso fica num componente de cliente, mostrada uma vez.
export function ApiKeyCreator() {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [created, setCreated] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);

  async function submit() {
    if (pending) return;
    setPending(true);
    setError(undefined);
    const result = await createPartnerApiKeyAction(name.trim());
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCreated(result.key);
    setName("");
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // sem permissão de área de transferência: a pessoa seleciona e copia à mão
    }
  }

  if (created) {
    return (
      <div className="rounded-brand border border-brand-green bg-surface-raised p-4">
        <p className="text-sm font-bold text-ink">Chave criada — copie agora</p>
        <p className="mt-1 text-sm text-ink-muted">
          Por segurança, ela não aparece de novo. Cole no seu CRM ou mande para o integrador por um canal seguro.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 break-all rounded-sober bg-surface-sober px-3 py-2 text-sm text-ink">{created}</code>
          <button
            type="button"
            onClick={() => void copy()}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-brand bg-brand-green px-4 py-2 text-sm font-bold text-on-green"
          >
            {copied ? <Check size={18} weight="bold" /> : <Copy size={18} weight="bold" />}
            {copied ? "Copiada" : "Copiar"}
          </button>
        </div>
        <button type="button" onClick={() => setCreated(undefined)} className="mt-3 text-sm font-semibold text-brand-blue hover:underline">
          Já copiei
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <label className="flex flex-1 flex-col gap-1 text-sm">
        <span className="font-semibold text-ink">Nome da chave</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          minLength={2}
          maxLength={60}
          placeholder="Ex.: CRM Jetimob, Integrador X"
          className="rounded-brand border border-border bg-surface-page px-3 py-2 text-ink placeholder:text-ink-muted"
        />
      </label>
      <button
        type="submit"
        disabled={pending || name.trim().length < 2}
        className="rounded-brand bg-brand-blue px-4 py-2 text-sm font-bold text-on-blue disabled:opacity-50"
      >
        {pending ? "Criando…" : "Criar chave"}
      </button>
      {error && <p className="text-sm text-status-danger sm:basis-full">{error}</p>}
    </form>
  );
}

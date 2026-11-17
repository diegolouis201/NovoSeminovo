"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { WarningCircle } from "@phosphor-icons/react";

// Autorizações do crédito em camadas (pedido do Diego, 17/11/2026): a caixa
// mostra um resumo curto com o essencial — quem recebe (IBS Capital), com
// quem é compartilhado, para quê e que dá para revogar — e o texto completo
// fica na própria página, recolhido num <details> nativo ("Ler texto
// completo"): abre com clique, Enter ou Espaço, sem script, e entra na busca
// do navegador. Os textos completos e as versões continuam só em
// shared-types (CONSENTIMENTO_CREDITO, TERMO_BACEN_CREDITAS); aqui é só
// apresentação. Mudou o sentido de um resumo? Confira com o texto completo.

export function resumoConsentimentoDados(parceiro: "Creditas" | "Loft/Credihome"): string {
  return (
    `Autorizo o envio dos meus dados à IBS Capital (parceira de crédito) e o compartilhamento com a ${parceiro} ` +
    "e outras instituições financeiras para simulação, análise de crédito e contato. Posso revogar quando quiser."
  );
}

export const RESUMO_CONSULTA_SCR =
  "Autorizo a consulta dos meus dados no Banco Central (SCR) e nos birôs de crédito (SPC, Serasa e BVS), e o compartilhamento com parceiros da IBS Capital.";

export function ConsentCheckbox({
  name,
  testId,
  summary,
  fullText,
  errorMessage,
}: {
  name: string;
  testId: string;
  summary: string;
  fullText: string;
  errorMessage: string;
}) {
  // Erro só depois de tentar enviar (evento "invalid" do próprio navegador),
  // nunca ao abrir a página; some quando a pessoa marca a caixa.
  const [invalid, setInvalid] = useState(false);
  const errorId = useId();
  return (
    <div data-testid={testId} className="flex flex-col gap-1">
      <label className="flex cursor-pointer items-start gap-2 text-xs leading-snug text-ink">
        <input
          name={name}
          type="checkbox"
          required
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          onInvalid={(event) => {
            event.currentTarget.setCustomValidity(errorMessage);
            setInvalid(true);
          }}
          onChange={(event) => {
            event.currentTarget.setCustomValidity("");
            if (event.currentTarget.checked) setInvalid(false);
          }}
          className="mt-0.5 h-4 w-4 shrink-0 accent-brand-green"
        />
        <span>{summary}</span>
      </label>
      <details className="ml-6 text-[11px] text-ink-muted">
        <summary className="w-fit cursor-pointer py-0.5 font-semibold text-brand-blue underline-offset-2 hover:underline">
          Ler texto completo
        </summary>
        <p data-texto-completo className="mt-1 rounded-brand border border-border bg-surface-page px-3 py-2 leading-relaxed">
          {fullText}
        </p>
      </details>
      {invalid && (
        <p id={errorId} className="ml-6 flex items-start gap-1 text-[11px] font-semibold text-status-danger">
          <WarningCircle size={14} weight="fill" aria-hidden="true" className="mt-px shrink-0" />
          {errorMessage}
        </p>
      )}
    </div>
  );
}

export function PrivacyPolicyNote() {
  return (
    <p className="text-[11px] text-ink-muted">
      Como tratamos seus dados:{" "}
      <Link href="/privacidade" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-blue underline">
        Política de privacidade
      </Link>
      .
    </p>
  );
}

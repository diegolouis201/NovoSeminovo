"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { WarningCircle } from "@phosphor-icons/react";
import { LINK_POLITICA_PRIVACIDADE, type VersaoConsentimentoCredito } from "@novoseminovo/shared-types";

// Autorizações do crédito no formulário de pedido de proposta.
//
// 1) Consentimento de envio dos dados (CreditDataConsent): desde o parecer
//    jurídico LGPD de 17/11/2026 (item 3.1) o texto do advogado aparece
//    INTEIRO como o próprio rótulo da caixa, destacado, sem resumo e sem
//    "Ler texto completo"; a caixa começa desmarcada e o envio fica bloqueado
//    até marcar. O "[Política de Privacidade]" do parecer vira o link no fim
//    do texto. A versão vai junto no pedido (campo oculto consentVersion).
// 2) Termo SCR/BACEN da Creditas (ConsentCheckbox): exigência da Creditas,
//    fora do parecer — continua com o resumo curto e o texto completo
//    recolhido num <details> nativo.
// Os textos e as versões ficam só em shared-types (CONSENTIMENTO_CREDITO,
// TERMO_BACEN_CREDITAS); aqui é só apresentação.

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

export function CreditDataConsent({
  consentimento,
  errorMessage,
}: {
  consentimento: VersaoConsentimentoCredito;
  errorMessage: string;
}) {
  const [invalid, setInvalid] = useState(false);
  const inputId = useId();
  const errorId = useId();
  const { texto, versao } = consentimento;
  // O texto termina em "Política de Privacidade", que vira o link; o resto
  // fica exatamente como no parecer.
  const corpo = texto.endsWith(LINK_POLITICA_PRIVACIDADE.texto) ? texto.slice(0, -LINK_POLITICA_PRIVACIDADE.texto.length) : `${texto} `;
  return (
    <div
      data-testid="consentimento-dados"
      className="flex flex-col gap-1 rounded-brand border border-brand-blue/30 bg-brand-blue/5 p-3"
    >
      <div className="flex items-start gap-2">
        <input
          id={inputId}
          name="consent"
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
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-brand-green"
        />
        <label htmlFor={inputId} className="cursor-pointer text-[13px] leading-relaxed text-ink">
          {corpo}
          <Link
            href={LINK_POLITICA_PRIVACIDADE.href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-brand-blue underline"
          >
            {LINK_POLITICA_PRIVACIDADE.texto}
          </Link>
        </label>
      </div>
      <input type="hidden" name="consentVersion" value={versao} />
      {invalid && (
        <p id={errorId} className="ml-7 flex items-start gap-1 text-[11px] font-semibold text-status-danger">
          <WarningCircle size={14} weight="fill" aria-hidden="true" className="mt-px shrink-0" />
          {errorMessage}
        </p>
      )}
    </div>
  );
}

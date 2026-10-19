"use client";

import { useState, useTransition } from "react";
import { CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/Button";
import { sendEmailVerificationAction, verifyEmailCodeAction } from "@/lib/actions/profile";

export function EmailVerificationCard({ verified }: { verified: boolean }) {
  const [step, setStep] = useState<"idle" | "sent" | "verified">(verified ? "verified" : "idle");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSend() {
    setMessage(null);
    startTransition(async () => {
      const sent = await sendEmailVerificationAction();
      if (sent) {
        setStep("sent");
        setMessage("Código enviado — confira seu e-mail.");
      } else {
        setMessage("Verificação de e-mail está indisponível no momento.");
      }
    });
  }

  function handleVerify() {
    setMessage(null);
    startTransition(async () => {
      const result = await verifyEmailCodeAction(code);
      if (result.ok) {
        setStep("verified");
        setMessage(null);
      } else {
        setMessage(result.error ?? "Código inválido.");
      }
    });
  }

  if (step === "verified") {
    return (
      <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-green">
        <CheckCircle size={16} weight="fill" />
        E-mail verificado
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-brand border border-border bg-surface-sober p-3">
      <p className="text-sm font-semibold text-ink">E-mail ainda não verificado</p>
      {step === "idle" ? (
        <Button type="button" variant="secondary" onClick={handleSend} disabled={isPending} className="self-start">
          {isPending ? "Enviando..." : "Verificar e-mail"}
        </Button>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-ink-muted">Código de 6 dígitos</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              maxLength={6}
              inputMode="numeric"
              className="rounded-brand border border-border bg-surface-page px-3 py-2 text-sm text-ink"
            />
          </label>
          <Button type="button" variant="secondary" onClick={handleVerify} disabled={isPending || code.length !== 6}>
            {isPending ? "Confirmando..." : "Confirmar"}
          </Button>
        </div>
      )}
      {message && <p className="text-xs text-ink-muted">{message}</p>}
    </div>
  );
}

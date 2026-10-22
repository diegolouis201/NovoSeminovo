"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Buildings, User } from "@phosphor-icons/react";
import { CompanyCnpjFields } from "@/components/CompanyCnpjFields";
import { FormField } from "@/components/FormField";
import { registerAction, type RegisterState } from "@/lib/actions/auth";

// Criar conta: Pessoa física (anuncia carro e imóvel, planos por anúncio)
// ou Empresa (CNPJ decide se é imobiliária/construtora/corretor ou loja de
// veículos — e com isso o modelo de anúncio e os planos mensais).

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-brand bg-brand-green px-4 py-2.5 text-left font-semibold text-on-green hover:opacity-90 disabled:opacity-60">
      {pending ? "Criando a conta…" : "Criar conta"}
    </button>
  );
}

export function RegisterForm({ initialError }: { initialError?: string }) {
  const [accountType, setAccountType] = useState<"pf" | "pj">("pf");
  const [state, formAction] = useFormState<RegisterState, FormData>(registerAction, { error: initialError });
  const isCompany = accountType === "pj";

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Tipo de conta">
        {(
          [
            { id: "pf", icon: User, title: "Pessoa física", text: "Venda seu carro ou imóvel" },
            { id: "pj", icon: Buildings, title: "Empresa (CNPJ)", text: "Imobiliária, construtora, corretor, loja de veículos" },
          ] as const
        ).map((option) => {
          const selected = accountType === option.id;
          const Icon = option.icon;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setAccountType(option.id)}
              className={`flex flex-col items-start gap-1 rounded-brand border-2 p-3 text-left ${
                selected ? "border-brand-green bg-brand-green/10" : "border-border bg-surface-raised hover:bg-surface-sober"
              }`}
            >
              <Icon size={24} weight={selected ? "fill" : "regular"} className={selected ? "text-brand-green" : "text-ink-muted"} />
              <span className="font-semibold text-ink">{option.title}</span>
              <span className="text-xs text-ink-muted">{option.text}</span>
            </button>
          );
        })}
      </div>
      <input type="hidden" name="accountType" value={accountType} />

      {state.error && (
        <p role="alert" className="rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
          {state.error}
        </p>
      )}

      {isCompany && (
        <>
          <CompanyCnpjFields />
          <p className="mt-2 text-sm font-semibold text-ink">Dados do responsável pela conta</p>
        </>
      )}

      <FormField label={isCompany ? "Nome do responsável" : "Nome"} name="name" />
      <FormField label="E-mail" name="email" type="email" />
      <div className="flex flex-col gap-1">
        <FormField label={isCompany ? "CPF do responsável" : "CPF"} name="cpf" placeholder="000.000.000-00" />
        <p className="text-xs text-ink-muted">Uma conta por pessoa, para a segurança de todos. O CPF nunca aparece no site.</p>
      </div>
      <FormField label="WhatsApp" name="phone" type="tel" required={false} placeholder="(31) 99999-8888" />
      <FormField label="Senha" name="password" type="password" />
      <Submit />
    </form>
  );
}

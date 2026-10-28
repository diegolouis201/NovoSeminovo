"use client";

import { useFormState, useFormStatus } from "react-dom";
import { deleteMyAccountAction, type DeleteAccountState } from "@/lib/actions/delete-account";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-brand bg-status-danger px-5 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Excluindo…" : "Excluir minha conta"}
    </button>
  );
}

export function DeleteAccountForm() {
  const [state, action] = useFormState<DeleteAccountState, FormData>(deleteMyAccountAction, {});
  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
        Sua senha
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="rounded-brand border border-border bg-surface-page px-4 py-3 text-base font-normal"
        />
      </label>
      <label className="flex items-start gap-2 text-sm text-ink">
        <input name="confirm" type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-status-danger" />
        Entendi que a exclusão é definitiva e não dá para desfazer.
      </label>
      {state.error && (
        <p role="alert" className="rounded-brand bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
          {state.error}
        </p>
      )}
      <div>
        <Submit />
      </div>
    </form>
  );
}

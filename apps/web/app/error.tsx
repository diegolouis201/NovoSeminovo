"use client";

import Link from "next/link";
import { useEffect } from "react";

// Falha inesperada ou API fora do ar (ver ApiUnavailableError em lib/api.ts)
// — melhor um aviso honesto com "tentar de novo" do que uma página quebrada
// ou, pior, dados de exemplo no lugar dos anúncios reais.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-16 text-center">
      <p className="font-display text-5xl font-bold text-brand-orange">Eita!</p>
      <h1 className="mt-4 font-display text-2xl font-semibold text-ink">Estamos com uma instabilidade</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Não conseguimos carregar esta página agora. Tente de novo em alguns instantes — se continuar, fale com a gente pelo
        WhatsApp.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-brand bg-brand-green px-5 py-3 text-sm font-bold text-on-green"
        >
          Tentar de novo
        </button>
        <Link href="/" className="rounded-brand border border-border px-5 py-3 text-sm font-bold text-ink hover:bg-surface-sober">
          Página inicial
        </Link>
      </div>
    </main>
  );
}

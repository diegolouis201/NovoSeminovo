"use client";

import { useState } from "react";

// Bloco que abre e fecha e continua aberto depois de salvar (o <details>
// comum fecha quando a página se atualiza e esconde a confirmação).
export function Expandir({ titulo, children, inicial = false, className = "", tituloClasse = "h2" }: { titulo: string; children: React.ReactNode; inicial?: boolean; className?: string; tituloClasse?: string }) {
  const [aberto, setAberto] = useState(inicial);
  return (
    <div className={className}>
      <button type="button" aria-expanded={aberto} onClick={() => setAberto(!aberto)} className={`${tituloClasse} flex items-center gap-2 text-left`}>
        <span className={`inline-block transition ${aberto ? "rotate-90" : ""}`}>▸</span> {titulo}
      </button>
      {aberto ? children : null}
    </div>
  );
}

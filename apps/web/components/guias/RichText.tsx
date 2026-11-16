import { Fragment } from "react";

// Texto dos guias (lib/guias.ts) com **negrito**. Vira elementos React —
// nunca HTML cru — então nada no texto é interpretado como código.
export function RichText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <strong key={index} className="font-bold text-ink">
            {part}
          </strong>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/** Texto sem a marcação de negrito (para o JSON-LD). */
export function plainText(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1");
}

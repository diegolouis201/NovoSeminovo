import { OpsReportLayoutSchema, type OpsReportBlock, type OpsReportLayout, type OpsReportNumber } from "@novoseminovo/shared-types";

// Monta o relatório em formato de painel a partir do que o agente escreveu.
// Listas vazias somem; o texto longo vira "detalhes" (fica recolhido na tela).
export function buildReportLayout(input: {
  manchete: string;
  numeros?: OpsReportNumber[];
  detalhes?: string;
  blocos: OpsReportBlock[];
}): OpsReportLayout {
  return OpsReportLayoutSchema.parse({
    manchete: input.manchete,
    numeros: input.numeros ?? [],
    blocos: input.blocos.filter((bloco) => bloco.itens.length > 0),
    detalhes: input.detalhes || undefined,
  });
}

// Versão em texto (e-mail, histórico): mesma ordem da tela.
export function reportLayoutText(layout: OpsReportLayout): string {
  const lines = [layout.manchete];
  if (layout.numeros.length) lines.push("", ...layout.numeros.map((n) => `${n.rotulo}: ${n.valor}`));
  for (const bloco of layout.blocos) {
    lines.push("", `${bloco.titulo}:`, ...bloco.itens.map((item, i) => (bloco.tipo === "acao" ? `${i + 1}. ${item}` : `• ${item}`)));
  }
  if (layout.detalhes) lines.push("", layout.detalhes);
  return lines.join("\n");
}

// Lê o layout gravado no banco (campo JSON). Relatório antigo ou dado
// fora do formato devolve undefined e a tela mostra o texto.
export function readReportLayout(data: unknown): OpsReportLayout | undefined {
  if (!data || typeof data !== "object") return undefined;
  const parsed = OpsReportLayoutSchema.safeParse((data as { layout?: unknown }).layout);
  return parsed.success ? parsed.data : undefined;
}

// Parte visual do "Resumo do dia" (e-mail do Diretor): metas com barra de
// progresso, números das últimas 24h e listas curtas. Os números vêm do
// sistema (GoalsService e contagens no banco), nunca do texto do agente; o
// texto do agente só aparece nas listas, sempre escapado.
// Tudo em <table> com estilo inline, que é o que Gmail e Outlook respeitam.

export type DailyReportGoal = { label: string; segment: string; current: number; target: number; money: boolean; stock: boolean };

export type DailyReport = {
  dayOfMonth: number;
  daysInMonth: number;
  goals: DailyReportGoal[];
  last24h: { cadastros: number; anuncios: number; leads: number; financiamentos: number };
  highlights: string[];
  risks: string[];
  priorities: string[];
};

const GREEN = "#76b82a";
const ORANGE = "#f18e29";
const RED = "#d64545";
const NAVY = "#0e2f4a";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatValue(value: number, money: boolean): string {
  return money
    ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
    : value.toLocaleString("pt-BR");
}

const SEGMENT_LABEL: Record<string, string> = { vehicle: "carros", property: "imóveis" };

// Verde: no ritmo (ou acima). Laranja: até 40% abaixo do ritmo. Vermelho: pior.
// Estoque (anúncios ativos) não acumula no mês, então compara direto com a meta.
export function goalStatus(goal: DailyReportGoal, dayOfMonth: number, daysInMonth: number): { color: string; label: string } {
  if (goal.target <= 0) return { color: GREEN, label: "No ritmo" };
  const expected = goal.stock ? goal.target : (goal.target * dayOfMonth) / daysInMonth;
  const ratio = expected > 0 ? goal.current / expected : 1;
  if (goal.current >= goal.target) return { color: GREEN, label: "Meta batida" };
  if (ratio >= 1) return { color: GREEN, label: "No ritmo" };
  if (ratio >= 0.6) return { color: ORANGE, label: "Um pouco abaixo" };
  return { color: RED, label: "Em risco" };
}

function sectionTitle(text: string): string {
  return `<p style="margin: 24px 0 10px; font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #006aa4;">${text}</p>`;
}

function goalRow(goal: DailyReportGoal, report: DailyReport): string {
  const status = goalStatus(goal, report.dayOfMonth, report.daysInMonth);
  const percent = goal.target > 0 ? Math.round((goal.current / goal.target) * 100) : 0;
  const width = Math.max(2, Math.min(100, percent));
  const segment = SEGMENT_LABEL[goal.segment] ? ` · ${SEGMENT_LABEL[goal.segment]}` : "";
  return `<tr><td style="padding: 0 0 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="font-size: 14px; color: #333;">${escapeHtml(goal.label)}${segment}</td>
    <td align="right" style="font-size: 12px; font-weight: 700; color: ${status.color}; white-space: nowrap;">● ${status.label}</td>
  </tr></table>
  <p style="margin: 4px 0 6px; font-size: 20px; font-weight: 700; color: ${NAVY};">${formatValue(goal.current, goal.money)} <span style="font-size: 13px; font-weight: 400; color: #888;">de ${formatValue(goal.target, goal.money)} (${percent}%)</span></p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #e8edf1; border-radius: 999px;"><tr>
    <td width="${width}%" style="background: ${status.color}; height: 8px; border-radius: 999px; font-size: 0; line-height: 0;">&nbsp;</td>
    ${width < 100 ? `<td style="font-size: 0; line-height: 0;">&nbsp;</td>` : ""}
  </tr></table>
</td></tr>`;
}

function statTiles(last24h: DailyReport["last24h"]): string {
  const tiles: Array<[string, number]> = [
    ["Cadastros", last24h.cadastros],
    ["Anúncios novos", last24h.anuncios],
    ["Leads", last24h.leads],
    ["Financiamentos", last24h.financiamentos],
  ];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
${tiles
  .map(
    ([label, value]) => `<td width="25%" style="padding: 0 3px;"><div style="background: #eef3f6; border-radius: 12px; padding: 12px 6px; text-align: center;">
  <p style="margin: 0; font-size: 24px; font-weight: 700; color: ${NAVY};">${value.toLocaleString("pt-BR")}</p>
  <p style="margin: 2px 0 0; font-size: 11px; color: #666;">${label}</p>
</div></td>`,
  )
  .join("\n")}
</tr></table>`;
}

function list(items: string[], marker: (index: number) => string, color: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${items
  .map(
    (item, index) => `<tr><td width="28" valign="top" style="padding: 0 0 10px; font-size: 14px; font-weight: 700; color: ${color};">${marker(index)}</td>
<td style="padding: 0 0 10px; font-size: 14px; line-height: 1.5; color: #333;">${escapeHtml(item)}</td></tr>`,
  )
  .join("\n")}
</table>`;
}

export function renderDailyReportHtml(report: DailyReport): string {
  const parts: string[] = [];
  parts.push(sectionTitle("Últimas 24 horas"), statTiles(report.last24h));
  if (report.goals.length) {
    parts.push(
      sectionTitle(`Metas do mês · dia ${report.dayOfMonth} de ${report.daysInMonth}`),
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${report.goals.map((goal) => goalRow(goal, report)).join("\n")}</table>`,
    );
  }
  if (report.highlights.length) parts.push(sectionTitle("Destaques"), list(report.highlights, () => "✓", GREEN));
  if (report.risks.length) parts.push(sectionTitle("Atenção"), list(report.risks, () => "!", RED));
  if (report.priorities.length) parts.push(sectionTitle("Prioridades de hoje"), list(report.priorities, (index) => `${index + 1}.`, ORANGE));
  return parts.join("\n");
}

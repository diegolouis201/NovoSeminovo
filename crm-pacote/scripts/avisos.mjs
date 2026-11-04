// Gera os avisos inteligentes do dia em relatorios/avisos-AAAA-MM-DD.md.
// Uso: node scripts/avisos.mjs   (rodar depois de sincronizar.mjs)
import { buildAlerts } from "./avisos-regras.mjs";
import { env, iso, readJson, sectorCalendar, today, writeText } from "./lib.mjs";

const feed = readJson("dados/clientes.json");
if (!feed) {
  console.error("Rode antes: node scripts/sincronizar.mjs");
  process.exit(1);
}
const marcacoes = readJson("dados/marcacoes.json", {});
const hoje = today();
const ordens = readJson("dados/ordens.json", []);
const alerts = buildAlerts(feed, marcacoes, sectorCalendar(), hoje, ordens, { apiBase: env("NSN_API") ?? "https://api.novoseminovo.com.br" });
const TITLE = { urgente: "Urgente", oportunidade: "Oportunidades", acompanhar: "Acompanhar" };
let md = `# Avisos de ${iso(hoje).split("-").reverse().join("/")}\n\n`;
for (const level of ["urgente", "oportunidade", "acompanhar"]) {
  const list = alerts.filter((a) => a.nivel === level);
  md += `## ${TITLE[level]} (${list.length})\n\n`;
  if (!list.length) md += "Nada.\n\n";
  list.forEach((a, i) => {
    md += `${i + 1}. ${a.importante ? "⭐ " : ""}${a.texto}\n`;
    if (a.ordem) md += `   - Ordem sugerida (${a.ordem.area}): ${a.ordem.titulo}\n`;
  });
  md += "\n";
}
writeText(`relatorios/avisos-${iso(hoje)}.md`, md);
writeText("relatorios/avisos-ultimos.json", JSON.stringify(alerts, null, 2));
console.log(md);

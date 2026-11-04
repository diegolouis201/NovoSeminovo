// Manda uma ordem do CRM para uma área. Sem --enviar, só mostra a prévia.
// Uso:
//   node scripts/ordem.mjs --area comercial --titulo "Ligar para a loja X" [--detalhes "..."]
//        [--empresa <empresaId>] [--card <cardId>] [--prioridade alta] [--prazo 2026-11-10] --enviar
// Áreas: comercial, atendimento, financeiro, marketing, operacoes.
import { api, args } from "./lib.mjs";

const o = args();
const AREAS = ["comercial", "atendimento", "financeiro", "marketing", "operacoes"];
if (!AREAS.includes(o.area) || !o.titulo) {
  console.error(`Uso: node scripts/ordem.mjs --area ${AREAS.join("|")} --titulo "..." [--detalhes "..."] [--empresa id] [--card id] [--prioridade alta] [--prazo AAAA-MM-DD] --enviar`);
  process.exit(1);
}
const body = {
  area: o.area,
  titulo: String(o.titulo),
  detalhes: o.detalhes ? String(o.detalhes) : undefined,
  prioridade: o.prioridade === "alta" ? "alta" : "normal",
  prazo: o.prazo ? `${o.prazo}T18:00:00-03:00` : undefined,
  empresaId: o.empresa ? String(o.empresa) : undefined,
  cardId: o.card ? String(o.card) : undefined,
};
if (!o.enviar) {
  console.log("PRÉVIA (nada foi enviado):");
  console.log(JSON.stringify(body, null, 2));
  console.log("Para enviar, rode de novo com --enviar.");
  process.exit(0);
}
const ordem = await api("/crm/ordens", { method: "POST", body });
console.log(`Ordem enviada para ${ordem.area}${ordem.agentTaskId ? " (o agente de IA da área também recebeu)" : ""}: ${ordem.titulo}`);

// Lista as ordens e o que cada área fez.
// Uso: node scripts/ordens.mjs [--status aberta|feita|cancelada]
import { api, args } from "./lib.mjs";

const o = args();
const lista = await api(`/crm/ordens${o.status ? `?status=${encodeURIComponent(o.status)}` : ""}`);
if (!lista.length) console.log("Nenhuma ordem.");
for (const ordem of lista) {
  const data = new Date(ordem.criadaEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  console.log(`[${ordem.status.toUpperCase()}] ${data} · ${ordem.area} · ${ordem.titulo}${ordem.empresa ? ` · ${ordem.empresa}` : ""}`);
  if (ordem.resultado) console.log(`   Resultado (${ordem.feitaPor ?? "?"}): ${ordem.resultado}`);
  else if (ordem.agenteStatus) console.log(`   Agente de IA: ${ordem.agenteStatus}`);
}

// Gera relatorios/painel.html com todas as telas do CRM (Visão geral,
// Receitas, Empresas, Prospecção, Avisos, Ordens, Agenda) a partir do que já
// foi baixado em dados/. Abre no navegador, sem internet.
// Uso: node scripts/painel.mjs   (o sincronizar.mjs já roda no final)
import { path, readJson, sectorCalendar, writeText } from "./lib.mjs";
import { renderPainel } from "./painel-html.mjs";

const feed = readJson("dados/clientes.json", undefined);
if (!feed) {
  console.log("Ainda não há dados. Rode primeiro: node scripts/sincronizar.mjs");
  process.exit(0);
}
const html = renderPainel({
  feed,
  receitas: readJson("dados/receitas.json", undefined),
  ordens: readJson("dados/ordens.json", []),
  avisos: readJson("relatorios/avisos-ultimos.json", []),
  marcacoes: readJson("dados/marcacoes.json", {}),
  jornada: readJson("dados/jornada.json", []),
  calendario: sectorCalendar(),
  hoje: new Date(),
});
writeText("relatorios/painel.html", html);
console.log(`Painel atualizado: ${path("relatorios", "painel.html")}`);
console.log("Para abrir no Windows: start relatorios\\painel.html");

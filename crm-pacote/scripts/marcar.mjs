// Marcações locais de uma empresa ou card (ficam só neste computador).
// Uso:
//   node scripts/marcar.mjs <id> importante "motivo"
//   node scripts/marcar.mjs <id> nao-contatar "pediu para não receber mensagens"
//   node scripts/marcar.mjs <id> tag vip
//   node scripts/marcar.mjs <id> nota "Prefere contato por e-mail"
//   node scripts/marcar.mjs <id> limpar
// <id> = empresaId ou cardId de dados/clientes.json (ou o CNPJ da empresa).
import { args, readJson, writeJson } from "./lib.mjs";

const { _: [rawId, acao, ...resto] } = args();
if (!rawId || !acao) {
  console.error('Uso: node scripts/marcar.mjs <id|cnpj> importante|nao-contatar|tag|nota|limpar "texto"');
  process.exit(1);
}
const feed = readJson("dados/clientes.json", { empresas: [], prospeccao: [] });
const digits = rawId.replace(/\D/g, "");
const empresa = feed.empresas.find((e) => e.id === rawId || e.cardId === rawId || (digits.length === 14 && e.cnpj === digits));
const id = empresa?.id ?? rawId;
const texto = resto.join(" ").trim();
const marcacoes = readJson("dados/marcacoes.json", {});
const atual = marcacoes[id] ?? { tags: [], notas: [] };
const agora = new Date().toISOString();
if (acao === "importante") Object.assign(atual, { importante: true, motivoImportante: texto || undefined });
else if (acao === "nao-contatar") Object.assign(atual, { naoContatar: true, motivoNaoContatar: texto || undefined, naoContatarEm: agora });
else if (acao === "tag" && texto) atual.tags = [...new Set([...(atual.tags ?? []), texto.toLowerCase()])];
else if (acao === "nota" && texto) atual.notas = [...(atual.notas ?? []), { data: agora, texto }];
else if (acao === "limpar") delete marcacoes[id];
else {
  console.error("Ação desconhecida ou sem texto.");
  process.exit(1);
}
if (acao !== "limpar") marcacoes[id] = { ...atual, nome: empresa?.nome ?? atual.nome, atualizadoEm: agora };
writeJson("dados/marcacoes.json", marcacoes);
console.log(`Marcação salva para ${empresa?.nome ?? id}.`);

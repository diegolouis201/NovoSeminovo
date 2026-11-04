// Relatório de higiene de dados em relatorios/higiene-AAAA-MM-DD.md.
// Uso: node scripts/higiene.mjs   (rodar depois de sincronizar.mjs)
import { checkHygiene } from "./higiene-regras.mjs";
import { iso, readJson, today, writeText } from "./lib.mjs";

const feed = readJson("dados/clientes.json");
if (!feed) {
  console.error("Rode antes: node scripts/sincronizar.mjs");
  process.exit(1);
}
const problemas = checkHygiene(feed, readJson("dados/marcacoes.json", {}), today());
const TITLE = {
  duplicado: "Possíveis duplicados",
  sem_telefone: "Sem telefone",
  sem_contato: "Sem contato",
  email_invalido: "E-mail inválido",
  sem_cidade: "Sem cidade",
  receita_pendente: "Receita pendente",
  sem_dono: "Sem vendedor responsável",
  card_esquecido: "Cards esquecidos",
  importante_sem_aniversario: "Importantes sem aniversário de sócio",
  marcacao_orfa: "Marcações órfãs",
};
let md = `# Higiene de dados — ${iso(today()).split("-").reverse().join("/")}\n\n${problemas.length ? `${problemas.length} ponto(s) para corrigir.` : "Base limpa."}\n\n`;
for (const [tipo, titulo] of Object.entries(TITLE)) {
  const list = problemas.filter((p) => p.tipo === tipo);
  if (!list.length) continue;
  md += `## ${titulo} (${list.length})\n\n${list.map((p) => `- ${p.texto}`).join("\n")}\n\n`;
}
writeText(`relatorios/higiene-${iso(today())}.md`, md);
console.log(md);

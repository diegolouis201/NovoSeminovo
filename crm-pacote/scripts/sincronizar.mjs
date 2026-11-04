// Baixa do site a jornada de todas as empresas, as ordens e as receitas, guarda em dados/
// e registra o que mudou desde a última vez (dados/jornada.json).
// Uso: node scripts/sincronizar.mjs
import { api, iso, readJson, today, writeJson } from "./lib.mjs";
import { spawnSync as rodar } from "node:child_process";
import { path as caminhoDoCrm } from "./lib.mjs";

// Primeiro, atualiza os programas e as instruções do CRM (vale a partir da próxima vez).
rodar(process.execPath, [caminhoDoCrm("scripts", "atualizar.mjs")], { stdio: "inherit" });

const before = readJson("dados/clientes.json", { empresas: [], prospeccao: [] });
const feed = await api("/crm/clientes");
const ordens = await api("/crm/ordens");
const receitas = await api("/crm/receitas");
writeJson("dados/clientes.json", feed);
writeJson("dados/ordens.json", ordens);
writeJson("dados/receitas.json", receitas);
writeJson(`dados/historico/${iso(today())}.json`, feed);

// Jornada: mudanças de etapa, de plano e empresas novas.
const jornada = readJson("dados/jornada.json", []);
const old = new Map(before.empresas.map((e) => [e.id, e]));
const agora = new Date().toISOString();
let novidades = 0;
for (const e of feed.empresas) {
  const prev = old.get(e.id);
  const push = (evento) => {
    jornada.push({ data: agora, empresaId: e.id, empresa: e.nome, evento });
    novidades++;
  };
  if (!prev) push(`Entrou no CRM (${e.etapa.nome})`);
  else {
    if (prev.etapa?.id !== e.etapa.id) push(`Etapa: ${prev.etapa?.nome ?? "?"} → ${e.etapa.nome}`);
    if ((prev.plano?.status ?? "sem plano") !== (e.plano?.status ?? "sem plano") || prev.plano?.nome !== e.plano?.nome) {
      push(`Plano: ${prev.plano ? `${prev.plano.nome} (${prev.plano.status})` : "sem plano"} → ${e.plano ? `${e.plano.nome} (${e.plano.status})` : "sem plano"}`);
    }
    if (e.nps && prev.nps?.data !== e.nps.data) push(`NPS: nota ${e.nps.nota} (${e.nps.classificacao})${e.nps.comentario ? ` — "${e.nps.comentario}"` : ""}`);
    if ((e.chamados?.total ?? 0) > (prev.chamados?.total ?? 0)) push(`Chamado de suporte aberto: ${e.chamados.ultimoAssunto ?? ""}`);
    if ((prev.chamados?.abertos ?? 0) > (e.chamados?.abertos ?? 0)) push("Chamado de suporte resolvido");
    if ((prev.pagamentos?.quantidade ?? 0) < (e.pagamentos?.quantidade ?? 0)) push(`Pagamento recebido (total pago R$ ${e.pagamentos.totalPago.toFixed(2).replace(".", ",")})`);
  }
}
writeJson("dados/jornada.json", jornada.slice(-20000));

const abertas = ordens.filter((o) => o.status === "aberta").length;
console.log(`Sincronizado: ${feed.empresas.length} empresas, ${feed.prospeccao.length} em prospecção, ${abertas} ordem(ns) aberta(s), ${novidades} novidade(s) na jornada.`);

// Atualiza os avisos e o painel (relatorios/painel.html) com os dados novos.
import { spawnSync } from "node:child_process";
import { path as caminho } from "./lib.mjs";
spawnSync(process.execPath, [caminho("scripts", "avisos.mjs")], { stdio: "ignore" });
spawnSync(process.execPath, [caminho("scripts", "painel.mjs")], { stdio: "inherit" });

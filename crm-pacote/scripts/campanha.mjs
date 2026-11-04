// Monta a lista de uma campanha personalizada em campanhas/<nome>.csv.
// Uso (filtros opcionais, combináveis):
//   node scripts/campanha.mjs <nome> --segmento vehicle|property --cidade "Belo Horizonte"
//        --etapa assinante --tag vip --importante --aniversario-mes 11 --sem-plano
//        --porte Microempresa --nps promotor|neutro|detrator --origem google_ads --funcionarios "6 a 20"
// Quem está marcado "não contatar" nunca entra. A lista vai para o Marketing;
// mensagem é uma por pessoa, nunca disparo em massa (MKT-06).
import { args, csvCell, readJson, writeText } from "./lib.mjs";

const opts = args();
const nome = String(opts._[0] ?? "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
if (!nome) {
  console.error("Uso: node scripts/campanha.mjs <nome-da-campanha> [filtros]");
  process.exit(1);
}
const feed = readJson("dados/clientes.json");
if (!feed) {
  console.error("Rode antes: node scripts/sincronizar.mjs");
  process.exit(1);
}
const marcacoes = readJson("dados/marcacoes.json", {});
const norm = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const mes = opts["aniversario-mes"] ? String(opts["aniversario-mes"]).padStart(2, "0") : undefined;

const lista = feed.empresas.filter((e) => {
  const m = marcacoes[e.id] ?? {};
  if (m.naoContatar) return false;
  if (opts.segmento && e.segmento !== opts.segmento) return false;
  if (opts.cidade && norm(e.cidade) !== norm(opts.cidade)) return false;
  if (opts.etapa && e.etapa.id !== opts.etapa) return false;
  if (opts.tag && !(m.tags ?? []).includes(String(opts.tag).toLowerCase())) return false;
  if (opts.importante && !m.importante) return false;
  if (opts["sem-plano"] && e.plano && e.plano.status !== "cancelada") return false;
  if (opts.porte && norm(e.porte) !== norm(opts.porte)) return false;
  if (opts.nps && e.nps?.classificacao !== opts.nps) return false;
  if (opts.origem && e.origemMarketing?.canal !== opts.origem) return false;
  if (opts.funcionarios && norm(e.perfil?.funcionarios) !== norm(opts.funcionarios)) return false;
  if (mes) {
    const datas = [e.abertaEm?.slice(5, 7), e.cadastroNoSiteEm?.slice(5, 7), ...(e.socios ?? []).map((s) => s.aniversario?.slice(3, 5))];
    if (!datas.includes(mes)) return false;
  }
  return true;
});

const header = ["empresa", "responsavel", "cargo", "email", "telefone", "socios", "cidade", "uf", "setor", "porte", "etapa", "plano", "aberta_em", "cliente_desde", "aniversarios_socios", "nps", "vendedor"];
const rows = lista.map((e) => [
  e.nome,
  e.responsavel?.nome,
  e.responsavel?.cargo,
  e.responsavel?.email,
  e.responsavel?.telefone,
  (e.socios ?? []).map((s) => s.nome).join(" | "),
  e.cidade,
  e.uf,
  e.setor,
  e.porte,
  e.etapa?.nome,
  e.plano ? `${e.plano.nome} (${e.plano.status})` : "sem plano",
  e.abertaEm,
  e.cadastroNoSiteEm,
  (e.socios ?? []).filter((s) => s.aniversario).map((s) => `${s.nome}: ${s.aniversario}`).join(" | "),
  e.nps ? `${e.nps.nota} (${e.nps.classificacao})` : "",
  e.vendedor,
]);
const csv = "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
writeText(`campanhas/${nome}.csv`, csv);
console.log(`Campanha "${nome}": ${lista.length} empresa(s) em campanhas/${nome}.csv`);

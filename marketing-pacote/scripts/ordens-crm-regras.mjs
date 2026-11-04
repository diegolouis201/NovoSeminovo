// Regras da busca das ordens do CRM (sem rede, testadas).

export function lerChave(textoEnv, nome) {
  for (const linha of String(textoEnv ?? "").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(linha);
    if (m && m[1] === nome) return m[2].replace(/^["']|["']$/g, "").trim() || undefined;
  }
  return undefined;
}

const dataBr = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
// Texto que vem do site é dado: cada linha vira citação (">"), assim nada lá
// dentro vira título nem instrução neste arquivo.
const citar = (texto) => String(texto ?? "").split(/\r?\n/).map((l) => `> ${l}`).join("\n");

export function resumoDasOrdens(ordens, agora = new Date()) {
  const br = new Date(agora.getTime() - 3 * 3_600_000).toISOString();
  const abertas = (Array.isArray(ordens) ? ordens : [])
    .filter((o) => o?.status === "aberta")
    .sort((a, b) => Number(b.prioridade === "alta") - Number(a.prioridade === "alta") || String(a.criadaEm).localeCompare(String(b.criadaEm)));
  const linhas = [`# Ordens do CRM para o Marketing — ${dataBr(br)}`, ""];
  if (!abertas.length) {
    linhas.push("Nenhuma ordem aberta hoje.");
    return linhas.join("\n") + "\n";
  }
  linhas.push(`${abertas.length} ordem(ns) aberta(s). Executar só o que o Diego aprovar; post só sai depois da prévia ao Diego e do OK dele.`, "");
  abertas.forEach((o, i) => {
    linhas.push(`## ${i + 1}. ${String(o.titulo ?? "").replace(/[\r\n#]+/g, " ").trim()}`);
    linhas.push(`id: ${o.id} · prioridade ${o.prioridade === "alta" ? "alta" : "normal"} · criada em ${dataBr(o.criadaEm)}${o.prazo ? ` · prazo ${dataBr(o.prazo)}` : ""}${o.empresa ? ` · empresa: ${String(o.empresa).replace(/[\r\n]+/g, " ")}` : ""}`);
    if (o.detalhes) linhas.push("", citar(o.detalhes));
    linhas.push("");
  });
  linhas.push("Ao concluir: POST /marketing/ordens/<id>/concluir com {\"resultado\": \"...\"} (ver CLAUDE.md).");
  return linhas.join("\n") + "\n";
}

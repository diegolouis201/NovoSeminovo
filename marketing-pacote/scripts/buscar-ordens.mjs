// Busca as ordens abertas do CRM para o Marketing e salva o resumo do dia em
// ordens-crm/ordens-do-dia.md (e a lista completa em ordens-crm/ordens.json).
// Roda sozinho às 07:30 (agendar-busca-ordens.cmd). Uso: node scripts/buscar-ordens.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lerChave, resumoDasOrdens } from "./ordens-crm-regras.mjs";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = existsSync(join(raiz, ".env")) ? readFileSync(join(raiz, ".env"), "utf8") : "";
const chave = process.env.NSN_FEED_KEY ?? lerChave(env, "NSN_FEED_KEY");
const api = (process.env.NSN_API ?? lerChave(env, "NSN_API") ?? "https://api.novoseminovo.com.br").replace(/\/$/, "");
if (!chave) {
  console.log("Falta NSN_FEED_KEY no .env do Marketing.");
  process.exit(1);
}
try {
  const res = await fetch(`${api}/marketing/ordens`, { headers: { Authorization: `Bearer ${chave}` }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`o site respondeu ${res.status}`);
  const ordens = await res.json();
  mkdirSync(join(raiz, "ordens-crm"), { recursive: true });
  writeFileSync(join(raiz, "ordens-crm", "ordens.json"), JSON.stringify(ordens, null, 2));
  writeFileSync(join(raiz, "ordens-crm", "ordens-do-dia.md"), resumoDasOrdens(ordens));
  const abertas = ordens.filter((o) => o.status === "aberta").length;
  console.log(`Ordens do CRM: ${abertas} aberta(s). Resumo em ordens-crm/ordens-do-dia.md`);
} catch (erro) {
  console.log(`Não consegui buscar as ordens agora (${erro.message}).`);
  process.exit(1);
}

// Atualiza os programas e as instruções deste CRM com a versão que está no
// site (mesma chave do .env). Não mexe no .env, nos dados nem nos relatórios.
// Roda sozinho no começo de cada sincronização. Uso: node scripts/atualizar.mjs
import { existsSync, readFileSync } from "node:fs";
import { api, path, readJson, writeJson, writeText } from "./lib.mjs";
import { planejarAtualizacao } from "./atualizar-regras.mjs";

try {
  const pacote = await api("/crm/pacote");
  const plano = planejarAtualizacao(pacote, (caminho) => (existsSync(path(caminho)) ? readFileSync(path(caminho), "utf8") : undefined));
  for (const a of plano.escrever) writeText(a.caminho, a.conteudo);
  const anterior = readJson("dados/versao-crm.json", {});
  writeJson("dados/versao-crm.json", { versao: plano.versao, atualizadoEm: new Date().toISOString() });
  if (plano.recusados.length) console.log(`Atualização: ${plano.recusados.length} arquivo(s) recusado(s) por segurança: ${plano.recusados.join(", ")}`);
  console.log(plano.escrever.length ? `CRM atualizado para a versão ${plano.versao} (${plano.escrever.length} arquivo(s) novos ou alterados).` : `CRM já está na versão mais nova (${plano.versao ?? anterior.versao ?? "?"}).`);
} catch (erro) {
  // Sem atualização hoje (site fora do ar, versão antiga do site): segue com a versão atual.
  console.log(`Não consegui atualizar o CRM agora (${erro.message}). Seguindo com a versão atual.`);
}

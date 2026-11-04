// Regras da atualização automática do CRM: o que pode ser escrito nesta
// pasta a partir do pacote que o site entrega. Só programas (scripts/*.mjs) e
// instruções (CLAUDE.md, README.md, docs/*.md|csv...). Nunca o .env, dados de
// clientes, relatórios, campanhas ou .cmd. Arquivo com resumo (sha256) que não
// confere é recusado.
import { createHash } from "node:crypto";

const RAIZ = new Set(["CLAUDE.md", "README.md", "PRIMEIRA-TAREFA.md", ".env.exemplo", ".gitignore"]);
const PASTAS = { scripts: /^[a-z0-9-]+(\.test)?\.mjs$/, docs: /^[a-z0-9-]+\.(md|csv)$/ };

export function caminhoPermitido(caminho) {
  if (typeof caminho !== "string" || caminho.includes("\\") || caminho.includes("..") || caminho.startsWith("/")) return false;
  const partes = caminho.split("/");
  if (partes.length === 1) return RAIZ.has(caminho);
  if (partes.length === 2) return Boolean(PASTAS[partes[0]]?.test(partes[1]));
  return false;
}

export function planejarAtualizacao(pacote, lerLocal) {
  const escrever = [];
  const recusados = [];
  const arquivos = Array.isArray(pacote?.arquivos) ? pacote.arquivos : [];
  for (const a of arquivos) {
    const caminho = a?.caminho;
    if (!caminhoPermitido(caminho) || typeof a.conteudo !== "string") {
      recusados.push(String(caminho));
      continue;
    }
    const sha = createHash("sha256").update(a.conteudo).digest("hex");
    if (sha !== a.sha256) {
      recusados.push(caminho);
      continue;
    }
    if (lerLocal(caminho) !== a.conteudo) escrever.push({ caminho, conteudo: a.conteudo });
  }
  return { versao: pacote?.versao, escrever, recusados };
}

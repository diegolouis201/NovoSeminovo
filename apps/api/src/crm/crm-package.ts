import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

// Pacote do repositório do CRM (pasta crm-pacote/ do projeto), entregue pelo
// site com a chave do CRM para o CRM no computador do Diego se atualizar
// sozinho. Só programas e instruções: nunca .env, dados de clientes,
// relatórios, campanhas ou .cmd (o Windows pode estar rodando o .cmd).

export type CrmPackageFile = { caminho: string; sha256: string; conteudo: string };
export type CrmPackage = { versao: string; arquivos: CrmPackageFile[] };

const ROOT_FILES = new Set(["CLAUDE.md", "README.md", "PRIMEIRA-TAREFA.md", ".env.exemplo", ".gitignore"]);
const DIRS: Record<string, RegExp> = { scripts: /^[a-z0-9-]+(\.test)?\.mjs$/, docs: /^[a-z0-9-]+\.(md|csv)$/ };
const MAX_FILE_BYTES = 512 * 1024;

export const defaultCrmPackageDir = () => process.env.CRM_PACKAGE_DIR ?? resolve(__dirname, "../../../../crm-pacote");

export function allowedCrmPath(caminho: string): boolean {
  const parts = caminho.split("/");
  if (parts.length === 1) return ROOT_FILES.has(caminho);
  if (parts.length === 2) return Boolean(DIRS[parts[0]!]?.test(parts[1]!));
  return false;
}

export function buildCrmPackage(dir: string = defaultCrmPackageDir()): CrmPackage {
  const arquivos: CrmPackageFile[] = [];
  if (existsSync(dir)) {
    const candidates = [...ROOT_FILES].map((f) => join(dir, f));
    for (const sub of Object.keys(DIRS)) {
      const subDir = join(dir, sub);
      if (existsSync(subDir)) for (const f of readdirSync(subDir)) candidates.push(join(subDir, f));
    }
    for (const full of candidates) {
      if (!existsSync(full)) continue;
      const stat = statSync(full);
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) continue;
      const caminho = relative(dir, full).split(sep).join("/");
      if (!allowedCrmPath(caminho)) continue;
      const conteudo = readFileSync(full, "utf8");
      arquivos.push({ caminho, sha256: createHash("sha256").update(conteudo).digest("hex"), conteudo });
    }
  }
  arquivos.sort((a, b) => a.caminho.localeCompare(b.caminho));
  const versao = createHash("sha256")
    .update(arquivos.map((a) => `${a.caminho}:${a.sha256}`).join("\n"))
    .digest("hex")
    .slice(0, 16);
  return { versao, arquivos };
}

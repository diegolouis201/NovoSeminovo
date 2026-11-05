import { readFileSync, statSync } from "node:fs";

// Mesma regra da API (apps/api/src/auth/secret-file.ts, que tem os testes):
// a chave secreta do login do site (AUTH_SECRET, que criptografa o cookie da
// sessão) fica num ARQUIVO do servidor — /run/secrets/auth_secret ou o caminho
// em AUTH_SECRET_FILE —, fora do GitHub. Em produção só o arquivo vale.
const MIN_LENGTH = 32;
const HOW_TO = "gere com `openssl rand -base64 48` (ver scripts/criar-segredos.sh)";
const cache = new Map<string, { value: string; at: number }>();

export function readSecret(name: string): string {
  const hit = cache.get(name);
  if (hit && Date.now() - hit.at < 60_000) return hit.value;
  const path = process.env[`${name}_FILE`] || `/run/secrets/${name.toLowerCase()}`;
  let value: string | undefined;
  try {
    if (statSync(path).mode & 0o077) throw new Error(`${path} pode ser lido por outros usuários do servidor — rode \`chmod 600 ${path}\`.`);
    value = readFileSync(path, "utf8").trim();
  } catch (error) {
    if ((error as Error).message.includes("chmod")) throw error;
    if (process.env.NODE_ENV === "production") throw new Error(`${name}: arquivo ${path} não encontrado — ${HOW_TO}.`);
    value = process.env[name]?.trim();
  }
  if (!value || value.length < MIN_LENGTH) throw new Error(`${name} ausente ou curta demais (mínimo ${MIN_LENGTH} caracteres) — ${HOW_TO}.`);
  cache.set(name, { value, at: Date.now() });
  return value;
}

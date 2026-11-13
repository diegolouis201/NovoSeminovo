import { readFileSync, statSync } from "node:fs";

// Chaves secretas (assinatura do login e dos links) ficam num ARQUIVO no
// servidor, fora do GitHub e fora do .env: /run/secrets/<nome em minúsculas>
// (o docker-compose monta a pasta ~/NovoSeminovo/secrets ali, só leitura) ou
// o caminho em <NOME>_FILE. Em produção só o arquivo vale; na máquina de
// desenvolvimento e nos testes, a variável de ambiente ainda serve.
// Gerar: ver scripts/criar-segredos.sh e DEPLOY.md ("Chaves secretas").

type Env = Record<string, string | undefined>;
type Reader = (path: string) => string;

const MIN_LENGTH = 32;
const HOW_TO = "gere com `openssl rand -base64 48` (ver scripts/criar-segredos.sh)";

function defaultReader(path: string): string {
  // Arquivo que qualquer usuário do servidor lê não é segredo.
  const mode = statSync(path).mode & 0o777;
  if (mode & 0o077) throw Object.assign(new Error(`permissões ${mode.toString(8)}`), { code: "EPERM_OPEN" });
  return readFileSync(path, "utf8");
}

export function secretFilePath(name: string, env: Env = process.env): string {
  return env[`${name}_FILE`] || `/run/secrets/${name.toLowerCase()}`;
}

// Chave gerada por nós: mínimo de 32 caracteres e instrução do openssl.
// Chave de parceiro (ex.: Creditas), que vem pronta deles: o tamanho mínimo
// e a instrução mudam (options) — o resto da regra (arquivo em produção,
// chmod 600) é o mesmo. A mensagem de erro nunca traz o valor lido.
export type SecretOptions = { minLength?: number; howTo?: string };

export function readSecret(name: string, env: Env = process.env, reader: Reader = defaultReader, options: SecretOptions = {}): string {
  const minLength = options.minLength ?? MIN_LENGTH;
  const howTo = options.howTo ?? HOW_TO;
  const path = secretFilePath(name, env);
  let value: string | undefined;
  try {
    value = reader(path).trim();
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "EPERM_OPEN") throw new Error(`${path} pode ser lido por outros usuários do servidor — rode \`chmod 600 ${path}\`.`);
    if (env.NODE_ENV === "production") {
      throw new Error(`${name}: arquivo ${path} não encontrado — em produção a chave só é lida do arquivo; ${howTo}.`);
    }
    value = env[name]?.trim();
  }
  if (!value || value.length < minLength) {
    throw new Error(`${name} ausente ou curta demais (mínimo ${minLength} caracteres) — ${howTo}.`);
  }
  return value;
}

// Leitura "sempre que precisa", sem ir ao disco a cada requisição: guarda o
// valor por 1 minuto. Trocou o arquivo no servidor, em até 1 minuto a API já
// usa a chave nova (sem precisar reiniciar).
const cache = new Map<string, { value: string; at: number }>();
const CACHE_MS = 60_000;
export function currentSecret(name: string): string {
  const hit = cache.get(name);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = readSecret(name);
  cache.set(name, { value, at: Date.now() });
  return value;
}

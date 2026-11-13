import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSecret } from "./secret-file";

// A chave secreta (assina o login e os links) fica num ARQUIVO no servidor,
// fora do GitHub, e é lida dele sempre que precisa.
const dir = mkdtempSync(join(tmpdir(), "segredos-"));
const strong = "x".repeat(64);
after(() => rmSync(dir, { recursive: true, force: true }));

describe("Chave secreta lida de arquivo", () => {
  test("lê do arquivo indicado e ignora espaço e quebra de linha no fim", () => {
    const file = join(dir, "jwt_secret");
    writeFileSync(file, `${strong}\n`, { mode: 0o600 });
    assert.equal(readSecret("JWT_SECRET", { JWT_SECRET_FILE: file, NODE_ENV: "production" }), strong);
  });

  test("sem caminho indicado, procura em /run/secrets/<nome>", () => {
    assert.throws(() => readSecret("JWT_SECRET", { NODE_ENV: "production" }, () => { throw Object.assign(new Error("x"), { code: "ENOENT" }); }), /\/run\/secrets\/jwt_secret/);
  });

  test("em produção a variável de ambiente NÃO vale: só o arquivo", () => {
    assert.throws(() => readSecret("JWT_SECRET", { JWT_SECRET: strong, NODE_ENV: "production", JWT_SECRET_FILE: join(dir, "nao-existe") }), /arquivo/i);
  });

  test("fora de produção (máquina de desenvolvimento e testes), aceita a variável de ambiente", () => {
    assert.equal(readSecret("JWT_SECRET", { JWT_SECRET: strong, JWT_SECRET_FILE: join(dir, "nao-existe") }), strong);
  });

  test("chave curta ou fraca é recusada, com instrução de como gerar", () => {
    const file = join(dir, "curta");
    writeFileSync(file, "senha123", { mode: 0o600 });
    assert.throws(() => readSecret("JWT_SECRET", { JWT_SECRET_FILE: file, NODE_ENV: "production" }), /openssl rand/);
  });

  test("chave de parceiro (ex.: Creditas) aceita tamanho mínimo menor e não manda gerar com openssl", () => {
    const file = join(dir, "creditas_consumer_key");
    writeFileSync(file, "abc12345\n", { mode: 0o600 });
    const env = { CREDITAS_CONSUMER_KEY_FILE: file, NODE_ENV: "production" };
    assert.equal(readSecret("CREDITAS_CONSUMER_KEY", env, undefined, { minLength: 8, howTo: "peça à Creditas" }), "abc12345");
    writeFileSync(file, "abc", { mode: 0o600 });
    assert.throws(
      () => readSecret("CREDITAS_CONSUMER_KEY", env, undefined, { minLength: 8, howTo: "peça à Creditas" }),
      (error: Error) => /peça à Creditas/.test(error.message) && !/openssl/.test(error.message) && !error.message.includes("abc"),
    );
  });

  test("arquivo que outros usuários do servidor conseguem ler é recusado", () => {
    const file = join(dir, "aberto");
    writeFileSync(file, strong);
    chmodSync(file, 0o644);
    assert.throws(() => readSecret("JWT_SECRET", { JWT_SECRET_FILE: file, NODE_ENV: "production" }), /chmod 600/);
    chmodSync(file, 0o600);
    assert.equal(readSecret("JWT_SECRET", { JWT_SECRET_FILE: file, NODE_ENV: "production" }), strong);
  });
});

describe("Arquivo da chave nunca vai para o GitHub", () => {
  test(".gitignore bloqueia a pasta secrets/ e o docker-compose monta só leitura", async () => {
    const { readFileSync } = await import("node:fs");
    const root = join(__dirname, "..", "..", "..", "..");
    const gitignore = readFileSync(join(root, ".gitignore"), "utf8");
    assert.match(gitignore, /^secrets\/$/m);
    const compose = readFileSync(join(root, "docker-compose.yml"), "utf8");
    assert.match(compose, /\.\/secrets:\/run\/secrets:ro/);
    assert.doesNotMatch(compose, /JWT_SECRET: \$\{JWT_SECRET\}|AUTH_SECRET: \$\{AUTH_SECRET\}/);
  });
});

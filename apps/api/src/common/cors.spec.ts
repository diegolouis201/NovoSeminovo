import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { allowedOrigins, corsOptions, isAllowedOrigin, STATIC_FILE_HEADERS } from "./cors";

// CORS da API: navegador só fala com a API a partir do próprio site.
// Chamada sem Origin (servidor do site, CRM pela API de integração, curl)
// não é afetada por CORS e continua passando.

const env = { WEB_ORIGIN: "https://novoseminovo.com.br", NODE_ENV: "production" };

function decide(options: ReturnType<typeof corsOptions>, origin: string | undefined): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const check = options.origin as (origin: string | undefined, cb: (error: Error | null, allow?: boolean) => void) => void;
    check(origin, (error, allow) => (error ? reject(error) : resolve(Boolean(allow))));
  });
}

describe("CORS: só a origem do site", () => {
  test("aceita exatamente a origem do site", () => {
    assert.equal(isAllowedOrigin("https://novoseminovo.com.br", env), true);
  });

  test("recusa outros sites, subdomínios, http e variações parecidas", () => {
    for (const origin of [
      "https://golpe.com",
      "https://novoseminovo.com.br.golpe.com",
      "https://golpenovoseminovo.com.br",
      "http://novoseminovo.com.br",
      "https://api.novoseminovo.com.br",
      "https://novoseminovo.com.br:8443",
      "null",
      "",
    ]) {
      assert.equal(isAllowedOrigin(origin, env), false, origin);
    }
  });

  test("barra no final do WEB_ORIGIN não abre exceção", () => {
    assert.deepEqual(allowedOrigins({ ...env, WEB_ORIGIN: "https://novoseminovo.com.br/" }), ["https://novoseminovo.com.br"]);
  });

  test("em produção, sem WEB_ORIGIN a API não sobe (nada de liberar geral)", () => {
    assert.throws(() => allowedOrigins({ NODE_ENV: "production" }), /WEB_ORIGIN/);
  });

  test("fora de produção, sem WEB_ORIGIN vale só o site local", () => {
    assert.deepEqual(allowedOrigins({}), ["http://localhost:3000"]);
  });

  test("opções: origem decidida por função, sem cookies, métodos e cabeçalhos limitados", async () => {
    const options = corsOptions(env);
    assert.equal(await decide(options, "https://novoseminovo.com.br"), true);
    assert.equal(await decide(options, "https://golpe.com"), false);
    assert.equal(await decide(options, undefined), true);
    assert.equal(options.credentials, false);
    assert.deepEqual(options.methods, ["GET", "POST", "PUT", "PATCH", "DELETE"]);
    assert.deepEqual(options.allowedHeaders, ["Content-Type", "Authorization"]);
  });

  test("arquivos enviados (fotos) só podem ser carregados pelo próprio site", () => {
    assert.equal(STATIC_FILE_HEADERS["Cross-Origin-Resource-Policy"], "same-site");
    assert.equal(STATIC_FILE_HEADERS["X-Content-Type-Options"], "nosniff");
  });
});

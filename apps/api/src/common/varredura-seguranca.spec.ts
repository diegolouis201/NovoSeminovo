import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// Varreduras das regras de segurança do CLAUDE.md: falham se alguém voltar a
// escrever o padrão proibido em qualquer arquivo (não só no que tem teste).

const ROOT = resolve(__dirname, "..", "..", "..", "..");
const SKIP = new Set(["node_modules", ".next", "dist", "dist-test", "public", "cypress", ".turbo"]);

function files(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, pattern);
    return pattern.test(name) && !/\.(spec|test)\.tsx?$/.test(name) ? [path] : [];
  });
}

function offenders(dirs: string[], pattern: RegExp, forbidden: RegExp, allowed: string[] = []): string[] {
  const found: string[] = [];
  for (const dir of dirs) {
    for (const path of files(join(ROOT, dir), pattern)) {
      const rel = relative(ROOT, path);
      if (allowed.includes(rel)) continue;
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(new RegExp(forbidden.source, "g"))) {
        found.push(`${rel}:${source.slice(0, match.index).split("\n").length}`);
      }
    }
  }
  return found;
}

const TS = /\.tsx?$/;
// Montado em pedaços para a própria varredura não se achar.
const UNSAFE_RAW = new RegExp(["\\$queryRaw", "Unsafe|\\$executeRaw", "Unsafe"].join(""));

describe("Varreduras de segurança", () => {
  test("SQL: nada de $queryRawUnsafe/$executeRawUnsafe (só Prisma ou $queryRaw`...`)", () => {
    assert.deepEqual(offenders(["apps/api/src", "packages/db"], TS, UNSAFE_RAW), []);
  });

  test("SQL: consulta crua só como template marcado, nunca $queryRaw(texto)", () => {
    assert.deepEqual(offenders(["apps/api/src", "packages/db"], TS, /\$(queryRaw|executeRaw)\(/), []);
  });

  test("XSS: dangerouslySetInnerHTML só no componente JsonLd (que escapa o <)", () => {
    assert.deepEqual(offenders(["apps/web", "apps/hub"], /\.(tsx|jsx)$/, /dangerouslySetInnerHTML/, ["apps/web/components/JsonLd.tsx"]), []);
  });

  test("Imagens: sharp só pelo safeSharp (limite de pixels) — import do sharp só em image-safety.ts", () => {
    assert.deepEqual(offenders(["apps/api/src"], TS, /import\s+sharp\b|require\(["']sharp["']\)/, ["apps/api/src/common/image-safety.ts"]), []);
  });

  test("Banco: PrismaClient só no PrismaService (e no cliente sem middleware da criptografia)", () => {
    assert.deepEqual(
      offenders(["apps/api/src"], TS, /new PrismaClient\(/, ["apps/api/src/prisma/prisma.service.ts", "apps/api/src/common/field-encryption.ts"]),
      [],
    );
  });

  // Next 14 tem falhas críticas no otimizador de imagem (/_next/image) só
  // corrigidas no Next 15. O site e o Hub não usam next/image: o otimizador
  // fica desligado (images.unoptimized) e ninguém volta a usar next/image.
  test("Next: otimizador de imagem desligado no site e no Hub, e next/image fora de uso", () => {
    for (const app of ["apps/web", "apps/hub"]) {
      const config = readFileSync(join(ROOT, app, "next.config.js"), "utf8");
      assert.match(config, /images:\s*\{\s*unoptimized:\s*true\s*\}/, app);
    }
    assert.deepEqual(offenders(["apps/web", "apps/hub"], /\.(tsx?|jsx?)$/, /from ["']next\/(legacy\/)?image["']/), []);
  });

  test("CSV: toda planilha baixada do site sai por toCsv (neutraliza fórmula =, +, -, @)", () => {
    const routes = ["apps/web/app", "apps/hub/app"].flatMap((dir) => files(join(ROOT, dir), /^route\.tsx?$/));
    const problems = routes
      .filter((path) => /text\/csv/.test(readFileSync(path, "utf8")))
      .filter((path) => !/import \{[^}]*\btoCsv\b[^}]*\} from "@\/lib\/planilha-excel"/.test(readFileSync(path, "utf8")))
      .map((path) => relative(ROOT, path));
    assert.deepEqual(problems, []);
  });

  test("Senhas: bcrypt só em auth/password.ts (hashPassword/verifyPassword, custo 12)", () => {
    assert.deepEqual(offenders(["apps/api/src"], TS, /from ["']bcrypt(js)?["']/, ["apps/api/src/auth/password.ts"]), []);
  });
});

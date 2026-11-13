import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

// CLAUDE.md (Segurança/XSS): todo `target="_blank"` precisa de
// `rel="noopener noreferrer"`. Sem `noopener` a página aberta ganha
// `window.opener` e pode redirecionar a aba do site (tabnabbing); sem
// `noreferrer` o endereço da página vaza para o outro site.

function findRepoRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, "apps", "web"))) return dir;
    dir = join(dir, "..");
  }
  throw new Error("Raiz do repositório (com apps/web) não encontrada");
}

function listTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) listTsx(full, out);
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Devolve o texto da tag JSX de abertura que contém a posição `at`. */
function enclosingTag(source: string, at: number): string {
  let start = at;
  while (start > 0 && !(source[start] === "<" && /[A-Za-z]/.test(source[start + 1] ?? ""))) start--;
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start);
}

const BLANK = /target\s*=\s*(?:"_blank"|'_blank'|\{\s*["'`]_blank["'`]\s*\})/g;

export function linksWithoutSafeRel(source: string): string[] {
  const bad: string[] = [];
  for (const match of source.matchAll(BLANK)) {
    const tag = enclosingTag(source, match.index ?? 0);
    const rel = /\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*["'`]([^"'`]*)["'`]\s*\})/.exec(tag);
    const tokens = (rel?.[1] ?? rel?.[2] ?? rel?.[3] ?? "").toLowerCase().split(/\s+/);
    if (!tokens.includes("noopener") || !tokens.includes("noreferrer")) {
      const line = source.slice(0, match.index).split("\n").length;
      bad.push(`linha ${line}: ${tag.replace(/\s+/g, " ").slice(0, 120)}`);
    }
  }
  return bad;
}

describe("Links com target=_blank no site", () => {
  test("o verificador reconhece casos certos e errados", () => {
    assert.deepEqual(linksWithoutSafeRel(`<a href="x" target="_blank" rel="noopener noreferrer">x</a>`), []);
    assert.deepEqual(
      linksWithoutSafeRel(`<a\n  href={u}\n  target="_blank"\n  rel="noopener noreferrer sponsored"\n>x</a>`),
      [],
    );
    assert.equal(linksWithoutSafeRel(`<Link href="/t" target="_blank" className="a">x</Link>`).length, 1);
    assert.equal(linksWithoutSafeRel(`<a href="/t" target="_blank" rel="noreferrer">x</a>`).length, 1);
    assert.equal(linksWithoutSafeRel(`<a href={f(() => 1)} target={"_blank"} rel="noopener">x</a>`).length, 1);
  });

  test("todo target=_blank em apps/web tem rel com noopener e noreferrer", () => {
    const root = findRepoRoot();
    const web = join(root, "apps", "web");
    const problems: string[] = [];
    for (const file of listTsx(web)) {
      for (const p of linksWithoutSafeRel(readFileSync(file, "utf8"))) {
        problems.push(`${relative(root, file)} ${p}`);
      }
    }
    assert.deepEqual(problems, [], `Faltou rel="noopener noreferrer":\n${problems.join("\n")}`);
  });
});

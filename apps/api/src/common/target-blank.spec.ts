import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// Regra do CLAUDE.md (script injection): link que abre em nova aba sempre
// com rel="noopener noreferrer" — sem isso a página aberta controla a aba de
// origem (window.opener). A auditoria web (16/11/2026, item 9) achou links
// sem rel; esta varredura cobre o site e o Hub inteiros.

const ROOT = resolve(__dirname, "..", "..", "..", "..");
const APPS = [join(ROOT, "apps", "web"), join(ROOT, "apps", "hub")];
const SKIP = new Set(["node_modules", ".next", "cypress", "public", "dist"]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(tsx|jsx)$/.test(name) ? [path] : [];
  });
}

// Tag de abertura que contém o target="_blank" (pode ocupar várias linhas).
function openingTag(source: string, index: number): string {
  const start = source.lastIndexOf("<", index);
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (char === "{") depth++;
    else if (char === "}") depth--;
    else if (char === ">" && depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start);
}

describe("Links em nova aba (site e Hub)", () => {
  test('todo target="_blank" tem rel com noopener e noreferrer', () => {
    const problems: string[] = [];
    for (const app of APPS) {
      for (const path of files(app)) {
        const source = readFileSync(path, "utf8");
        for (const match of source.matchAll(/target=["{]+_blank/g)) {
          const tag = openingTag(source, match.index ?? 0);
          if (!/rel=["{][^>]*noopener/.test(tag) || !/rel=["{][^>]*noreferrer/.test(tag)) {
            const line = source.slice(0, match.index).split("\n").length;
            problems.push(`${relative(ROOT, path)}:${line}`);
          }
        }
      }
    }
    assert.deepEqual(problems, [], `Links em nova aba sem rel="noopener noreferrer":\n${problems.join("\n")}`);
  });
});

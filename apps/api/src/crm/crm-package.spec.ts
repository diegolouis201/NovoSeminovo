import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCrmPackage } from "./crm-package";

// Atualização automática do CRM: o site entrega (com a chave do CRM) os
// programas e as instruções do repositório do CRM. Nunca entrega chave,
// dados de clientes nem arquivos .cmd (que o Windows está rodando).

function pasta(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "crm-pacote-"));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return dir;
}

describe("Pacote do CRM para atualização automática", () => {
  const dir = pasta({
    "CLAUDE.md": "# regras",
    "README.md": "leia",
    ".env.exemplo": "NSN_CRM_KEY=",
    ".gitignore": ".env",
    "scripts/sincronizar.mjs": "console.log(1)",
    "scripts/avisos.test.mjs": "// teste",
    "docs/datas-do-setor.csv": "data;nome",
    ".env": "NSN_CRM_KEY=segredo",
    "dados/clientes.json": "{}",
    "relatorios/painel.html": "<html>",
    "campanhas/x.csv": "a",
    "sincronizar.cmd": "@echo off",
    "scripts/../../fora.txt": "x",
  });

  test("entrega programas e instruções, com o resumo (sha256) de cada arquivo", () => {
    const pacote = buildCrmPackage(dir);
    const caminhos = pacote.arquivos.map((a) => a.caminho).sort();
    assert.deepEqual(caminhos, [".env.exemplo", ".gitignore", "CLAUDE.md", "README.md", "docs/datas-do-setor.csv", "scripts/avisos.test.mjs", "scripts/sincronizar.mjs"]);
    const sync = pacote.arquivos.find((a) => a.caminho === "scripts/sincronizar.mjs")!;
    assert.equal(sync.conteudo, "console.log(1)");
    assert.equal(sync.sha256, createHash("sha256").update("console.log(1)").digest("hex"));
  });

  test("nunca entrega a chave, dados de clientes, relatórios, campanhas nem .cmd", () => {
    const tudo = JSON.stringify(buildCrmPackage(dir));
    assert.ok(!tudo.includes("segredo"));
    for (const proibido of ['"dados/', '"relatorios/', '"campanhas/', '.cmd"', '"fora.txt"']) assert.ok(!tudo.includes(proibido), proibido);
  });

  test("a versão muda quando algum arquivo muda", () => {
    const antes = buildCrmPackage(dir).versao;
    writeFileSync(join(dir, "CLAUDE.md"), "# regras novas");
    assert.notEqual(buildCrmPackage(dir).versao, antes);
  });

  test("pasta que não existe: pacote vazio, sem erro", () => {
    assert.deepEqual(buildCrmPackage(join(dir, "nao-existe")).arquivos, []);
  });
});

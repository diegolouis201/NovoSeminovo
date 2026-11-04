// Testes da atualização automática. Rodar: node --test scripts/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { caminhoPermitido, planejarAtualizacao } from "./atualizar-regras.mjs";

const sha = (t) => createHash("sha256").update(t).digest("hex");
const arquivo = (caminho, conteudo) => ({ caminho, conteudo, sha256: sha(conteudo) });

test("só aceita programas e instruções do CRM", () => {
  for (const ok of ["CLAUDE.md", "README.md", "PRIMEIRA-TAREFA.md", ".gitignore", ".env.exemplo", "scripts/avisos.mjs", "scripts/avisos.test.mjs", "docs/jornada.md", "docs/datas-do-setor.csv"]) {
    assert.equal(caminhoPermitido(ok), true, ok);
  }
  for (const ruim of [".env", "dados/clientes.json", "relatorios/painel.html", "campanhas/x.csv", "sincronizar.cmd", "../fora.mjs", "scripts/../../x.mjs", "/etc/passwd", "C:\\Windows\\x", "scripts\\avisos.mjs", "scripts/sub/x.mjs", "scripts/X.exe", "docs/a.html"]) {
    assert.equal(caminhoPermitido(ruim), false, ruim);
  }
});

test("escreve só o que mudou e confere o resumo de cada arquivo", () => {
  const locais = { "CLAUDE.md": "# velho", "scripts/lib.mjs": "igual" };
  const pacote = { versao: "v2", arquivos: [arquivo("CLAUDE.md", "# novo"), arquivo("scripts/lib.mjs", "igual"), arquivo("scripts/novo.mjs", "x")] };
  const plano = planejarAtualizacao(pacote, (c) => locais[c]);
  assert.deepEqual(plano.escrever.map((a) => a.caminho), ["CLAUDE.md", "scripts/novo.mjs"]);
  assert.deepEqual(plano.recusados, []);
});

test("recusa caminho proibido e arquivo corrompido; nunca toca no .env", () => {
  const pacote = {
    versao: "v3",
    arquivos: [arquivo(".env", "NSN_CRM_KEY=troca"), arquivo("../fora.mjs", "x"), { caminho: "scripts/lib.mjs", conteudo: "alterado", sha256: sha("original") }, arquivo("docs/ok.md", "ok")],
  };
  const plano = planejarAtualizacao(pacote, () => undefined);
  assert.deepEqual(plano.escrever.map((a) => a.caminho), ["docs/ok.md"]);
  assert.deepEqual(plano.recusados.sort(), ["../fora.mjs", ".env", "scripts/lib.mjs"].sort());
});

test("pacote estranho (sem lista de arquivos) não escreve nada", () => {
  assert.deepEqual(planejarAtualizacao({ versao: "x" }, () => undefined).escrever, []);
  assert.deepEqual(planejarAtualizacao(undefined, () => undefined).escrever, []);
});

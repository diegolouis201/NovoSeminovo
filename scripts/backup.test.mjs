// Testes do backup da VPS e da poda das fotos no Google Drive, com rclone,
// docker e alerta FALSOS no PATH (nada sai da máquina).
// Rodar: node --test scripts/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const PODA = join(AQUI, "podar-fotos-drive.sh");
const BACKUP = join(AQUI, "backup.sh");

// rclone falso: grava cada chamada (uma por linha) em $RCLONE_LOG.
//   lsf       → responde com o conteúdo de $RCLONE_LSF (ou falha se RCLONE_LSF_FALHA=1)
//   copy      → falha se RCLONE_COPY_FALHA=1
//   deletefile→ falha se RCLONE_DELETE_FALHA=1
const RCLONE = `#!/bin/sh
echo "$*" >> "$RCLONE_LOG"
case "$1" in
  listremotes) echo "backup:" ;;
  lsf) [ "\${RCLONE_LSF_FALHA:-}" = 1 ] && { echo "directory not found" >&2; exit 3; }; cat "$RCLONE_LSF" ;;
  copy) [ "\${RCLONE_COPY_FALHA:-}" = 1 ] && exit 1 ;;
  deletefile) [ "\${RCLONE_DELETE_FALHA:-}" = 1 ] && exit 1 ;;
esac
exit 0
`;
// docker falso: pg_dump e tar devolvem bytes de verdade (gzip válido nas fotos).
const DOCKER = `#!/bin/sh
case "$*" in
  *pg_dump*) printf 'PGDMP-falso' ;;
  *psql*) echo 3 ;;
  *pg_restore*) cat > /dev/null ;;
  *tar*) printf 'fotos' | gzip -c ;;
esac
exit 0
`;
const ALERTA = `#!/bin/sh
printf '%s|%s\\n' "$1" "$2" >> "$ALERTA_LOG"
`;

function ambiente(lsf = []) {
  const dir = mkdtempSync(join(tmpdir(), "backup-teste-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  for (const [nome, corpo] of [["rclone", RCLONE], ["docker", DOCKER], ["alerta.sh", ALERTA]]) {
    writeFileSync(join(bin, nome), corpo);
    chmodSync(join(bin, nome), 0o755);
  }
  writeFileSync(join(dir, "lsf.txt"), lsf.map((l) => `${l}\n`).join(""));
  return {
    dir,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      RCLONE_LOG: join(dir, "rclone.log"),
      RCLONE_LSF: join(dir, "lsf.txt"),
      ALERTA_LOG: join(dir, "alerta.log"),
    },
    chamadas: () => (existsSync(join(dir, "rclone.log")) ? readFileSync(join(dir, "rclone.log"), "utf8").trim().split("\n").filter(Boolean) : []),
    apagados: function () {
      return this.chamadas().filter((c) => c.startsWith("deletefile")).map((c) => c.split(" ").pop());
    },
    alertas: () => (existsSync(join(dir, "alerta.log")) ? readFileSync(join(dir, "alerta.log"), "utf8") : ""),
  };
}

const poda = (amb, ...args) => spawnSync("sh", [PODA, ...args], { env: amb.env, encoding: "utf8" });
const fotos = (...datas) => datas.map((d) => `fotos-${d}.tar.gz`);
const REMOTO = "backup:novoseminovo-backups/fotos";

test("poda: com 6 cópias no Drive apaga só as 2 mais antigas, de vez (sem lixeira)", () => {
  // Fora de ordem de propósito: a ordem vem do nome (data AAAAMMDD-HHMM).
  const amb = ambiente(fotos("20261108-0317", "20261025-0317", "20261115-0317", "20261101-0317", "20261122-0317", "20261018-0317"));
  const r = poda(amb, REMOTO, "4");
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(amb.apagados().sort(), [`${REMOTO}/fotos-20261018-0317.tar.gz`, `${REMOTO}/fotos-20261025-0317.tar.gz`]);
  assert.ok(amb.chamadas().filter((c) => c.startsWith("deletefile")).every((c) => c.includes("--drive-use-trash=false")));
  assert.match(r.stdout, /2 cópia/);
});

test("poda: com 4 cópias (ou menos) não apaga nada", () => {
  for (const lista of [fotos("20261101-0317", "20261108-0317", "20261115-0317", "20261122-0317"), fotos("20261122-0317"), []]) {
    const amb = ambiente(lista);
    const r = poda(amb, REMOTO, "4");
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(amb.apagados(), []);
  }
});

test("poda: nome fora do padrão nunca é apagado nem conta como cópia", () => {
  const estranhos = [
    "fotos-20201010-0101.tar.gz.parcial",
    "fotos-2020101-0101.tar.gz",
    "Fotos-20201010-0101.tar.gz",
    "fotos-20201010-0101.tar.gz.bak",
    "x-fotos-20201010-0101.tar.gz",
    "fotos-20201010-0101.tar.gz/",
    "banco-20201010-0101.dump",
    "../banco/banco-20201010-0101.dump",
    "pasta/",
  ];
  const amb = ambiente([...estranhos, ...fotos("20261101-0317", "20261108-0317", "20261115-0317", "20261122-0317", "20261025-0317")]);
  const r = poda(amb, REMOTO, "4");
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(amb.apagados(), [`${REMOTO}/fotos-20261025-0317.tar.gz`]);
});

test("poda: se a listagem do Drive falhar, não apaga nada e sai com erro", () => {
  const amb = ambiente(fotos("20261018-0317", "20261025-0317", "20261101-0317", "20261108-0317", "20261115-0317", "20261122-0317"));
  const r = spawnSync("sh", [PODA, REMOTO, "4"], { env: { ...amb.env, RCLONE_LSF_FALHA: "1" }, encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.deepEqual(amb.apagados(), []);
  assert.match(r.stderr, /listar/);
});

test("poda: recusa destino fora de uma pasta fotos/ e número de cópias inválido", () => {
  const amb = ambiente(fotos("20261018-0317", "20261025-0317", "20261101-0317", "20261108-0317", "20261115-0317", "20261122-0317"));
  for (const args of [["backup:novoseminovo-backups", "4"], ["backup:", "4"], [REMOTO, "0"], [REMOTO, "abc"], [REMOTO, "-1"]]) {
    const r = poda(amb, ...args);
    assert.notEqual(r.status, 0, `devia recusar ${args.join(" ")}`);
  }
  assert.deepEqual(amb.apagados(), []);
  assert.ok(!amb.chamadas().some((c) => c.startsWith("lsf")), "nem chega a listar");
});

test("poda: sem argumentos usa backup:novoseminovo-backups/fotos e 4 cópias", () => {
  const amb = ambiente(fotos("20261018-0317", "20261025-0317", "20261101-0317", "20261108-0317", "20261115-0317"));
  const r = poda(amb);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(amb.chamadas().some((c) => c.startsWith("lsf") && c.includes(REMOTO)));
  assert.deepEqual(amb.apagados(), [`${REMOTO}/fotos-20261018-0317.tar.gz`]);
});

// --- backup.sh inteiro ---------------------------------------------------
function rodarBackup(amb, extra = {}) {
  const projeto = join(amb.dir, "projeto");
  mkdirSync(projeto, { recursive: true });
  return spawnSync("sh", [BACKUP], {
    env: { ...amb.env, PROJETO: projeto, BACKUP_DIR: join(amb.dir, "backups"), BACKUP_FOTOS: "1", BACKUP_ALERTA: join(amb.dir, "bin", "alerta.sh"), ...extra },
    encoding: "utf8",
  });
}

test("backup: depois da cópia para o Drive, poda as fotos lá (só depois do copy)", () => {
  const amb = ambiente(fotos("20261018-0317", "20261025-0317", "20261101-0317", "20261108-0317", "20261115-0317", "20261122-0317"));
  const r = rodarBackup(amb);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /BACKUP-OK\s*$/);
  const chamadas = amb.chamadas();
  const copy = chamadas.findIndex((c) => c.startsWith("copy"));
  const lsf = chamadas.findIndex((c) => c.startsWith("lsf"));
  assert.ok(copy >= 0 && lsf > copy, `lsf depois do copy: ${chamadas.join(" | ")}`);
  assert.deepEqual(amb.apagados().sort(), [`${REMOTO}/fotos-20261018-0317.tar.gz`, `${REMOTO}/fotos-20261025-0317.tar.gz`]);
  // O banco continua com a regra dos 60 dias.
  assert.ok(chamadas.some((c) => c.startsWith("delete") && c.includes("--min-age 60d")));
  assert.equal(amb.alertas(), "");
});

test("backup: se a cópia para o Drive falhar, não poda nada e o backup falha", () => {
  const amb = ambiente(fotos("20261018-0317", "20261025-0317", "20261101-0317", "20261108-0317", "20261115-0317", "20261122-0317"));
  const r = rodarBackup(amb, { RCLONE_COPY_FALHA: "1" });
  assert.notEqual(r.status, 0);
  assert.doesNotMatch(r.stdout, /BACKUP-OK/);
  assert.ok(!amb.chamadas().some((c) => c.startsWith("lsf") || c.startsWith("deletefile")));
});

test("backup: falha da poda vira AVISO no registro e alerta, mas a cópia ok continua BACKUP-OK", () => {
  const amb = ambiente(fotos("20261018-0317", "20261025-0317", "20261101-0317", "20261108-0317", "20261115-0317", "20261122-0317"));
  const r = rodarBackup(amb, { RCLONE_LSF_FALHA: "1" });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /cópia fora da VPS ok/);
  assert.match(r.stdout + r.stderr, /AVISO: .*Drive/);
  assert.match(r.stdout, /BACKUP-OK\s*$/);
  assert.match(amb.alertas(), /Drive/);
  assert.deepEqual(amb.apagados(), []);
});

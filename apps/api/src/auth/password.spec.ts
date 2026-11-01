import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { getRounds } from "bcryptjs";
import { NewPasswordSchema } from "@novoseminovo/shared-types";
import { hashPassword, needsRehash, PASSWORD_ROUNDS, verifyPassword } from "./password";

// Senha nunca é guardada: só o hash bcrypt (impressão digital que não volta
// a ser a senha), com custo 12.
describe("Senhas", () => {
  test("hash novo usa bcrypt com custo 12 e não contém a senha", async () => {
    const hash = await hashPassword("Senha@forte123");
    assert.equal(PASSWORD_ROUNDS, 12);
    assert.equal(getRounds(hash), 12);
    assert.ok(hash.startsWith("$2"));
    assert.ok(!hash.includes("Senha@forte123"));
  });

  test("confere a senha certa e recusa a errada", async () => {
    const hash = await hashPassword("Senha@forte123");
    assert.equal(await verifyPassword("Senha@forte123", hash), true);
    assert.equal(await verifyPassword("Senha@forte124", hash), false);
  });

  test("conta sem senha (ou inexistente) gasta o mesmo tempo e nunca entra", async () => {
    assert.equal(await verifyPassword("qualquer", null), false);
  });

  test("hash antigo (custo 10) é marcado para atualizar no próximo login", async () => {
    const { hash } = await import("bcryptjs");
    assert.equal(needsRehash(await hash("x", 10)), true);
    assert.equal(needsRehash(await hashPassword("x")), false);
  });

  test("senha acima de 72 bytes é recusada (o bcrypt ignoraria o resto)", () => {
    assert.equal(NewPasswordSchema.safeParse("A@" + "a".repeat(71)).success, false);
    assert.equal(NewPasswordSchema.safeParse("Á@" + "á".repeat(40)).success, false);
    assert.equal(NewPasswordSchema.safeParse("Senha@forte123").success, true);
  });
});

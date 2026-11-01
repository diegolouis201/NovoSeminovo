import { compare, getRounds, hash } from "bcryptjs";

// Senha nunca é guardada: só o hash bcrypt, com custo 12 (cada tentativa de
// adivinhar custa ~4x mais que o custo 10 de antes). Hash antigo é
// atualizado sozinho no próximo login certo.
export const PASSWORD_ROUNDS = 12;

// Hash de uma senha qualquer, para o login de e-mail inexistente gastar o
// mesmo tempo que um de verdade (não dá para descobrir quem tem conta
// medindo o tempo da resposta).
const DUMMY_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8.Nf6wPq0HM6vZ9m0b1lH2dDqQ7W6m";

export function hashPassword(password: string): Promise<string> {
  return hash(password, PASSWORD_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string | null | undefined): Promise<boolean> {
  const ok = await compare(password, passwordHash ?? DUMMY_HASH);
  return Boolean(passwordHash) && ok;
}

export function needsRehash(passwordHash: string): boolean {
  try {
    return getRounds(passwordHash) < PASSWORD_ROUNDS;
  } catch {
    return true;
  }
}

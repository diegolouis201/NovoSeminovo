import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { JwtService } from "@nestjs/jwt";
import type { ExecutionContext } from "@nestjs/common";
import { compare, hash } from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import type { EmailService } from "../email/email.service";
import { PasswordResetService } from "./password-reset.service";
import { JwtAuthGuard, forgetUserStatus } from "./jwt-auth.guard";

// "Esqueci minha senha": link por e-mail, uso único, derruba sessões antigas.
// Precisa do PostgreSQL local (DATABASE_URL).
const withDb = Boolean(process.env.DATABASE_URL);

describe("Troca de senha pelo e-mail (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const sent: Array<{ to: string; html: string }> = [];
  const email = { send: async (to: string, _subject: string, html: string) => void sent.push({ to, html }) } as unknown as EmailService;
  const service = new PasswordResetService(prisma, email);
  const jwt = new JwtService({ secret: "segredo-de-teste-com-mais-de-32-caracteres" });
  const guard = new JwtAuthGuard(jwt, prisma);
  const address = `troca-senha-${Date.now()}@teste.local`;
  let userId = "";

  const contextWith = (token: string) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: `Bearer ${token}` } }) }) }) as unknown as ExecutionContext;

  before(async () => {
    userId = (await prisma.user.create({ data: { name: "Ana", email: address, role: "buyer", passwordHash: await hash("senha-antiga", 4) } })).id;
  });

  after(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  test("e-mail desconhecido responde igual e não manda nada", async () => {
    assert.deepEqual(await service.request("ninguem-aqui@teste.local"), { ok: true });
    assert.equal(sent.length, 0);
  });

  test("link troca a senha uma vez só e derruba a sessão antiga", async () => {
    const oldToken = await jwt.signAsync({ sub: userId, role: "buyer", iat: Math.floor(Date.now() / 1000) - 60 });
    assert.equal(await guard.canActivate(contextWith(oldToken)), true);

    await service.request(address);
    assert.equal(sent.length, 1);
    const token = /token=([A-Za-z0-9_-]+)/.exec(sent[0].html)?.[1];
    assert.ok(token);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    assert.notEqual(stored.passwordResetTokenHash, token, "só o hash fica no banco");

    await service.reset(token!, "senha-nova-123");
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    assert.ok(await compare("senha-nova-123", updated.passwordHash ?? ""));
    assert.ok(updated.emailVerifiedAt);
    await assert.rejects(service.reset(token!, "outra-senha-456"), /expirou ou já foi usado/);
    await assert.rejects(guard.canActivate(contextWith(oldToken)), /senha foi trocada/);
  });

  test("link vencido não vale", async () => {
    await service.request(address);
    const token = /token=([A-Za-z0-9_-]+)/.exec(sent.at(-1)!.html)![1];
    await prisma.user.update({ where: { id: userId }, data: { passwordResetExpiresAt: new Date(Date.now() - 1000) } });
    await assert.rejects(service.reset(token, "senha-nova-789"), /expirou/);
  });

  test("convite da equipe: link de criar senha que vale 3 dias", async () => {
    sent.length = 0;
    await service.invite(userId);
    assert.equal(sent.length, 1);
    assert.match(sent[0]!.html, /Criar minha senha/);
    const token = /token=([A-Za-z0-9_-]+)/.exec(sent[0]!.html)?.[1];
    assert.ok(token);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const hours = (stored.passwordResetExpiresAt!.getTime() - Date.now()) / 3_600_000;
    assert.ok(hours > 71 && hours <= 72, "vale 72 horas");
    await service.reset(token!, "senha-nova-da-equipe!");
  });

  test("último acesso: gravado ao usar o site, no máximo uma vez por hora", async () => {
    await prisma.user.update({ where: { id: userId }, data: { lastActiveAt: null } });
    forgetUserStatus(userId);
    const token = await jwt.signAsync({ sub: userId, role: "buyer" });
    await guard.canActivate(contextWith(token));
    const first = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).lastActiveAt;
    assert.ok(first, "gravou o acesso");
    forgetUserStatus(userId);
    await guard.canActivate(contextWith(token));
    const second = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).lastActiveAt;
    assert.equal(second?.getTime(), first!.getTime(), "não regrava dentro da mesma hora");
  });
});

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { HubGoalInputSchema, HubMarkInputSchema, HubMemberInputSchema, HubTaskInputSchema, HUB_PROFILES, hubPermissionsOf } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { HubService } from "./hub.service";

// NovoSeminovo Hub (hub.novoseminovo.com.br): CRM da empresa com login.
// O dono (admin) vê tudo; cada funcionário entra com o perfil que o dono der.

describe("Perfis de acesso do Hub", () => {
  test("dono tem tudo; comercial não vê financeiro nem equipe; financeiro não mexe no CRM", () => {
    assert.deepEqual(hubPermissionsOf("dono").sort(), ["crm.editar", "crm.ver", "equipe", "financeiro", "marketing"]);
    assert.deepEqual(hubPermissionsOf("marketing"), ["marketing"]);
    assert.deepEqual(hubPermissionsOf("comercial").sort(), ["crm.editar", "crm.ver"]);
    assert.deepEqual(hubPermissionsOf("financeiro").sort(), ["financeiro"]);
    assert.deepEqual(hubPermissionsOf("leitura"), ["crm.ver"]);
    assert.deepEqual(hubPermissionsOf("inventado"), []);
    assert.ok(Object.keys(HUB_PROFILES).includes("comercial"));
  });

  test("entradas validadas: tarefa, meta e membro", () => {
    assert.equal(HubTaskInputSchema.safeParse({ title: "", dueAt: "2026-11-10T12:00:00-03:00" }).success, false);
    assert.equal(HubTaskInputSchema.safeParse({ title: "Ligar", dueAt: "amanhã" }).success, false);
    assert.equal(HubTaskInputSchema.safeParse({ title: "x".repeat(201), dueAt: "2026-11-10T12:00:00-03:00" }).success, false);
    assert.equal(HubTaskInputSchema.safeParse({ title: "Ligar", kind: "ligacao", dueAt: "2026-11-10T12:00:00-03:00" }).success, true);
    assert.equal(HubGoalInputSchema.safeParse({ month: "2026-13", newSubscriptions: 5, revenue: 1000 }).success, false);
    assert.equal(HubGoalInputSchema.safeParse({ month: "2026-11", newSubscriptions: -1, revenue: 1000 }).success, false);
    assert.equal(HubGoalInputSchema.safeParse({ month: "2026-11", newSubscriptions: 5, revenue: 1000 }).success, true);
    assert.equal(HubMemberInputSchema.safeParse({ email: "x@y.com", profile: "dono" }).success, false, "dono não se dá a outra pessoa");
    assert.equal(HubMemberInputSchema.safeParse({ email: "x@y.com", name: "Ana", profile: "comercial" }).success, true);
    assert.equal(HubMarkInputSchema.safeParse({ tags: ["x".repeat(41)] }).success, false);
    assert.equal(HubMarkInputSchema.safeParse({ nota: "x".repeat(2001) }).success, false);
  });
});

const withDb = Boolean(process.env.DATABASE_URL);

describe("Hub no banco: acesso, tarefas e meta", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const hub = new HubService(prisma);
  const tag = `hub-${Date.now()}`;
  const ids = { admin: "", seller: "", buyer: "", suspended: "", prospect: "" };

  before(async () => {
    ids.admin = (await prisma.user.create({ data: { name: "Dono", email: `dono-${tag}@teste.local`, role: "admin" } })).id;
    ids.seller = (await prisma.user.create({ data: { name: "Vendedora", email: `vend-${tag}@teste.local`, role: "sales" } })).id;
    ids.buyer = (await prisma.user.create({ data: { name: "Comprador", email: `comp-${tag}@teste.local` } })).id;
    ids.suspended = (await prisma.user.create({ data: { name: "Suspenso", email: `susp-${tag}@teste.local`, role: "admin", status: "suspended" } })).id;
    ids.prospect = (await prisma.salesProspect.create({ data: { name: `Loja ${tag}`, segment: "vehicle" } })).id;
  });

  after(async () => {
    await prisma.hubTask.deleteMany({ where: { createdById: { in: [ids.admin, ids.seller] } } });
    await prisma.hubMember.deleteMany({ where: { userId: { in: [ids.seller, ids.buyer] } } });
    await prisma.hubGoal.deleteMany({ where: { month: "2099-01" } });
    await prisma.salesProspect.deleteMany({ where: { id: ids.prospect } });
    await prisma.user.deleteMany({ where: { email: { contains: tag } } });
    await prisma.$disconnect();
  });

  test("admin ativo entra como dono; quem não é da equipe ou está suspenso não entra", async () => {
    assert.deepEqual((await hub.access(ids.admin))?.profile, "dono");
    assert.equal(await hub.access(ids.buyer), null);
    assert.equal(await hub.access(ids.suspended), null);
    assert.equal(await hub.access(ids.seller), null, "vendedor sem acesso dado pelo dono não entra");
  });

  test("dono dá acesso comercial; desligar o acesso tira na hora", async () => {
    await hub.saveMember({ email: `vend-${tag}@teste.local`, name: "Vendedora", profile: "comercial" }, ids.admin);
    const access = await hub.access(ids.seller);
    assert.equal(access?.profile, "comercial");
    assert.ok(access?.permissions.includes("crm.editar"));
    assert.ok(!access?.permissions.includes("financeiro"));
    await hub.setMemberActive(ids.seller, false);
    assert.equal(await hub.access(ids.seller), null);
  });

  test("tarefa: cria ligada a uma empresa, aparece na lista e some das abertas ao concluir", async () => {
    const task = await hub.createTask({ title: "Ligar para a loja", kind: "ligacao", dueAt: "2026-11-10T14:00:00-03:00", prospectId: ids.prospect }, ids.admin);
    let list = await hub.tasks({ status: "abertas" });
    const found = list.find((t) => t.id === task.id);
    assert.equal(found?.empresa?.nome, `Loja ${tag}`);
    assert.equal(found?.responsavel, "Dono");
    await hub.completeTask(task.id, ids.admin);
    list = await hub.tasks({ status: "abertas" });
    assert.ok(!list.some((t) => t.id === task.id));
    assert.ok((await hub.tasks({ status: "concluidas" })).some((t) => t.id === task.id));
  });

  test("tarefa com empresa inexistente é recusada", async () => {
    await assert.rejects(hub.createTask({ title: "x", dueAt: "2026-11-10T14:00:00-03:00", prospectId: "nao-existe" }, ids.admin), /Empresa não encontrada/);
  });

  test("marcações (importante, não contatar, tags, nota) no formato do CRM", async () => {
    const key = `empresa-${tag}`;
    await hub.saveMark(key, { importante: true, motivoImportante: "maior loja da cidade", tags: ["Feirão", "feirão"] }, ids.admin);
    await hub.saveMark(key, { naoContatar: true, motivoNaoContatar: "pediu por e-mail" }, ids.admin);
    const marks = await hub.marks();
    assert.equal(marks[key].importante, true);
    assert.equal(marks[key].naoContatar, true);
    assert.deepEqual(marks[key].tags, ["feirão"]);
    assert.ok(marks[key].naoContatarEm);
    await hub.saveMark(key, { naoContatar: false }, ids.admin);
    assert.equal((await hub.marks())[key].naoContatar, false);
    await prisma.hubMark.deleteMany({ where: { key } });
  });

  test("meta do mês: salva e atualiza", async () => {
    await hub.saveGoal({ month: "2099-01", newSubscriptions: 10, revenue: 5000 });
    await hub.saveGoal({ month: "2099-01", newSubscriptions: 12, revenue: 6000 });
    assert.deepEqual(await hub.goal("2099-01"), { month: "2099-01", newSubscriptions: 12, revenue: 6000 });
    assert.equal(await hub.goal("2099-02"), null);
  });
});

describe("Porteiro do Hub (HubGuard)", () => {
  const { HubGuard } = require("./hub.guard") as typeof import("./hub.guard");
  const { Reflector } = require("@nestjs/core") as typeof import("@nestjs/core");
  const access = {
    dono: { userId: "u1", name: "Dono", email: "d@x", profile: "dono", permissions: ["crm.ver", "crm.editar", "financeiro", "equipe"] },
    leitura: { userId: "u2", name: "Ana", email: "a@x", profile: "leitura", permissions: ["crm.ver"] },
  } as const;
  const ctx = (userId: string | undefined, permission: string) => {
    const req: Record<string, unknown> = { user: userId ? { id: userId } : undefined };
    const handler = () => undefined;
    Reflect.defineMetadata("hub:permission", permission, handler);
    return { req, context: { switchToHttp: () => ({ getRequest: () => req }), getHandler: () => handler, getClass: () => class {} } as never };
  };
  const guard = new HubGuard(new Reflector(), { access: async (id: string) => (id === "u1" ? access.dono : id === "u2" ? access.leitura : null) } as never);

  test("dono passa em tudo e o acesso fica no request", async () => {
    const { req, context } = ctx("u1", "financeiro");
    assert.equal(await guard.canActivate(context), true);
    assert.equal((req.hub as { profile: string }).profile, "dono");
  });
  test("só leitura vê o CRM, mas não edita nem vê financeiro", async () => {
    assert.equal(await guard.canActivate(ctx("u2", "crm.ver").context), true);
    await assert.rejects(guard.canActivate(ctx("u2", "crm.editar").context), /permissão/);
    await assert.rejects(guard.canActivate(ctx("u2", "financeiro").context), /permissão/);
  });
  test("quem não é da equipe ou não está logado não entra", async () => {
    await assert.rejects(guard.canActivate(ctx("u9", "crm.ver").context), /equipe/);
    await assert.rejects(guard.canActivate(ctx(undefined, "crm.ver").context), /equipe/);
  });
});

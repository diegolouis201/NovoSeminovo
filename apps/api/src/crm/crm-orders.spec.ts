import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { CrmOrderInputSchema } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { TaskQueueService } from "../operations/task-queue.service";
import { SalesService } from "../sales/sales.service";
import { CrmOrdersService } from "./crm-orders.service";

// Ordens do CRM geral para as áreas: viram tarefa do agente de IA da área,
// aparecem para a equipe comercial e ficam disponíveis para as sessões de
// Marketing e Financeiro, que respondem quando concluem.

describe("Validação da ordem", () => {
  test("título obrigatório e área conhecida", () => {
    assert.equal(CrmOrderInputSchema.safeParse({ area: "comercial", titulo: "" }).success, false);
    assert.equal(CrmOrderInputSchema.safeParse({ area: "juridico", titulo: "Revisar contrato" }).success, false);
    assert.equal(CrmOrderInputSchema.safeParse({ area: "marketing", titulo: "Campanha Dia do Corretor" }).success, true);
  });
});

const withDb = Boolean(process.env.DATABASE_URL);

describe("Ordens do CRM (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const sales = new SalesService(prisma);
  const queue = new TaskQueueService(prisma);
  const orders = new CrmOrdersService(prisma, queue);
  const tag = `ordem-${Date.now()}`;
  const ids = { seller: "", card: "", orders: [] as string[] };

  before(async () => {
    ids.seller = (await sales.createMember({ name: "Vendedora Ordens", email: `vo-${tag}@teste.local` })).id;
    ids.card = (await sales.createProspect(ids.seller, { name: `Loja Alvo ${tag}`, segment: "vehicle" })).id;
  });

  after(async () => {
    const taskIds = (await prisma.crmOrder.findMany({ where: { id: { in: ids.orders } }, select: { agentTaskId: true } }))
      .map((o) => o.agentTaskId)
      .filter((id): id is string => Boolean(id));
    await prisma.crmOrder.deleteMany({ where: { id: { in: ids.orders } } });
    await prisma.agentTaskEvent.deleteMany({ where: { taskId: { in: taskIds } } });
    await prisma.agentTask.deleteMany({ where: { id: { in: taskIds } } });
    await prisma.salesNote.deleteMany({ where: { prospectId: ids.card } });
    await prisma.salesProspect.deleteMany({ where: { id: ids.card } });
    await prisma.user.deleteMany({ where: { id: ids.seller } });
    await prisma.$disconnect();
  });

  test("ordem para o Comercial: tarefa do agente, aviso no card e lista da equipe", async () => {
    const order = await orders.create({ area: "comercial", titulo: "Ligar e apresentar o plano Profissional", detalhes: "Loja tem 45 carros.", cardId: ids.card, prioridade: "alta" });
    ids.orders.push(order.id);
    assert.equal(order.status, "aberta");
    const task = await prisma.agentTask.findUniqueOrThrow({ where: { id: order.agentTaskId! } });
    assert.equal(task.agent, "comercial");
    assert.equal(task.createdBy, "crm");
    assert.match(task.objective, /Ligar e apresentar/);
    const notes = await prisma.salesNote.findMany({ where: { prospectId: ids.card } });
    assert.ok(notes.some((n) => /Ordem do CRM/.test(n.body)));
    const forTeam = await orders.forSales();
    assert.ok(forTeam.some((o) => o.id === order.id && o.empresa === `Loja Alvo ${tag}`));
  });

  test("equipe comercial conclui com resultado", async () => {
    const id = ids.orders[0]!;
    await orders.completeBySales(ids.seller, id, "Liguei, vai assinar na sexta.");
    const listed = (await orders.list()).find((o) => o.id === id);
    assert.equal(listed?.status, "feita");
    assert.equal(listed?.resultado, "Liguei, vai assinar na sexta.");
    assert.match(listed?.feitaPor ?? "", /Vendedora Ordens/);
  });

  test("ordem para o Marketing: sem agente; a sessão pega e conclui; outra área não conclui", async () => {
    const order = await orders.create({ area: "marketing", titulo: "Campanha de aniversário para 5 lojas" });
    ids.orders.push(order.id);
    assert.equal(order.agentTaskId, undefined);
    assert.ok((await orders.forArea("marketing")).some((o) => o.id === order.id));
    assert.equal((await orders.forArea("financeiro")).some((o) => o.id === order.id), false);
    await assert.rejects(orders.completeByArea("financeiro", order.id, "feito"), /não é desta área/);
    await orders.completeByArea("marketing", order.id, "Campanha agendada para 10/11.");
    assert.equal((await orders.list()).find((o) => o.id === order.id)?.status, "feita");
  });

  test("ordem para o Atendimento: concluída pelo agente aparece como feita", async () => {
    const order = await orders.create({ area: "atendimento", titulo: "Conferir conversas paradas da Loja X" });
    ids.orders.push(order.id);
    await queue.complete(order.agentTaskId!, { resumo: "3 vendedores lembrados." });
    const listed = (await orders.list()).find((o) => o.id === order.id);
    assert.equal(listed?.status, "feita");
    assert.match(listed?.resultado ?? "", /3 vendedores/);
    assert.match(listed?.feitaPor ?? "", /agente/i);
  });
});

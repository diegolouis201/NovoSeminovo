import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { CredihomeProposalInputSchema, CredihomeSimulateInputSchema, SendToCredihomeInputSchema } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import type { ContactsService } from "../marketing/contacts.service";
import type { NotificationsService } from "../notifications/notifications.service";
import { resetCredihomeToken } from "./credihome";
import { CredihomeService, credihomePhone } from "./credihome.service";

// Envio de leads de imóvel à Credihome contra um servidor falso que imita a
// API de parceiros (login → token, /simulations, /leads/{id}/journey).
// Precisa do PostgreSQL local (DATABASE_URL).
const withDb = Boolean(process.env.DATABASE_URL);

function fakeJwt(claims: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256" })}.${part(claims)}.assinatura`;
}

describe("Credihome: envio e fase do lead (servidor falso)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const notified: Array<Record<string, unknown>> = [];
  const contacts = { capture: async () => undefined } as unknown as ContactsService;
  const notifications = {
    notify: async (_userId: string, _type: string, payload: Record<string, unknown>) => void notified.push(payload),
  } as unknown as NotificationsService;
  const service = new CredihomeService(prisma, contacts, notifications);
  const tag = `teste-credihome-${Date.now()}`;
  const owner = { id: "" };
  const listings = { property: "", vehicle: "" };
  const calls: Array<{ method: string; path: string; auth?: string; body?: Record<string, unknown> }> = [];
  let logins = 0;
  let server: Server;
  const env = { ...process.env };
  const ids: string[] = [];

  const validInput = {
    cpf: "529.982.247-25",
    dateOfBirth: "1990-05-20",
    email: "comprador@teste.local",
    realtyPrice: 500000,
    mortgageValue: 350000,
    useFgts: true,
    consent: true as const,
  };

  before(async () => {
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
        const path = req.url ?? "";
        calls.push({ method: req.method ?? "", path, auth: req.headers.authorization, body });
        res.setHeader("Content-Type", "application/json");
        if (path === "/login") {
          if (body?.password !== "senha-certa") {
            res.statusCode = 401;
            return res.end(JSON.stringify({ message: "senha incorreta" }));
          }
          logins++;
          return res.end(JSON.stringify({ token: fakeJwt({ relatedId: 54717, exp: Math.floor(Date.now() / 1000) + 3600 }) }));
        }
        if (!req.headers.authorization?.startsWith("Bearer ")) {
          res.statusCode = 401;
          return res.end("{}");
        }
        if (path === "/simulations") {
          const user = body?.user as { cpf: string };
          if (user.cpf === "11144477735") {
            res.statusCode = 409;
            return res.end(JSON.stringify({ leadId: "lead-existente", name: "leadAlreadyExists", message: "Cliente já cadastrado" }));
          }
          return res.end(JSON.stringify({ leadId: "lead-novo", firstPayment: 3210.5, results: [] }));
        }
        if (path === "/simulador") {
          return res.end(
            JSON.stringify({
              financiamentoMaximo: 400000,
              errorMessage: [],
              resultados: [
                { operador: "Banco B", prestacaoFinal: 4100.5, taxaJurosAnual: 11.5, rendaMinima: 13700, tabela: "SAC" },
                { operador: "Banco A", prestacaoFinal: 3900.25, taxaJurosAnual: 10.9, rendaMinima: 13000, tabela: "SAC" },
                { operador: "Banco A", prestacaoFinal: 4300, taxaJurosAnual: 11.2, rendaMinima: 14000, tabela: "PRICE" },
                { operador: "Banco C", prestacaoFinal: 4200, taxaJurosAnual: 11.9, rendaMinima: 14000, tabela: "SAC" },
                { operador: "Banco D", prestacaoFinal: 4400, taxaJurosAnual: 12.1, rendaMinima: 14500, tabela: "SAC" },
                { operador: "Banco E", prestacaoFinal: 4500, taxaJurosAnual: 12.4, rendaMinima: 15000, tabela: "SAC" },
              ],
            }),
          );
        }
        if (path === "/leads/lead-novo/journey") return res.end(JSON.stringify({ phase: "lead" }));
        if (path === "/leads/lead-existente/journey") return res.end(JSON.stringify({ phase: "analise_credito" }));
        res.statusCode = 404;
        res.end("{}");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    process.env.CREDIHOME_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.CREDIHOME_LOGIN = "parceiro@teste.local";
    process.env.CREDIHOME_PASSWORD = "senha-certa";
    process.env.CREDIHOME_PARTNER_ID = "54717";
    resetCredihomeToken();
    owner.id = (await prisma.user.create({ data: { name: "Dono", email: `dono-${tag}@teste.local`, role: "buyer" } })).id;
    const makeListing = async (type: "property" | "vehicle") =>
      (
        await prisma.listing.create({
          data: { type, ownerUserId: owner.id, title: `Anúncio ${type}`, description: "Anúncio de teste do simulador", price: 500000, city: "BH", state: "MG", status: "active" },
        })
      ).id;
    listings.property = await makeListing("property");
    listings.vehicle = await makeListing("vehicle");
  });

  after(async () => {
    process.env = env;
    resetCredihomeToken();
    await prisma.financingLead.deleteMany({ where: { OR: [{ id: { in: ids } }, { listingId: { in: Object.values(listings) } }] } });
    await prisma.listing.deleteMany({ where: { ownerUserId: owner.id } });
    await prisma.user.deleteMany({ where: { id: owner.id } });
    await prisma.$disconnect();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const makeLead = async (assetType: "property" | "vehicle", phone = "5531999998888") => {
    const lead = await prisma.financingLead.create({
      data: { channel: "web", name: "Comprador Teste", phone, assetType, assetValue: 500000 },
    });
    ids.push(lead.id);
    return lead;
  };

  test("validação: CPF, idade, consentimento e valor a financiar", () => {
    assert.equal(SendToCredihomeInputSchema.safeParse(validInput).success, true);
    assert.equal(SendToCredihomeInputSchema.safeParse({ ...validInput, cpf: "111.111.111-11" }).success, false);
    assert.equal(SendToCredihomeInputSchema.safeParse({ ...validInput, dateOfBirth: "2015-01-01" }).success, false);
    assert.equal(SendToCredihomeInputSchema.safeParse({ ...validInput, consent: false }).success, false);
    assert.equal(SendToCredihomeInputSchema.safeParse({ ...validInput, mortgageValue: 600000 }).success, false);
    assert.equal(credihomePhone("5531999998888"), "31999998888");
    assert.equal(credihomePhone("(31) 99999-8888"), "31999998888");
  });

  test("envia o lead com partnerId, guarda o id e a fase, sem guardar o CPF", async () => {
    const lead = await makeLead("property");
    const result = await service.send(lead.id, SendToCredihomeInputSchema.parse(validInput));
    assert.deepEqual(result, { credihomeLeadId: "lead-novo", alreadyExisted: false });

    const sent = calls.find((call) => call.path === "/simulations");
    assert.ok(sent?.auth?.startsWith("Bearer "));
    assert.equal(sent?.body?.partnerId, 54717);
    assert.equal(sent?.body?.type, "mortgage");
    assert.equal(sent?.body?.downPayment, 150000);
    assert.deepEqual(sent?.body?.user, {
      name: "Comprador Teste",
      cpf: "52998224725",
      dateOfBirth: "1990-05-20",
      phone: "31999998888",
      email: "comprador@teste.local",
      useFgts: true,
    });

    const saved = await prisma.financingLead.findUniqueOrThrow({ where: { id: lead.id } });
    assert.equal(saved.credihomeLeadId, "lead-novo");
    assert.equal(saved.credihomePhase, "lead");
    assert.ok(saved.credihomeConsentAt);
    assert.equal(Number(saved.negotiatedValue), 350000);
    assert.equal(saved.bank, "Credihome");
    assert.equal(saved.email, "comprador@teste.local");
    assert.ok(!JSON.stringify(saved).includes("52998224725"));

    await assert.rejects(service.send(lead.id, SendToCredihomeInputSchema.parse(validInput)), /já foi enviado/);
  });

  test("lead que já existe na Credihome (409) é ligado ao existente", async () => {
    const lead = await makeLead("property");
    const result = await service.send(lead.id, SendToCredihomeInputSchema.parse({ ...validInput, cpf: "111.444.777-35" }));
    assert.deepEqual(result, { credihomeLeadId: "lead-existente", alreadyExisted: true });
    const saved = await prisma.financingLead.findUniqueOrThrow({ where: { id: lead.id } });
    assert.equal(saved.credihomePhase, "analise_credito");
  });

  test("token reaproveitado entre chamadas; veículo é recusado", async () => {
    assert.equal(logins, 1);
    const vehicle = await makeLead("vehicle");
    await assert.rejects(service.send(vehicle.id, SendToCredihomeInputSchema.parse(validInput)), /só faz financiamento de imóvel/);
  });

  test("rotina atualiza a fase dos leads enviados", async () => {
    await prisma.financingLead.updateMany({ where: { id: { in: ids }, credihomeLeadId: { not: null } }, data: { credihomePhase: null } });
    const result = await service.syncAll();
    assert.ok(result.updated >= 2);
    const phases = await prisma.financingLead.findMany({ where: { id: { in: ids }, credihomeLeadId: { not: null } }, select: { credihomePhase: true } });
    assert.deepEqual(phases.map((lead) => lead.credihomePhase).sort(), ["analise_credito", "lead"]);
  });

  test("senha errada: mensagem clara, sem vazar a senha", async () => {
    process.env.CREDIHOME_PASSWORD = "senha-errada";
    resetCredihomeToken();
    const lead = await makeLead("property");
    await assert.rejects(service.send(lead.id, SendToCredihomeInputSchema.parse(validInput)), (error: Error) => {
      assert.match(error.message, /Login da Credihome recusado/);
      assert.ok(!error.message.includes("senha-errada"));
      return true;
    });
    process.env.CREDIHOME_PASSWORD = "senha-certa";
    resetCredihomeToken();
  });

  const simulation = { realtyPrice: 500000, mortgageValue: 400000, dateOfBirth: "1990-05-20", months: 360, purchaseWindow: "3_a_6_meses" as const };

  test("simulador do anúncio: parcelas por banco, da menor para a maior", async () => {
    const result = await service.simulate(listings.property, CredihomeSimulateInputSchema.parse(simulation), "ip-sim");
    // Um por banco (a menor parcela), no máximo 4.
    assert.deepEqual(result.results.map((row) => row.bank), ["Banco A", "Banco B", "Banco C", "Banco D"]);
    assert.equal(result.results[0].firstPayment, 3900.25);
    assert.equal(result.maxFinancing, 400000);
    const sent = calls.filter((call) => call.path === "/simulador").at(-1);
    assert.equal(sent?.body?.dataNascimento, "20/05/1990");
    assert.equal(sent?.body?.calcularOutrosOperadores, true);
    await assert.rejects(service.simulate(listings.vehicle, CredihomeSimulateInputSchema.parse(simulation), "ip-sim"), /só para imóveis/);
  });

  test("pedido de proposta: card no quadro, enviado à Credihome com prazo, repetição não duplica", async () => {
    const proposal = CredihomeProposalInputSchema.parse({
      ...simulation,
      name: "Maria Compradora",
      cpf: "529.982.247-25",
      phone: "(31) 98888-7777",
      email: "maria@teste.local",
      useFgts: false,
      consent: true,
    });
    const first = await service.requestProposal(listings.property, proposal, "ip-prop");
    assert.equal(first.outcome, "sent");
    const lead = await prisma.financingLead.findFirstOrThrow({ where: { listingId: listings.property, phone: "31988887777" } });
    assert.equal(lead.credihomeLeadId, "lead-novo");
    assert.equal(Number(lead.downPayment), 100000);
    assert.match(lead.notes ?? "", /360 meses/);
    assert.equal(calls.filter((call) => call.path === "/simulations").at(-1)?.body?.duration, 360);
    assert.equal(notified.at(-1)?.channel, "simulador");

    const again = await service.requestProposal(listings.property, proposal, "ip-prop");
    assert.equal(again.outcome, "already_sent");
    assert.equal(await prisma.financingLead.count({ where: { listingId: listings.property, phone: "31988887777" } }), 1);
  });

  test("limite de pedidos de proposta por visitante", async () => {
    const proposal = CredihomeProposalInputSchema.parse({
      ...simulation,
      name: "Outra Pessoa",
      cpf: "111.444.777-35",
      phone: "31977776666",
      email: "outra@teste.local",
      useFgts: false,
      consent: true,
    });
    await service.requestProposal(listings.property, proposal, "ip-limite");
    await service.requestProposal(listings.property, proposal, "ip-limite");
    await service.requestProposal(listings.property, proposal, "ip-limite");
    await assert.rejects(service.requestProposal(listings.property, proposal, "ip-limite"), /Muitas simulações/);
  });
});

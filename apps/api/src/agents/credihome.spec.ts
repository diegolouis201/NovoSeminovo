import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { SendToCredihomeInputSchema } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
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
  const service = new CredihomeService(prisma);
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
  });

  after(async () => {
    process.env = env;
    resetCredihomeToken();
    await prisma.financingLead.deleteMany({ where: { id: { in: ids } } });
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
});

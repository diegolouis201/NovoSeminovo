import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { CONSENTIMENTO_CREDITO, CreditasProposalInputSchema, TERMO_BACEN_CREDITAS } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import type { ContactsService } from "../marketing/contacts.service";
import type { NotificationsService } from "../notifications/notifications.service";
import { creditasEnabled, resetCreditasToken } from "./creditas";
import { CreditasService } from "./creditas.service";

// Envio de leads de veículo à Creditas (Autofin C2C) contra um servidor falso
// que imita a autenticação de afiliado e a rota de leads. Precisa do
// PostgreSQL local (DATABASE_URL).
const withDb = Boolean(process.env.DATABASE_URL);

const KEY = "chave-de-teste-creditas";
const SECRET = "segredo-de-teste-creditas-123";

describe("Creditas: pedido de proposta do anúncio de veículo (servidor falso)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const notified: Array<Record<string, unknown>> = [];
  const contacts = { capture: async () => undefined } as unknown as ContactsService;
  const notifications = {
    notify: async (_userId: string, _type: string, payload: Record<string, unknown>) => void notified.push(payload),
  } as unknown as NotificationsService;
  const service = new CreditasService(prisma, contacts, notifications);
  const tag = `teste-creditas-${Date.now()}`;
  const owner = { id: "", partnerId: "" };
  const listings = { individual: "", store: "", property: "", noFinancing: "", noDetails: "", paused: "" };
  const calls: Array<{ path: string; headers: Record<string, string | string[] | undefined>; body?: Record<string, unknown> }> = [];
  let tokens = 0;
  let server: Server;
  const env = { ...process.env };
  const consentContext = { ip: "200.100.50.25", userAgent: "Mozilla/5.0 (Teste) Navegador/1.0" };

  const input = (patch: Record<string, unknown> = {}) =>
    CreditasProposalInputSchema.parse({
      name: "Maria Compradora",
      cpf: "529.982.247-25",
      birthDate: "1990-05-20",
      phone: "(31) 98888-7777",
      email: "maria@teste.local",
      downValue: 20000,
      timeToPurchase: "ONE_MONTH",
      consent: true,
      bacenConsent: true,
      ...patch,
    });
  const leadCalls = () => calls.filter((call) => call.path === "/b2b/autofin-c2c/leads");

  before(async () => {
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
        const path = req.url ?? "";
        calls.push({ path, headers: req.headers, body });
        res.setHeader("Content-Type", "application/json");
        if (path === "/api/affiliate_clients/tokens" && req.method === "POST") {
          if (req.headers["accept-version"] !== "v1" || body?.consumer_key !== KEY || body?.consumer_secret !== SECRET) {
            res.statusCode = 401;
            return res.end(JSON.stringify({ error: "invalid_client" }));
          }
          tokens++;
          return res.end(JSON.stringify({ access_token: `tok-${tokens}`, token_type: "bearer", refresh_token: "r", expires_in: 7200 }));
        }
        if (path === "/b2b/autofin-c2c/leads" && req.method === "POST") {
          if (!String(req.headers.authorization ?? "").startsWith("Bearer tok-")) {
            res.statusCode = 401;
            return res.end("{}");
          }
          const lead = body?.lead as { cpf: string };
          if (lead.cpf === "39053344705") {
            res.statusCode = 422;
            return res.end(JSON.stringify({ errors: [{ field: "lead.phone", message: "Telefone inválido" }], cpf: "39053344705" }));
          }
          if (lead.cpf === "11144477735") {
            // Servidor com defeito que devolve o que não devia: nada disso pode
            // aparecer no card, no log ou na notificação.
            res.statusCode = 500;
            return res.end(JSON.stringify({ message: `erro interno ${SECRET} ${KEY} Bearer ${req.headers.authorization}` }));
          }
          return res.end(JSON.stringify({ id: "3f1c9a2e-0000-4000-8000-00000000c0de" }));
        }
        res.statusCode = 404;
        res.end("{}");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.CREDITAS_AUTH_URL = base;
    process.env.CREDITAS_API_URL = base;
    process.env.CREDITAS_CONSUMER_KEY = KEY;
    process.env.CREDITAS_CONSUMER_SECRET = SECRET;
    process.env.CREDITAS_CONSUMER_KEY_FILE = "/caminho/que/nao/existe/creditas_consumer_key";
    process.env.CREDITAS_CONSUMER_SECRET_FILE = "/caminho/que/nao/existe/creditas_consumer_secret";
    resetCreditasToken();

    owner.id = (await prisma.user.create({ data: { name: "Dono", email: `dono-${tag}@teste.local`, role: "buyer" } })).id;
    owner.partnerId = (
      await prisma.partner.create({
        data: { ownerUserId: owner.id, type: "dealership", legalName: "Loja Teste", document: "00000000000191", slug: `loja-${tag}` },
      })
    ).id;
    const brand = await prisma.vehicleBrand.upsert({ where: { name: "Volkswagen" }, create: { name: "Volkswagen" }, update: {} });
    const model = await prisma.vehicleModel.upsert({
      where: { brandId_name: { brandId: brand.id, name: "Gol" } },
      create: { brandId: brand.id, name: "Gol" },
      update: {},
    });
    const details = {
      brandId: brand.id,
      modelId: model.id,
      version: "1.0 MPI",
      yearManufacture: 2020,
      yearModel: 2021,
      mileage: 30000,
      transmission: "manual" as const,
      fuelType: "flex" as const,
      color: "Prata",
      fipeCode: "005340-6",
    };
    const make = async (data: { type?: "vehicle" | "property"; partner?: boolean; financingEnabled?: boolean; withDetails?: boolean; status?: "active" | "paused" }) =>
      (
        await prisma.listing.create({
          data: {
            type: data.type ?? "vehicle",
            ownerUserId: owner.id,
            partnerId: data.partner ? owner.partnerId : undefined,
            title: `Anúncio ${tag}`,
            description: "Anúncio de teste da Creditas",
            price: 80000,
            city: "BH",
            state: "MG",
            status: data.status ?? "active",
            financingEnabled: data.financingEnabled ?? true,
            ...(data.withDetails !== false && (data.type ?? "vehicle") === "vehicle" ? { vehicleDetails: { create: details } } : {}),
          },
        })
      ).id;
    listings.individual = await make({});
    listings.store = await make({ partner: true });
    listings.property = await make({ type: "property" });
    listings.noFinancing = await make({ financingEnabled: false });
    listings.noDetails = await make({ withDetails: false });
    listings.paused = await make({ status: "paused" });
  });

  after(async () => {
    process.env = env;
    resetCreditasToken();
    await prisma.financingLead.deleteMany({ where: { listingId: { in: Object.values(listings) } } });
    await prisma.listing.deleteMany({ where: { ownerUserId: owner.id } });
    await prisma.partner.deleteMany({ where: { id: owner.partnerId } });
    await prisma.user.deleteMany({ where: { id: owner.id } });
    await prisma.$disconnect();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test("credenciais lidas do segredo: com as duas, a integração liga", () => {
    assert.equal(creditasEnabled(), true);
  });

  test("envia o lead exatamente no formato da Creditas e guarda só o id, sem CPF nem nascimento", async () => {
    const result = await service.requestProposal(listings.individual, input(), "ip-1", consentContext);
    assert.deepEqual(result, { outcome: "sent" });

    const auth = calls.find((call) => call.path === "/api/affiliate_clients/tokens");
    assert.equal(auth?.headers["accept-version"], "v1");
    assert.match(String(auth?.headers["content-type"]), /application\/json/);

    const sent = leadCalls().at(-1);
    assert.equal(sent?.headers.authorization, "Bearer tok-1");
    assert.match(String(sent?.headers["content-type"]), /application\/json/);
    assert.deepEqual(sent?.body, {
      lead: { name: "Maria Compradora", cpf: "52998224725", birthDate: "1990-05-20", phone: "31988887777", email: "maria@teste.local" },
      vehicle: { brand: "Volkswagen", model: "Gol", modelVersion: "1.0 MPI", modelYear: 2021, manufacturingYear: 2020, fipeCode: "005340-6" },
      simulationParameters: { financingValue: 60000, downValue: 20000, purchasePhase: "CONTACT_SELLER", timeToPurchase: "ONE_MONTH" },
      bacenAuthorization: { userIp: "200.100.50.25", userAgent: "Mozilla/5.0 (Teste) Navegador/1.0", authorizationTerm: TERMO_BACEN_CREDITAS.texto },
    });
    const term = (sent?.body?.bacenAuthorization as { authorizationTerm: string }).authorizationTerm;
    assert.match(term, /IBS CAPITAL CORRETORA DE SEGUROS LTDA/);
    assert.match(term, /61\.452\.517\/0001-06/);

    const lead = await prisma.financingLead.findFirstOrThrow({ where: { listingId: listings.individual, phone: "31988887777" } });
    assert.equal(lead.creditasLeadId, "3f1c9a2e-0000-4000-8000-00000000c0de");
    assert.ok(lead.creditasSentAt);
    assert.ok(lead.creditasConsentAt);
    assert.equal(lead.channel, "web");
    assert.equal(lead.assetType, "vehicle");
    assert.equal(Number(lead.assetValue), 80000);
    assert.equal(Number(lead.downPayment), 20000);
    assert.equal(Number(lead.negotiatedValue), 60000);
    assert.equal(lead.bank, "Creditas");
    assert.match(
      lead.notes ?? "",
      new RegExp(
        `Autorização de crédito versão ${CONSENTIMENTO_CREDITO.versao} e termo BACEN versão ${TERMO_BACEN_CREDITAS.versao} aceitos em \\d{2}/\\d{2}/\\d{4}`,
      ),
    );
    const stored = JSON.stringify(lead);
    assert.ok(!stored.includes("52998224725") && !stored.includes("529.982.247-25"), "CPF não pode ficar guardado");
    assert.ok(!stored.includes("1990-05-20"), "nascimento não pode ficar guardado");
    assert.equal(notified.at(-1)?.channel, "simulador");
    assert.equal(notified.at(-1)?.assetType, "vehicle");
    assert.match(String(notified.at(-1)?.creditas), /Creditas/);
  });

  test("anúncio de loja vai como CONTACT_STORE e o token é reaproveitado", async () => {
    await service.requestProposal(listings.store, input({ phone: "31977776666", timeToPurchase: "JUST_RESEARCHING", downValue: 0 }), "ip-2", consentContext);
    const sent = leadCalls().at(-1);
    assert.deepEqual(sent?.body?.simulationParameters, {
      financingValue: 80000,
      downValue: 0,
      purchasePhase: "CONTACT_STORE",
      timeToPurchase: "JUST_RESEARCHING",
    });
    assert.equal(tokens, 1);
    assert.equal(sent?.headers.authorization, "Bearer tok-1");
  });

  test("pedido repetido do mesmo telefone no mesmo anúncio não duplica nem reenvia", async () => {
    const before = leadCalls().length;
    const again = await service.requestProposal(listings.individual, input(), "ip-3", consentContext);
    assert.deepEqual(again, { outcome: "already_sent" });
    assert.equal(leadCalls().length, before);
    assert.equal(await prisma.financingLead.count({ where: { listingId: listings.individual, phone: "31988887777" } }), 1);
  });

  test("só anúncio de veículo publicado e com financiamento ligado", async () => {
    await assert.rejects(service.requestProposal(listings.property, input(), "ip-4", consentContext), /só para veículos/);
    await assert.rejects(service.requestProposal(listings.noFinancing, input(), "ip-4", consentContext), /financiamento/);
    await assert.rejects(service.requestProposal(listings.paused, input(), "ip-4", consentContext), /não encontrado/);
    await assert.rejects(service.requestProposal("nao-existe", input(), "ip-4", consentContext), /não encontrado/);
  });

  test("entrada igual ou maior que o preço é recusada", async () => {
    await assert.rejects(service.requestProposal(listings.individual, input({ downValue: 80000, phone: "31955554444" }), "ip-5", consentContext), /entrada/i);
    await assert.rejects(service.requestProposal(listings.individual, input({ downValue: 90000, phone: "31955554444" }), "ip-5", consentContext), /entrada/i);
  });

  test("anúncio sem marca/modelo/ano: card salvo, não enviado, com o motivo", async () => {
    const before = leadCalls().length;
    const result = await service.requestProposal(listings.noDetails, input({ phone: "31944443333" }), "ip-6", consentContext);
    assert.deepEqual(result, { outcome: "saved" });
    assert.equal(leadCalls().length, before);
    const lead = await prisma.financingLead.findFirstOrThrow({ where: { listingId: listings.noDetails, phone: "31944443333" } });
    assert.equal(lead.creditasLeadId, null);
    assert.match(lead.adminNotes ?? "", /Não foi à Creditas.*marca/);
  });

  test("Creditas recusou (4xx): card salvo com o motivo, CPF mascarado", async () => {
    const result = await service.requestProposal(listings.individual, input({ cpf: "390.533.447-05", phone: "31933332222" }), "ip-7", consentContext);
    assert.deepEqual(result, { outcome: "saved" });
    const lead = await prisma.financingLead.findFirstOrThrow({ where: { listingId: listings.individual, phone: "31933332222" } });
    assert.equal(lead.creditasLeadId, null);
    assert.match(lead.adminNotes ?? "", /Não foi à Creditas.*Telefone inválido · campo lead\.phone/);
    assert.ok(!(lead.adminNotes ?? "").includes("39053344705"));
    assert.match(String(notified.at(-1)?.creditas), /Telefone inválido/);
  });

  test("Creditas fora do ar (5xx): card salvo, sem chave, segredo ou token na mensagem", async () => {
    const result = await service.requestProposal(listings.individual, input({ cpf: "111.444.777-35", phone: "31922221111" }), "ip-8", consentContext);
    assert.deepEqual(result, { outcome: "saved" });
    const lead = await prisma.financingLead.findFirstOrThrow({ where: { listingId: listings.individual, phone: "31922221111" } });
    const texts = [lead.adminNotes ?? "", String(notified.at(-1)?.creditas)];
    for (const text of texts) {
      assert.match(text, /Não foi à Creditas|envie pelo quadro/);
      assert.ok(!text.includes(SECRET), "vazou o consumer_secret");
      assert.ok(!text.includes(KEY), "vazou o consumer_key");
      assert.ok(!/tok-\d/.test(text), "vazou o token");
    }
  });

  test("navegador com identificação gigante é cortado em 500 caracteres", async () => {
    await service.requestProposal(listings.store, input({ phone: "31911110000" }), "ip-9", { ip: "10.0.0.1", userAgent: "A".repeat(2000) });
    const sent = leadCalls().at(-1)?.body?.bacenAuthorization as { userAgent: string; userIp: string };
    assert.equal(sent.userAgent.length, 500);
    assert.equal(sent.userIp, "10.0.0.1");
  });

  test("limite de pedidos por visitante", async () => {
    const proposal = input({ phone: "31900009999", cpf: "390.533.447-05" });
    await service.requestProposal(listings.store, proposal, "ip-limite", consentContext);
    await service.requestProposal(listings.store, proposal, "ip-limite", consentContext);
    await service.requestProposal(listings.store, proposal, "ip-limite", consentContext);
    await assert.rejects(service.requestProposal(listings.store, proposal, "ip-limite", consentContext), /Muitos pedidos/);
  });

  test("credencial errada: mensagem clara, sem vazar a chave", async () => {
    process.env.CREDITAS_CONSUMER_SECRET = "segredo-errado-que-nao-pode-vazar";
    resetCreditasToken();
    await service.requestProposal(listings.store, input({ phone: "31988880000" }), "ip-10", consentContext);
    const lead = await prisma.financingLead.findFirstOrThrow({ where: { listingId: listings.store, phone: "31988880000" } });
    assert.match(lead.adminNotes ?? "", /Autenticação da Creditas recusada/);
    assert.ok(!(lead.adminNotes ?? "").includes("segredo-errado"));
    process.env.CREDITAS_CONSUMER_SECRET = SECRET;
    resetCreditasToken();
  });

  test("sem credenciais no servidor: card salvo e nada é enviado", async () => {
    delete process.env.CREDITAS_CONSUMER_SECRET;
    assert.equal(creditasEnabled(), false);
    const before = calls.length;
    const result = await service.requestProposal(listings.store, input({ phone: "31977770000" }), "ip-11", consentContext);
    assert.deepEqual(result, { outcome: "saved" });
    assert.equal(calls.length, before);
    process.env.CREDITAS_CONSUMER_SECRET = SECRET;
  });
});

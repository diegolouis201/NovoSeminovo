import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { CONSENTIMENTO_CREDITO, CredihomeProposalInputSchema, CreditasProposalInputSchema } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { AuthController } from "../auth/auth.controller";
import { PartnersController } from "../partners/partners.controller";
import { SalesCampaignController } from "../sales/sales.controller";
import { ListingContactService } from "../conversations/listing-contact.service";
import { ConversationsService } from "../conversations/conversations.service";
import { ListingsService } from "../listings/listings.service";
import { CredihomeService } from "../agents/credihome.service";
import { CreditasService } from "../agents/creditas.service";
import { AgentsService } from "../agents/agents.service";
import type { MetaConversionsService } from "./meta-conversions.service";
import type { MetaEventContext } from "./meta-conversions";

// Onde cada conversão nasce (Lead e CompleteRegistration) e se o id do
// evento que o site mandou chega igual à API de Conversões — e só quando o
// lead/cadastro foi criado de verdade (repetição não conta de novo).

const EVENT_ID = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";
type Tracked = { name: string; ctx: MetaEventContext | undefined; person: Record<string, unknown>; category?: string };

function fakeMeta() {
  const tracked: Tracked[] = [];
  const meta = {
    track: async (name: string, ctx: MetaEventContext | undefined, person: Record<string, unknown>, category?: string) => void tracked.push({ name, ctx, person, category }),
    listingCategory: async () => undefined,
  } as unknown as MetaConversionsService;
  return { meta, tracked };
}

const consentHeaders = { "x-ns-consent": "granted", "x-ns-event-id": EVENT_ID, "x-client-ip": "200.100.50.25" };
const request = (headers: Record<string, string> = consentHeaders) => ({ headers, ip: "127.0.0.1" }) as never;
const sent = (tracked: Tracked[]) => tracked.filter((item) => item.ctx);

describe("Conversões nas rotas (sem banco)", () => {
  const campaign = {
    name: "Carlos Lojista",
    company: "Auto Carlos",
    businessType: "loja",
    city: "Goiânia",
    state: "GO",
    phone: "(62) 99999-1111",
    email: "carlos@autocarlos.com.br",
    consent: true,
  };

  test("formulário da campanha para lojas: Lead com o id do site, e-mail, telefone e categoria lojas", async () => {
    const { meta, tracked } = fakeMeta();
    const ctrl = new SalesCampaignController({ campaignLead: async () => ({ id: "c1" }) } as never, meta);
    await ctrl.campaignLead(campaign, request({ ...consentHeaders, "x-client-ip": "10.7.7.1" }));
    assert.equal(sent(tracked).length, 1);
    const [event] = sent(tracked);
    assert.equal(event.name, "Lead");
    assert.equal(event.ctx?.eventId, EVENT_ID);
    assert.equal(event.category, "lojas");
    assert.equal(event.person.email, "carlos@autocarlos.com.br");
    assert.ok(String(event.person.phone).endsWith("999991111"));
  });

  test("sem aceite dos cookies: nada vai para a Meta; robô (campo isca) também não", async () => {
    const { meta, tracked } = fakeMeta();
    const ctrl = new SalesCampaignController({ campaignLead: async () => ({ id: "c1" }) } as never, meta);
    await ctrl.campaignLead(campaign, request({ "x-client-ip": "10.7.7.2" }));
    await ctrl.campaignLead({ ...campaign, website: "http://spam" }, request({ ...consentHeaders, "x-client-ip": "10.7.7.3" }));
    assert.equal(sent(tracked).length, 0);
  });

  test("cadastro de pessoa: CompleteRegistration com a conta criada", async () => {
    const { meta, tracked } = fakeMeta();
    const auth = { register: async () => ({ id: "u1", email: "ana@teste.local" }) };
    const ctrl = new AuthController(auth as never, {} as never, meta);
    await ctrl.register(
      { name: "Ana Souza", email: "ana@teste.local", password: "senha-segura-123", cpf: "529.982.247-25", phone: "(31) 98888-7777" },
      request(),
    );
    assert.equal(sent(tracked).length, 1);
    assert.equal(sent(tracked)[0].name, "CompleteRegistration");
    assert.equal(sent(tracked)[0].ctx?.eventId, EVENT_ID);
    assert.equal(sent(tracked)[0].category, "conta");
    assert.equal(sent(tracked)[0].person.userId, "u1");
  });

  test("cadastro de empresa: CompleteRegistration com categoria lojas, só depois de criar a loja", async () => {
    const { meta, tracked } = fakeMeta();
    const partners = { resolveCompany: async () => ({ type: "dealership" }), createPartnerRow: async () => undefined };
    const auth = { register: async () => ({ id: "u2" }), deleteUnusedUser: async () => undefined };
    const sales = { linkOwnerSignup: async () => undefined };
    const ctrl = new PartnersController(partners as never, {} as never, auth as never, sales as never, {} as never, {} as never, meta);
    const body = { name: "Dono", email: "dono@loja.local", password: "senha-segura-123", cpf: "529.982.247-25", cnpj: "11.222.333/0001-81" };
    await ctrl.signup(body, request());
    assert.equal(sent(tracked).length, 1);
    assert.equal(sent(tracked)[0].name, "CompleteRegistration");
    assert.equal(sent(tracked)[0].category, "lojas");

    const failing = new PartnersController(
      { ...partners, createPartnerRow: async () => Promise.reject(new Error("CNPJ já usado")) } as never,
      {} as never,
      auth as never,
      sales as never,
      {} as never,
      {} as never,
      meta,
    );
    await assert.rejects(failing.signup(body, request()));
    assert.equal(sent(tracked).length, 1, "cadastro desfeito não conta");
  });
});

const withDb = Boolean(process.env.DATABASE_URL);

describe("Conversões dos leads de anúncio e financiamento (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const tag = `meta-${Date.now()}`;
  const ids = { seller: "", store: "", buyer: "", partner: "", storeCar: "", house: "", car: "" };
  const ctx: MetaEventContext = { eventId: EVENT_ID, clientIp: "200.100.50.25" };
  const notifications = { notify: async () => undefined } as never;
  const contacts = { capture: async () => undefined } as never;
  const env = { ...process.env };

  before(async () => {
    for (const key of ["CREDIHOME_LOGIN", "CREDIHOME_PASSWORD", "CREDIHOME_PARTNER_ID", "CREDITAS_CONSUMER_KEY", "CREDITAS_CONSUMER_SECRET"]) delete process.env[key];
    process.env.CREDITAS_CONSUMER_KEY_FILE = "/nao/existe";
    process.env.CREDITAS_CONSUMER_SECRET_FILE = "/nao/existe";
    ids.seller = (await prisma.user.create({ data: { name: "Vendedor", email: `${tag}-v@teste.local`, role: "buyer" } })).id;
    ids.store = (await prisma.user.create({ data: { name: "Dona da Loja", email: `${tag}-l@teste.local`, role: "buyer" } })).id;
    ids.buyer = (await prisma.user.create({ data: { name: "Comprador", email: `${tag}-c@teste.local`, role: "buyer", phone: "31977776666" } })).id;
    ids.partner = (await prisma.partner.create({ data: { ownerUserId: ids.store, type: "dealership", legalName: "Loja Meta", document: "00000000000272", slug: tag } })).id;
    const base = { title: "Anúncio de teste", description: "Anúncio de teste das conversões.", price: 300000, city: "BH", state: "MG", status: "active" as const };
    ids.storeCar = (await prisma.listing.create({ data: { ...base, type: "vehicle", ownerUserId: ids.store, partnerId: ids.partner } })).id;
    ids.house = (await prisma.listing.create({ data: { ...base, type: "property", ownerUserId: ids.seller } })).id;
    ids.car = (await prisma.listing.create({ data: { ...base, price: 60000, type: "vehicle", ownerUserId: ids.seller, financingEnabled: true } })).id;
  });

  after(async () => {
    process.env = env;
    const listings = [ids.storeCar, ids.house, ids.car];
    await prisma.financingLead.deleteMany({ where: { OR: [{ listingId: { in: listings } }, { name: { startsWith: tag } }] } });
    await prisma.agentConversation.deleteMany({ where: { messages: { string_contains: tag } } }).catch(() => undefined);
    await prisma.message.deleteMany({ where: { conversation: { listingId: { in: listings } } } });
    await prisma.conversation.deleteMany({ where: { listingId: { in: listings } } });
    await prisma.lead.deleteMany({ where: { partnerId: ids.partner } });
    await prisma.listingContact.deleteMany({ where: { listingId: { in: listings } } });
    await prisma.listing.deleteMany({ where: { id: { in: listings } } });
    await prisma.partner.deleteMany({ where: { id: ids.partner } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.seller, ids.store, ids.buyer] } } });
    await prisma.$disconnect();
  });

  test("formulário do anúncio: Lead uma vez, com e-mail/telefone e categoria; reenvio não conta de novo", async () => {
    const { meta, tracked } = fakeMeta();
    const service = new ListingContactService(prisma, notifications, contacts, { emitNewMessage: () => undefined } as never, meta);
    const input = { name: "Ana Souza", email: `${tag}-a@teste.local`, phone: "31999990000", message: "Olá, tenho interesse no anúncio.", wantsSimilar: false };
    const first = await service.send(ids.house, input, undefined, undefined, ctx);
    const again = await service.send(ids.house, input, undefined, undefined, ctx);
    // O site só dispara o pixel quando a API contou o lead (mesmo id, contado uma vez).
    assert.equal(first.leadCreated, true);
    assert.equal(again.leadCreated, undefined);
    assert.equal(tracked.length, 1);
    assert.equal(tracked[0].name, "Lead");
    assert.equal(tracked[0].ctx?.eventId, EVENT_ID);
    assert.equal(tracked[0].category, "imovel");
    assert.equal(tracked[0].person.email, input.email);
    assert.equal(tracked[0].person.phone, "31999990000");
  });

  test("clique no WhatsApp de loja: Lead só no primeiro clique", async () => {
    const { meta, tracked } = fakeMeta();
    const unused = {} as never;
    const listings = new ListingsService(prisma, unused, unused, unused, unused, unused, unused, unused, meta);
    assert.deepEqual(await listings.registerWhatsappClick(ids.storeCar, ids.buyer, undefined, ctx), { leadCreated: true });
    assert.deepEqual(await listings.registerWhatsappClick(ids.storeCar, ids.buyer, undefined, ctx), { leadCreated: false });
    assert.deepEqual(await listings.registerWhatsappClick(ids.house, ids.buyer, undefined, ctx), { leadCreated: false }, "anúncio de particular não vira lead");
    assert.equal(tracked.length, 1);
    assert.equal(tracked[0].category, "veiculo");
    assert.equal(tracked[0].person.userId, ids.buyer);
  });

  test("chat com a loja: Lead só quando o card do funil é criado", async () => {
    const { meta, tracked } = fakeMeta();
    const conversations = new ConversationsService(prisma, notifications, { emitNewMessage: () => undefined } as never, meta);
    await conversations.startConversation(ids.buyer, ids.storeCar, undefined, ctx);
    await conversations.startConversation(ids.buyer, ids.storeCar, undefined, ctx);
    assert.equal(tracked.length, 1);
    assert.equal(tracked[0].ctx?.eventId, EVENT_ID);
    assert.equal(tracked[0].person.userId, ids.buyer);
  });

  test("simulador Credihome (proposta): Lead de imóvel uma vez", async () => {
    const { meta, tracked } = fakeMeta();
    const service = new CredihomeService(prisma, contacts, notifications, meta);
    const proposal = CredihomeProposalInputSchema.parse({
      realtyPrice: 300000,
      mortgageValue: 200000,
      months: 360,
      dateOfBirth: "1990-05-20",
      purchaseWindow: "ate_3_meses",
      name: "Maria Compradora",
      cpf: "529.982.247-25",
      phone: "(31) 98888-1234",
      email: "maria.meta@teste.local",
      useFgts: false,
      consent: true,
      consentVersion: CONSENTIMENTO_CREDITO.imovel.versao,
    });
    const consentContext = { ip: "200.1.1.1", userAgent: "Teste" };
    await service.requestProposal(ids.house, proposal, "ip-meta-1", consentContext, undefined, undefined, ctx);
    await service.requestProposal(ids.house, proposal, "ip-meta-1", consentContext, undefined, undefined, ctx);
    assert.equal(tracked.length, 1);
    assert.equal(tracked[0].category, "imovel");
    assert.equal(tracked[0].person.email, "maria.meta@teste.local");
  });

  test("formulário Creditas: Lead de veículo uma vez", async () => {
    const { meta, tracked } = fakeMeta();
    const service = new CreditasService(prisma, contacts, notifications, meta);
    const input = CreditasProposalInputSchema.parse({
      name: "João Comprador",
      cpf: "529.982.247-25",
      birthDate: "1990-05-20",
      phone: "(31) 98888-4321",
      email: "joao.meta@teste.local",
      downValue: 10000,
      timeToPurchase: "ONE_MONTH",
      consent: true,
      bacenConsent: true,
      consentVersion: CONSENTIMENTO_CREDITO.veiculo.versao,
    });
    const consent = { ip: "200.100.50.25", userAgent: "Mozilla/5.0" };
    await service.requestProposal(ids.car, input, "ip-meta-2", consent, undefined, undefined, ctx);
    await service.requestProposal(ids.car, input, "ip-meta-2", consent, undefined, undefined, ctx);
    assert.equal(tracked.length, 1);
    assert.equal(tracked[0].category, "veiculo");
    assert.equal(tracked[0].ctx?.eventId, EVENT_ID);
  });

  test("assistente do site registra financiamento: Lead com o id do site e aviso para o navegador", async () => {
    const { meta, tracked } = fakeMeta();
    process.env.ANTHROPIC_API_KEY = "chave-falsa-de-teste";
    const service = new AgentsService(prisma, notifications, {} as never, {} as never, {} as never, {} as never, contacts, meta);
    let round = 0;
    const client = {
      messages: {
        create: async () => {
          round++;
          if (round % 2 === 1) {
            return {
              stop_reason: "tool_use",
              content: [
                {
                  type: "tool_use",
                  id: `tool-${round}`,
                  name: "registrar_interesse_financiamento",
                  input: { nome: `${tag} Pedro`, telefone: "(31) 96666-5555", email: "pedro@teste.local", tipo: "property" },
                },
              ],
            };
          }
          return { stop_reason: "end_turn", content: [{ type: "text", text: "Pronto, registrei seu interesse." }] };
        },
      },
    };
    (service as unknown as { client: unknown }).client = client;
    const first = await service.sendWebMessage("buyer", { message: "Quero financiar, meu telefone é 31 96666-5555" }, undefined, "ip-meta-3", undefined, ctx);
    assert.equal(first.financingLeadCreated, true);
    assert.equal(tracked.length, 1);
    assert.equal(tracked[0].ctx?.eventId, EVENT_ID);
    assert.equal(tracked[0].category, "imovel");
    assert.equal(tracked[0].person.phone, "31966665555");

    // Mesmo pedido de novo na conversa: atualiza o card, não é lead novo.
    const again = await service.sendWebMessage("buyer", { conversationId: first.conversationId, message: "Pode registrar de novo" }, undefined, "ip-meta-3", undefined, ctx);
    assert.equal(again.financingLeadCreated, undefined);
    assert.equal(tracked.length, 1);
    await prisma.financingLead.deleteMany({ where: { conversationId: first.conversationId } });
    await prisma.agentConversation.deleteMany({ where: { id: first.conversationId } });
  });
});

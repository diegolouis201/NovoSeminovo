import { createHmac } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { hubPermissionsOf, originChannelLabel, type HubAccess } from "@novoseminovo/shared-types";
import {
  checkSubscription,
  guessInterest,
  isB2BLead,
  leadgenChangesOf,
  mapLeadFields,
  metaLeadsConfig,
  normalizeFieldKey,
  verifyMetaSignature,
} from "./meta-leads";
import { MetaLeadsController } from "./meta-leads.controller";
import { MetaLeadsService } from "./meta-leads.service";

// Etapa 2b de marketing: formulários de Lead Ads da Meta (Instagram e
// Facebook) caem no CRM. Dormente até o Diego salvar os três arquivos em
// secrets/ (meta_app_secret, meta_webhook_verify_token, meta_page_token):
// sem eles o webhook responde 404 e nada é lido da Meta.

const APP_SECRET = "segredo-do-app-de-teste-0123456789";
const VERIFY = "token-de-verificacao-de-teste-abc123";
const PAGE_TOKEN = "EAApageTokenDeTesteMuitoSecreto987654321";
const PAGE_ID = "828845163855705";

const sign = (body: string, secret = APP_SECRET) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
const missingFile = () => {
  throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
};
const field = (name: string, value: string) => ({ name, values: [value] });
const payload = (changes: Array<Record<string, unknown>>, object = "page") => ({
  object,
  entry: [{ id: PAGE_ID, time: 1731590000, changes: changes.map((value) => ({ field: "leadgen", value })) }],
});

describe("Lead Ads: configuração (só arquivos em secrets/)", () => {
  test("sem o segredo do app ou sem o token de verificação fica desligado", () => {
    const files: Record<string, string> = {
      "/run/secrets/meta_app_secret": APP_SECRET,
      "/run/secrets/meta_webhook_verify_token": VERIFY,
      "/run/secrets/meta_page_token": PAGE_TOKEN,
    };
    const reader = (path: string) => {
      if (path in files) return files[path]!;
      return missingFile();
    };
    const full = metaLeadsConfig({ NODE_ENV: "production", META_PAGE_ID: PAGE_ID }, reader);
    assert.equal(full.appSecret, APP_SECRET);
    assert.equal(full.verifyToken, VERIFY);
    assert.equal(full.pageToken, PAGE_TOKEN);
    assert.equal(full.pageId, PAGE_ID);
    assert.equal(full.graphVersion, "v23.0");
    const none = metaLeadsConfig({ NODE_ENV: "production", META_APP_SECRET: APP_SECRET, META_PAGE_ID: PAGE_ID }, missingFile);
    assert.equal(none.appSecret, undefined, "em produção a variável de ambiente não vale");
    assert.equal(none.verifyToken, undefined);
    assert.equal(none.pageToken, undefined);
    assert.equal(metaLeadsConfig({ META_PAGE_ID: "123abc" }, reader).pageId, undefined, "id da página só com números");
    assert.equal(metaLeadsConfig({ META_PAGE_ID: PAGE_ID }, () => "curto").appSecret, undefined, "segredo curto demais não vale");
    assert.deepEqual(metaLeadsConfig({ META_LEADS_B2B_WORDS: "Lojas, revenda,<script>,x" }, reader).b2bWords, ["lojas", "revenda"]);
    assert.ok(metaLeadsConfig({}, reader).b2bWords.includes("imobili"));
  });
});

describe("Lead Ads: assinatura X-Hub-Signature-256", () => {
  const body = JSON.stringify(payload([{ leadgen_id: "1", page_id: PAGE_ID, form_id: "2", created_time: 1 }]));

  test("válida passa; inválida, de outro segredo, sem prefixo ou ausente é recusada", () => {
    assert.equal(verifyMetaSignature(Buffer.from(body), sign(body), APP_SECRET), true);
    assert.equal(verifyMetaSignature(Buffer.from(body), sign(body, "outro-segredo-qualquer-1234567"), APP_SECRET), false);
    assert.equal(verifyMetaSignature(Buffer.from(`${body} `), sign(body), APP_SECRET), false, "corpo alterado");
    assert.equal(verifyMetaSignature(Buffer.from(body), sign(body).replace("sha256=", ""), APP_SECRET), false);
    assert.equal(verifyMetaSignature(Buffer.from(body), "sha256=abc", APP_SECRET), false);
    assert.equal(verifyMetaSignature(Buffer.from(body), undefined, APP_SECRET), false);
    assert.equal(verifyMetaSignature(undefined, sign(body), APP_SECRET), false);
  });
});

describe("Lead Ads: verificação do webhook (GET)", () => {
  test("hub.mode=subscribe com o token certo devolve o challenge", () => {
    assert.equal(checkSubscription({ "hub.mode": "subscribe", "hub.verify_token": VERIFY, "hub.challenge": "1158201444" }, VERIFY), "1158201444");
  });

  test("token errado, modo errado ou challenge estranho: recusa", () => {
    assert.equal(checkSubscription({ "hub.mode": "subscribe", "hub.verify_token": "errado", "hub.challenge": "1" }, VERIFY), undefined);
    assert.equal(checkSubscription({ "hub.mode": "unsubscribe", "hub.verify_token": VERIFY, "hub.challenge": "1" }, VERIFY), undefined);
    assert.equal(checkSubscription({ "hub.mode": "subscribe", "hub.verify_token": VERIFY, "hub.challenge": "<script>alert(1)</script>" }, VERIFY), undefined);
    assert.equal(checkSubscription({ "hub.mode": "subscribe", "hub.verify_token": VERIFY, "hub.challenge": "9".repeat(80) }, VERIFY), undefined);
    assert.equal(checkSubscription({ "hub.mode": "subscribe", "hub.verify_token": [VERIFY], "hub.challenge": "1" }, VERIFY), undefined);
    assert.equal(checkSubscription({}, VERIFY), undefined);
  });
});

describe("Lead Ads: corpo do webhook", () => {
  test("só object=page com mudanças leadgen válidas", () => {
    const ok = leadgenChangesOf(payload([{ leadgen_id: "444", page_id: PAGE_ID, form_id: "555", ad_id: "666", adgroup_id: "777", created_time: 1731590000 }]));
    assert.deepEqual(ok, [{ leadgenId: "444", pageId: PAGE_ID, formId: "555", adId: "666", adgroupId: "777", createdTime: 1731590000 }]);
    assert.equal(leadgenChangesOf(payload([{ leadgen_id: "1", page_id: PAGE_ID, form_id: "2", created_time: 1 }], "user")), undefined);
    assert.equal(leadgenChangesOf("lixo"), undefined);
    assert.equal(leadgenChangesOf({ object: "page", entry: "x" }), undefined);
    // leadgen com id que não é número (ou com SQL) é descartado; outro campo é ignorado
    const mixed = leadgenChangesOf({
      object: "page",
      entry: [
        {
          id: PAGE_ID,
          time: 1,
          changes: [
            { field: "feed", value: { item: "post" } },
            { field: "leadgen", value: { leadgen_id: "1'; DROP TABLE x; --", page_id: PAGE_ID, form_id: "2", created_time: 1 } },
            { field: "leadgen", value: { leadgen_id: "9".repeat(40), page_id: PAGE_ID, form_id: "2", created_time: 1 } },
            { field: "leadgen", value: { leadgen_id: "321", page_id: PAGE_ID, form_id: "2", created_time: 1 } },
          ],
        },
      ],
    });
    assert.deepEqual(mixed?.map((c) => c.leadgenId), ["321"]);
  });
});

describe("Lead Ads: campos do formulário", () => {
  test("chave normalizada: minúsculas, sem acento, só _", () => {
    assert.equal(normalizeFieldKey("Qual é o seu Tipo de Empresa?"), "qual_e_o_seu_tipo_de_empresa");
    assert.equal(normalizeFieldKey("  Número de WhatsApp "), "numero_de_whatsapp");
  });

  test("chaves padrão em inglês", () => {
    const m = mapLeadFields([
      field("full_name", "Maria Souza"),
      field("email", " Maria@Exemplo.COM "),
      field("phone_number", "+5531988887777"),
      field("company_name", "Auto Center BH"),
      field("city", "Belo Horizonte"),
      field("state", "Minas Gerais"),
      field("job_title", "Gerente"),
    ]);
    assert.deepEqual(m, { name: "Maria Souza", email: "maria@exemplo.com", phone: "31988887777", company: "Auto Center BH", city: "Belo Horizonte", state: "MG", jobTitle: "Gerente" });
    assert.equal(mapLeadFields([field("first_name", "João"), field("last_name", "Silva")]).name, "João Silva");
  });

  test("perguntas personalizadas em português", () => {
    const m = mapLeadFields([
      field("nome", "Carla Dias"),
      field("Qual o nome da sua empresa?", "Imobiliária Lar"),
      field("cidade", "Contagem"),
      field("UF", "mg"),
      field("Número de WhatsApp", "(31) 97777-6666"),
      field("tipo_de_empresa", "Imobiliária"),
      field("e-mail", "carla@lar.com.br"),
    ]);
    assert.equal(m.name, "Carla Dias");
    assert.equal(m.company, "Imobiliária Lar");
    assert.equal(m.city, "Contagem");
    assert.equal(m.state, "MG");
    assert.equal(m.phone, "31977776666");
    assert.equal(m.businessType, "imobiliaria");
    assert.equal(m.email, "carla@lar.com.br");
    assert.equal(mapLeadFields([field("voce_e", "Corretor autônomo")]).businessType, "corretor");
    assert.equal(mapLeadFields([field("tipo", "Loja de carros")]).businessType, "loja");
    assert.equal(mapLeadFields([field("tipo", "Outro")]).businessType, undefined);
  });

  test("texto suspeito: sem < >, cortado no tamanho máximo; e-mail e telefone inválidos somem", () => {
    const m = mapLeadFields([
      field("full_name", `<img src=x onerror=alert(1)>${"a".repeat(500)}`),
      field("email", "nao-e-email"),
      field("phone_number", "123"),
      field("company_name", "Loja'); DROP TABLE sales_prospects; --"),
      field("state", "XX"),
    ]);
    assert.ok(!/[<>]/.test(m.name!));
    assert.ok(m.name!.length <= 120);
    assert.equal(m.email, undefined);
    assert.equal(m.phone, undefined);
    assert.equal(m.company, "Loja'); DROP TABLE sales_prospects; --");
    assert.equal(m.state, undefined);
    assert.deepEqual(mapLeadFields("lixo" as never), {});
    assert.deepEqual(mapLeadFields(Array.from({ length: 500 }, () => ({ name: 1, values: "x" })) as never), {});
  });

  test("B2B pelo nome do formulário/campanha (sem acento e maiúsculas) ou pelo campo empresa", () => {
    const words = metaLeadsConfig({}, () => "").b2bWords;
    assert.equal(isB2BLead({ formName: "Cadastro LOJAS BH" }, words), true);
    assert.equal(isB2BLead({ campaignName: "Imobiliárias Novembro" }, words), true);
    assert.equal(isB2BLead({ campaignName: "corretores_mg" }, words), true);
    assert.equal(isB2BLead({ formName: "Programa de Parceiros" }, words), true);
    assert.equal(isB2BLead({ formName: "Compradores SUV", fields: { company: "Empresa X" } }, words), true);
    assert.equal(isB2BLead({ formName: "Compradores SUV", campaignName: "Financiamento carros" }, words), false);
    assert.equal(isB2BLead({}, words), false);
  });

  test("interesse do comprador pelo nome do formulário/campanha", () => {
    assert.equal(guessInterest("Compradores SUV seminovos"), "comprar_carro");
    assert.equal(guessInterest("Apartamentos BH - imóveis"), "comprar_imovel");
    assert.equal(guessInterest("Financiamento de veículo"), "comprar_carro");
    assert.equal(guessInterest("Promoção geral"), "geral");
  });

  test("rótulo de origem: formulário da Meta separado do anúncio que leva ao site", () => {
    assert.equal(originChannelLabel("meta_ads", "lead_form"), "Formulário Meta (Instagram/Facebook)");
    assert.equal(originChannelLabel("meta_ads", "paid"), "Anúncio Meta (Instagram/Facebook)");
    assert.equal(originChannelLabel("google"), "Google (busca)");
    assert.equal(originChannelLabel("desconhecido"), "desconhecido");
  });
});

describe("Lead Ads: webhook desligado sem configuração", () => {
  const env = { ...process.env };
  after(() => {
    process.env = env;
  });

  test("sem os arquivos: GET e POST respondem 404 e nada é processado", async () => {
    process.env = { ...env, NODE_ENV: "production", META_APP_SECRET_FILE: "/nao/existe", META_WEBHOOK_VERIFY_TOKEN_FILE: "/nao/existe", META_PAGE_TOKEN_FILE: "/nao/existe" };
    let received = 0;
    const ctrl = new MetaLeadsController({ receive: () => void received++ } as never);
    assert.throws(() => ctrl.verify({ "hub.mode": "subscribe", "hub.verify_token": VERIFY, "hub.challenge": "1" }), (e: { status?: number }) => e.status === 404);
    const body = JSON.stringify(payload([]));
    assert.throws(() => ctrl.receive({ rawBody: Buffer.from(body), body: JSON.parse(body) } as never, sign(body)), (e: { status?: number }) => e.status === 404);
    assert.equal(received, 0);
  });
});

describe("Lead Ads: controller com configuração", () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env = { ...env, NODE_ENV: "test", META_APP_SECRET: APP_SECRET, META_WEBHOOK_VERIFY_TOKEN: VERIFY, META_APP_SECRET_FILE: "/nao/existe", META_WEBHOOK_VERIFY_TOKEN_FILE: "/nao/existe" };
  });
  after(() => {
    process.env = env;
  });

  test("GET: challenge com o token certo; 403 com o errado", () => {
    const ctrl = new MetaLeadsController({} as never);
    assert.equal(ctrl.verify({ "hub.mode": "subscribe", "hub.verify_token": VERIFY, "hub.challenge": "987654" }), "987654");
    assert.throws(() => ctrl.verify({ "hub.mode": "subscribe", "hub.verify_token": "x", "hub.challenge": "1" }), (e: { status?: number }) => e.status === 403);
  });

  test("POST: assinatura errada ou ausente = 403; corpo grande = 413; corpo inválido = 400; válido = enfileira", () => {
    const received: unknown[] = [];
    const ctrl = new MetaLeadsController({ receive: (changes: unknown) => (received.push(changes), 1) } as never);
    const body = JSON.stringify(payload([{ leadgen_id: "111", page_id: PAGE_ID, form_id: "222", created_time: 1731590000 }]));
    const req = (raw: string) => ({ rawBody: Buffer.from(raw), body: JSON.parse(raw) }) as never;
    assert.throws(() => ctrl.receive(req(body), sign(body, "segredo-errado-de-teste-123456789")), (e: { status?: number }) => e.status === 403);
    assert.throws(() => ctrl.receive(req(body), undefined), (e: { status?: number }) => e.status === 403);
    const big = JSON.stringify({ ...payload([]), pad: "x".repeat(300_000) });
    assert.throws(() => ctrl.receive(req(big), sign(big)), (e: { status?: number }) => e.status === 413);
    const bad = JSON.stringify({ object: "user", entry: [] });
    assert.throws(() => ctrl.receive(req(bad), sign(bad)), (e: { status?: number }) => e.status === 400);
    assert.equal(received.length, 0);
    assert.deepEqual(ctrl.receive(req(body), sign(body)), { ok: true });
    assert.equal(received.length, 1);
  });
});

const withDb = Boolean(process.env.DATABASE_URL);

describe("Lead Ads → CRM (banco local + Graph API falsa)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const { PrismaService } = require("../prisma/prisma.service") as typeof import("../prisma/prisma.service");
  const { SalesService } = require("../sales/sales.service") as typeof import("../sales/sales.service");
  const { ContactsService } = require("../marketing/contacts.service") as typeof import("../marketing/contacts.service");
  const prisma = new PrismaService();
  const tag = `mla${Date.now()}`;
  const seed = String(Date.now()).slice(-7);
  const leadId = (n: number) => `7${seed}${String(n).padStart(2, "0")}`;
  const phone = (n: number) => `319${seed.slice(-4)}${String(n).padStart(4, "0")}`;
  const env = { ...process.env };
  let server: Server;
  let failLeads = false;
  const calls: Array<{ url: string; auth?: string }> = [];
  const logs: string[] = [];
  const leads = new Map<string, Record<string, unknown>>();
  const forms: Record<string, string> = { "9001": `Cadastro Lojas ${tag}`, "9002": `Compradores SUV ${tag}`, "9003": `Apartamentos BH ${tag}` };
  const formLeads = new Map<string, string[]>();

  const lead = (n: number, formId: string, fieldData: Array<{ name: string; values: string[] }>, extra: Record<string, unknown> = {}) => {
    leads.set(leadId(n), {
      id: leadId(n),
      created_time: new Date().toISOString().replace("Z", "+0000"),
      field_data: fieldData,
      form_id: formId,
      ad_id: "6001",
      ad_name: "Vídeo Lojas 1",
      adset_name: "Donos de loja MG",
      campaign_name: `Lojas Novembro ${tag}`,
      platform: "ig",
      is_organic: false,
      ...extra,
    });
  };

  const service = () => {
    const created = new MetaLeadsService(prisma, new SalesService(prisma), new ContactsService(prisma));
    const log = (message: unknown) => void logs.push(String(message));
    (created as unknown as { logger: unknown }).logger = { warn: log, error: log, log };
    return created;
  };

  before(async () => {
    server = createServer((req: IncomingMessage, res) => {
      const url = new URL(req.url ?? "/", "http://x");
      calls.push({ url: req.url ?? "", auth: req.headers.authorization });
      res.setHeader("Content-Type", "application/json");
      if (req.headers.authorization !== `Bearer ${PAGE_TOKEN}`) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ error: { message: "bad token", type: "OAuthException", code: 190 } }));
      }
      const parts = url.pathname.split("/").filter(Boolean); // [v23.0, id, edge?]
      const [, id, edge] = parts;
      if (failLeads) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: { message: `Invalid OAuth access token ${PAGE_TOKEN} de maria@exemplo.com 31988887777`, type: "OAuthException", code: 190 } }));
      }
      if (id === PAGE_ID && edge === "leadgen_forms") return res.end(JSON.stringify({ data: Object.entries(forms).map(([fid, name]) => ({ id: fid, name, status: "ACTIVE" })) }));
      if (id && edge === "leads") {
        const ids = formLeads.get(id) ?? [];
        return res.end(JSON.stringify({ data: ids.map((l) => leads.get(l)).filter(Boolean) }));
      }
      if (id && forms[id] && !edge) return res.end(JSON.stringify({ id, name: forms[id] }));
      if (id && leads.has(id)) return res.end(JSON.stringify(leads.get(id)));
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: { message: "not found", code: 100 } }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    process.env = {
      ...env,
      NODE_ENV: "test",
      META_APP_SECRET: APP_SECRET,
      META_WEBHOOK_VERIFY_TOKEN: VERIFY,
      META_PAGE_TOKEN: PAGE_TOKEN,
      META_APP_SECRET_FILE: "/nao/existe",
      META_WEBHOOK_VERIFY_TOKEN_FILE: "/nao/existe",
      META_PAGE_TOKEN_FILE: "/nao/existe",
      META_PAGE_ID: PAGE_ID,
      META_GRAPH_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    };
  });

  after(async () => {
    process.env = env;
    server.close();
    const cards = await prisma.salesProspect.findMany({ where: { OR: [{ name: { contains: tag } }, { email: { contains: tag } }] }, select: { id: true } });
    await prisma.hubTask.deleteMany({ where: { prospectId: { in: cards.map((c) => c.id) } } });
    await prisma.salesProspect.deleteMany({ where: { id: { in: cards.map((c) => c.id) } } });
    await prisma.marketingContact.deleteMany({ where: { email: { contains: tag } } });
    await prisma.metaLeadgen.deleteMany({ where: { leadgenId: { startsWith: `7${seed}` } } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    calls.length = 0;
    logs.length = 0;
    failLeads = false;
  });

  test("formulário de lojas vira card de campanha com origem do anúncio, anotação e tarefa", async () => {
    lead(1, "9001", [
      field("full_name", "Maria Lojista"),
      field("email", `maria-${tag}@teste.local`),
      field("phone_number", `+55${phone(1)}`),
      field("company_name", `Auto Center ${tag}`),
      field("cidade", "Belo Horizonte"),
      field("uf", "MG"),
    ]);
    const s = service();
    assert.equal(s.receive(leadgenChangesOf(payload([{ leadgen_id: leadId(1), page_id: PAGE_ID, form_id: "9001", created_time: 1 }]))!), 1);
    await s.idle();
    const card = await prisma.salesProspect.findFirstOrThrow({ where: { email: `maria-${tag}@teste.local` }, include: { notes: true, hubTasks: true } });
    assert.equal(card.source, "campanha");
    assert.equal(card.stage, "a_abordar");
    assert.equal(card.segment, "vehicle");
    assert.equal(card.businessType, "loja");
    assert.equal(card.phone, phone(1));
    assert.equal(card.state, "MG");
    assert.deepEqual(
      [card.acqSource, card.acqMedium, card.acqCampaign, card.acqContent, card.acqTerm, card.acqClickId],
      ["meta_ads", "lead_form", `lojas_novembro_${tag}`, "Vídeo Lojas 1", "Donos de loja MG", null],
    );
    assert.ok(card.notes.some((n) => n.body.includes(`Formulário do Instagram/Facebook: ${forms["9001"]}`)), "anotação com o nome do formulário");
    assert.ok(card.notes.some((n) => n.body.includes("Formulário de Lead Ads da Meta (política de privacidade do NovoSeminovo no formulário)")), "registro da autorização");
    assert.ok(!card.notes.some((n) => n.body.includes(phone(1))), "telefone fora do texto");
    assert.equal(card.hubTasks.length, 1);
    assert.match(card.hubTasks[0]!.title, /lead de campanha/i);
    // token no cabeçalho, nunca na URL
    assert.ok(calls.length > 0);
    assert.ok(calls.every((c) => !c.url.includes(PAGE_TOKEN) && !c.url.includes("access_token")));
    assert.ok(calls.some((c) => c.url.startsWith(`/v23.0/${leadId(1)}?`) && c.url.includes("field_data")));
    const row = await prisma.metaLeadgen.findUniqueOrThrow({ where: { leadgenId: leadId(1) } });
    assert.equal(row.status, "done");
    assert.equal(row.route, "b2b");

    // Aparece no CRM do Hub como "Formulário Meta" e conta na campanha dos Gastos.
    const { CrmService } = require("../crm/crm.service") as typeof import("../crm/crm.service");
    const feed = await new CrmService(prisma, { syncPartners: async () => undefined } as never).clientes();
    const item = feed.prospeccao.find((p) => p.cardId === card.id);
    assert.equal(item?.origem, "campanha");
    assert.equal(item?.origemMarketing?.meio, "lead_form");
    assert.equal(originChannelLabel(item?.origemMarketing?.canal, item?.origemMarketing?.meio), "Formulário Meta (Instagram/Facebook)");
  });

  test("webhook repetido (Meta reenvia) não duplica nada nem chama a Graph de novo", async () => {
    const s = service();
    s.receive(leadgenChangesOf(payload([{ leadgen_id: leadId(1), page_id: PAGE_ID, form_id: "9001", created_time: 1 }]))!);
    s.receive(leadgenChangesOf(payload([{ leadgen_id: leadId(1), page_id: PAGE_ID, form_id: "9001", created_time: 1 }]))!);
    await s.idle();
    assert.equal(calls.length, 0);
    const card = await prisma.salesProspect.findFirstOrThrow({ where: { email: `maria-${tag}@teste.local` }, include: { notes: true, hubTasks: true } });
    assert.equal(card.notes.filter((n) => n.body.includes("Formulário do Instagram/Facebook")).length, 1);
    assert.equal(card.hubTasks.length, 1);
  });

  test("formulário de comprador vira contato de marketing e aparece em Leads de compradores com a origem", async () => {
    lead(2, "9002", [field("nome_completo", "Bruno Comprador"), field("email", `bruno-${tag}@teste.local`), field("whatsapp", phone(2))], {
      campaign_name: `Compradores SUV ${tag}`,
      ad_name: "Carrossel SUV",
      adset_name: "BH 25-45",
    });
    const s = service();
    s.receive(leadgenChangesOf(payload([{ leadgen_id: leadId(2), page_id: PAGE_ID, form_id: "9002", created_time: 1 }]))!);
    await s.idle();
    assert.equal(await prisma.salesProspect.count({ where: { email: `bruno-${tag}@teste.local` } }), 0, "comprador não vai para o funil B2B");
    const contact = await prisma.marketingContact.findUniqueOrThrow({ where: { email: `bruno-${tag}@teste.local` } });
    assert.equal(contact.source, "meta_lead_ads");
    assert.equal(contact.sourceDetail, `formulario:compradores_suv_${tag}`);
    assert.equal(contact.interest, "comprar_carro");
    assert.equal(contact.consent, "legitimate_interest");
    assert.equal(contact.phone, phone(2));
    assert.deepEqual([contact.acqSource, contact.acqMedium, contact.acqCampaign, contact.acqContent, contact.acqTerm], ["meta_ads", "lead_form", `compradores_suv_${tag}`, "Carrossel SUV", "BH 25-45"]);
    assert.equal((await prisma.metaLeadgen.findUniqueOrThrow({ where: { leadgenId: leadId(2) } })).route, "comprador");

    const { BuyerLeadsService } = require("../hub/compradores.service") as typeof import("../hub/compradores.service");
    const access: HubAccess = { userId: "u", name: "x", email: "x@y", profile: "comercial", permissions: hubPermissionsOf("comercial") };
    const r = await new BuyerLeadsService(prisma).list(access, { campanha: `compradores_suv_${tag}` });
    const item = r.itens.find((i) => i.email === `bruno-${tag}@teste.local`);
    assert.ok(item, "aparece na lista");
    assert.equal(item.tipo, "formulario_meta");
    assert.equal(item.telefone, phone(2));
    assert.equal(item.origem.canal, "meta_ads");
    assert.equal(item.origem.campanha, `compradores_suv_${tag}`);
    assert.equal(item.origem.anuncio, "Carrossel SUV");
    assert.equal(r.totais.porTipo.formulario_meta, 1);
    const soMeta = await new BuyerLeadsService(prisma).list(access, { tipo: "formulario_meta", campanha: `compradores_suv_${tag}` });
    assert.equal(soMeta.itens.length, 1);
    const soNovidades = await new BuyerLeadsService(prisma).list(access, { tipo: "novidades", campanha: `compradores_suv_${tag}` });
    assert.equal(soNovidades.itens.length, 0);
  });

  test("Gastos: lead de formulário B2B conta como lead de campanha e o de comprador como lead de comprador", async () => {
    const { MarketingHubService } = require("../hub/marketing.service") as typeof import("../hub/marketing.service");
    const counts = await (new MarketingHubService(prisma) as unknown as { contagensPorCampanha: (a: Date, b: Date) => Promise<Record<string, { leadsCampanha: number; leadsCompradores: number }>> }).contagensPorCampanha(
      new Date(Date.now() - 3_600_000),
      new Date(Date.now() + 3_600_000),
    );
    assert.equal(counts[`lojas_novembro_${tag}`]?.leadsCampanha, 1);
    assert.equal(counts[`compradores_suv_${tag}`]?.leadsCompradores, 1);
  });

  test("sem e-mail e sem telefone: ignora com aviso sem dado pessoal", async () => {
    lead(3, "9002", [field("full_name", "Sem Contato Nenhum"), field("cidade", "Betim")], { campaign_name: `Compradores SUV ${tag}` });
    const s = service();
    s.receive(leadgenChangesOf(payload([{ leadgen_id: leadId(3), page_id: PAGE_ID, form_id: "9002", created_time: 1 }]))!);
    await s.idle();
    assert.ok(logs.some((l) => /sem e-mail e sem telefone/i.test(l)));
    assert.ok(!logs.some((l) => l.includes("Sem Contato") || l.includes("Betim")));
    assert.equal((await prisma.metaLeadgen.findUniqueOrThrow({ where: { leadgenId: leadId(3) } })).status, "skipped");
  });

  test("erro da Graph: token e dados pessoais fora do log; o lead fica para a próxima tentativa", async () => {
    lead(4, "9002", [field("email", `erro-${tag}@teste.local`)], { campaign_name: `Compradores SUV ${tag}` });
    failLeads = true;
    const s = service();
    s.receive(leadgenChangesOf(payload([{ leadgen_id: leadId(4), page_id: PAGE_ID, form_id: "9002", created_time: 1 }]))!);
    await s.idle();
    assert.ok(logs.length > 0);
    for (const l of logs) {
      assert.ok(!l.includes(PAGE_TOKEN), "token nunca no log");
      assert.ok(!l.includes("maria@exemplo.com") && !l.includes("31988887777"), "nem dado pessoal");
    }
    assert.equal(await prisma.metaLeadgen.count({ where: { leadgenId: leadId(4) } }), 0, "não marca como processado");
    failLeads = false;
    const again = service();
    again.receive(leadgenChangesOf(payload([{ leadgen_id: leadId(4), page_id: PAGE_ID, form_id: "9002", created_time: 1 }]))!);
    await again.idle();
    assert.ok(await prisma.marketingContact.findUnique({ where: { email: `erro-${tag}@teste.local` } }));
  });

  test("página diferente da configurada é ignorada", async () => {
    lead(5, "9002", [field("email", `outra-${tag}@teste.local`)], { campaign_name: `Compradores SUV ${tag}` });
    const s = service();
    assert.equal(s.receive(leadgenChangesOf(payload([{ leadgen_id: leadId(5), page_id: "111222333", form_id: "9002", created_time: 1 }]))!), 0);
    await s.idle();
    assert.equal(calls.length, 0);
  });

  test("rotina de segurança: lista os formulários da página e processa só os leads ainda não vistos", async () => {
    lead(6, "9003", [field("full_name", "Clara Imóvel"), field("email", `clara-${tag}@teste.local`)], { campaign_name: `Apartamentos BH ${tag}` });
    lead(7, "9001", [field("full_name", "Davi Corretor"), field("email", `davi-${tag}@teste.local`), field("tipo_de_empresa", "Corretor")], { campaign_name: `Parceiros ${tag}` });
    formLeads.set("9001", [leadId(1), leadId(7)]);
    formLeads.set("9003", [leadId(6)]);
    formLeads.set("9002", [leadId(2)]);
    const s = service();
    const r = await s.syncRecent();
    assert.equal(r.processed, 2);
    assert.ok(calls.some((c) => c.url.startsWith(`/v23.0/${PAGE_ID}/leadgen_forms`)));
    const leadsCall = calls.find((c) => c.url.startsWith("/v23.0/9001/leads"));
    assert.ok(leadsCall && decodeURIComponent(leadsCall.url).includes("time_created"), "filtra pelas últimas 24h");
    const clara = await prisma.marketingContact.findUniqueOrThrow({ where: { email: `clara-${tag}@teste.local` } });
    assert.equal(clara.interest, "comprar_imovel");
    const davi = await prisma.salesProspect.findFirstOrThrow({ where: { email: `davi-${tag}@teste.local` } });
    assert.equal(davi.businessType, "corretor");
    assert.equal(davi.segment, "property");
    assert.equal(davi.name, "Davi Corretor", "sem empresa: o card leva o nome da pessoa");
    // segunda rodada: nada novo
    assert.equal((await s.syncRecent()).processed, 0);
  });

  test("rotina desligada sem configuração ou com META_LEADS_SYNC_DISABLED=1", async () => {
    process.env.META_LEADS_SYNC_DISABLED = "1";
    assert.equal((await service().syncRecent()).processed, 0);
    delete process.env.META_LEADS_SYNC_DISABLED;
    const saved = process.env.META_PAGE_ID;
    delete process.env.META_PAGE_ID;
    calls.length = 0;
    assert.equal((await service().syncRecent()).processed, 0);
    assert.equal(calls.length, 0);
    process.env.META_PAGE_ID = saved;
  });
});

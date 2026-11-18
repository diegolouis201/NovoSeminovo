import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { CampaignLeadInputSchema } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { SalesCampaignController, campaignLeadRateLimited } from "./sales.controller";
import { SalesService } from "./sales.service";

// Lead de campanha (Etapa 1 de marketing, 14/11/2026): loja, imobiliária ou
// corretor que chega pelo anúncio pago preenche /para-lojas/comecar e vira um
// card "A abordar" no funil, origem "campanha", com a origem completa do
// anúncio e uma tarefa para o Comercial chamar no WhatsApp na hora.

const valid = {
  name: "Maria Souza",
  company: "Auto Center Exemplo",
  businessType: "loja",
  city: "Goiânia",
  state: "go",
  phone: "(62) 99876-5432",
  email: "Maria@Exemplo.com.br",
  consent: true,
};

describe("Formulário de campanha: validação", () => {
  test("dados válidos passam e são normalizados", () => {
    const parsed = CampaignLeadInputSchema.parse(valid);
    assert.equal(parsed.state, "GO");
    assert.equal(parsed.phone, "62998765432");
    assert.equal(parsed.email, "maria@exemplo.com.br");
    assert.equal(parsed.cnpj, undefined);
  });

  test("sem autorização de contato (LGPD) é recusado", () => {
    assert.equal(CampaignLeadInputSchema.safeParse({ ...valid, consent: false }).success, false);
    const { consent: _c, ...semConsent } = valid;
    assert.equal(CampaignLeadInputSchema.safeParse(semConsent).success, false);
  });

  test("campos obrigatórios, tamanhos máximos e formatos", () => {
    for (const bad of [
      { name: "" },
      { name: "x".repeat(121) },
      { company: "y".repeat(161) },
      { businessType: "oficina" },
      { city: "c".repeat(81) },
      { state: "XX" },
      { phone: "123" },
      { email: "nao-e-email" },
      { email: `${"a".repeat(200)}@x.com` },
      { cnpj: "11.111.111/1111-11" },
    ]) {
      assert.equal(CampaignLeadInputSchema.safeParse({ ...valid, ...bad }).success, false, JSON.stringify(bad));
    }
    assert.equal(CampaignLeadInputSchema.parse({ ...valid, cnpj: "" }).cnpj, undefined);
    assert.equal(CampaignLeadInputSchema.parse({ ...valid, phone: "+55 (62) 99876-5432" }).phone, "62998765432");
  });

  test("HTML/script no nome ou na empresa é recusado", () => {
    assert.equal(CampaignLeadInputSchema.safeParse({ ...valid, name: "<script>alert(1)</script>" }).success, false);
    assert.equal(CampaignLeadInputSchema.safeParse({ ...valid, company: 'Loja"><img src=x onerror=alert(1)>' }).success, false);
  });
});

describe("Formulário de campanha: limite por visitante", () => {
  test("5 envios a cada 10 minutos por IP", () => {
    const now = Date.now();
    const ip = `10.0.0.${Math.floor(Math.random() * 200)}`;
    for (let i = 0; i < 5; i++) assert.equal(campaignLeadRateLimited(ip, now + i), false);
    assert.equal(campaignLeadRateLimited(ip, now + 10), true);
    assert.equal(campaignLeadRateLimited("10.9.9.9", now), false, "outro visitante não é afetado");
    assert.equal(campaignLeadRateLimited(ip, now + 11 * 60_000), false, "janela passa");
  });
});

describe("Formulário de campanha: rota", () => {
  const request = (ip: string, origem?: string) => ({ headers: { "x-client-ip": ip, ...(origem ? { "x-ns-origem": origem } : {}) }, ip: "127.0.0.1" }) as never;

  test("honeypot preenchido responde ok sem gravar nada", async () => {
    const calls: unknown[] = [];
    const ctrl = new SalesCampaignController({ campaignLead: async (...a: unknown[]) => void calls.push(a) } as never);
    assert.deepEqual(await ctrl.campaignLead({ ...valid, website: "http://spam" }, request("10.1.1.1")), { ok: true });
    assert.equal(calls.length, 0);
  });

  test("sem autorização: 400; válido: chama o serviço com a origem do cabeçalho", async () => {
    const calls: unknown[][] = [];
    const ctrl = new SalesCampaignController({ campaignLead: async (...a: unknown[]) => (calls.push(a), { id: "c1" }) } as never);
    await assert.rejects(ctrl.campaignLead({ ...valid, consent: false }, request("10.1.1.2")), (e: { status?: number }) => e.status === 400);
    const r = await ctrl.campaignLead(valid, request("10.1.1.3", encodeURIComponent("meta_ads|paid|lojas_nov|video_1|donos_go|Ab1")));
    assert.deepEqual(r, { ok: true });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0]![1], { source: "meta_ads", medium: "paid", campaign: "lojas_nov", content: "video_1", term: "donos_go", clickId: "Ab1" });
  });

  test("passou do limite: 429", async () => {
    const ctrl = new SalesCampaignController({ campaignLead: async () => ({ id: "c" }) } as never);
    const ip = "10.2.2.2";
    for (let i = 0; i < 5; i++) await ctrl.campaignLead(valid, request(ip));
    await assert.rejects(ctrl.campaignLead(valid, request(ip)), (e: { status?: number }) => e.status === 429);
  });
});

const withDb = Boolean(process.env.DATABASE_URL);

describe("Lead de campanha no funil (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const service = new SalesService(prisma);
  const tag = `camp-${Date.now()}`;
  const seed = String(Date.now()).slice(-8);
  const cnpj = (n: number) => {
    const digits = `${seed}${String(n).padStart(4, "0")}`.split("").map(Number);
    for (const weights of [[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]]) {
      const sum = weights.reduce((acc, w, i) => acc + w * digits[i]!, 0);
      const rest = sum % 11;
      digits.push(rest < 2 ? 0 : 11 - rest);
    }
    return digits.join("");
  };
  const phone = (n: number) => `629${seed.slice(-4)}${String(n).padStart(4, "0")}`;
  const input = (n: number, extra: Record<string, unknown> = {}) =>
    CampaignLeadInputSchema.parse({ ...valid, company: `Empresa ${n} ${tag}`, phone: phone(n), email: `lead${n}-${tag}@teste.local`, ...extra });
  const origin = { source: "meta_ads" as const, medium: "paid", campaign: "lojas_nov", content: "video_1", term: "donos_go", clickId: "Ab1" };

  before(async () => {
    await prisma.$connect();
  });

  after(async () => {
    const cards = await prisma.salesProspect.findMany({ where: { OR: [{ name: { contains: tag } }, { notes: { some: { body: { contains: tag } } } }] /* e-mail criptografado: só busca exata */ }, select: { id: true } });
    await prisma.hubTask.deleteMany({ where: { prospectId: { in: cards.map((c) => c.id) } } });
    await prisma.salesProspect.deleteMany({ where: { id: { in: cards.map((c) => c.id) } } });
    await prisma.partner.deleteMany({ where: { slug: { contains: tag } } });
    await prisma.user.deleteMany({ where: { email: { contains: tag } } });
    await prisma.$disconnect();
  });

  test("vira card 'A abordar' com origem campanha, origem do anúncio e tarefa para o Comercial", async () => {
    const { id } = await service.campaignLead(input(1, { cnpj: cnpj(1) }), origin);
    const card = await prisma.salesProspect.findUniqueOrThrow({ where: { id }, include: { notes: true, hubTasks: true } });
    assert.equal(card.source, "campanha");
    assert.equal(card.stage, "a_abordar");
    assert.equal(card.segment, "vehicle");
    assert.equal(card.businessType, "loja");
    assert.equal(card.cnpj, cnpj(1));
    assert.equal(card.phone, phone(1));
    assert.equal(card.contactName, "Maria Souza");
    assert.equal(card.state, "GO");
    assert.deepEqual(
      [card.acqSource, card.acqMedium, card.acqCampaign, card.acqContent, card.acqTerm, card.acqClickId],
      ["meta_ads", "paid", "lojas_nov", "video_1", "donos_go", "Ab1"],
    );
    assert.ok(card.notes.some((n) => /formulário/i.test(n.body) && /autoriz/i.test(n.body)), "anotação registra o formulário e a autorização");
    assert.equal(card.hubTasks.length, 1);
    assert.equal(card.hubTasks[0]!.kind, "whatsapp");
    assert.ok(card.hubTasks[0]!.dueAt.getTime() <= Date.now());
    assert.match(card.hubTasks[0]!.title, /lead de campanha/i);
    const { HubService } = require("../hub/hub.service") as typeof import("../hub/hub.service");
    const open = await new HubService(prisma).tasks({ status: "abertas", prospectId: id });
    assert.equal(open[0]?.responsavel, "Site (formulário de campanha)");
    // telefone guardado criptografado
    const [raw] = await prisma.$queryRaw<{ phone: string }[]>`SELECT phone FROM sales_prospects WHERE id = ${id}`;
    assert.ok(raw!.phone.startsWith("enc:"), "telefone criptografado no banco");
    assert.ok(!card.notes.some((n) => n.body.includes(phone(1))), "telefone não vai para o texto da anotação");
    assert.ok(!(card.hubTasks[0]!.notes ?? "").includes(phone(1)), "nem para a tarefa");
  });

  test("imobiliária e corretor entram em Imóveis", async () => {
    const a = await service.campaignLead(input(2, { businessType: "imobiliaria" }), undefined);
    const b = await service.campaignLead(input(3, { businessType: "corretor" }), undefined);
    for (const { id } of [a, b]) assert.equal((await prisma.salesProspect.findUniqueOrThrow({ where: { id } })).segment, "property");
  });

  test("mesmo CNPJ, mesmo telefone (com 55 e máscara) ou mesmo e-mail: usa o mesmo card", async () => {
    const first = await service.campaignLead(input(4, { cnpj: cnpj(4) }), origin);
    const byCnpj = await service.campaignLead(input(5, { cnpj: cnpj(4) }), undefined);
    const byPhone = await service.campaignLead(input(6, { phone: `+55 ${phone(4)}` }), undefined);
    const byEmail = await service.campaignLead(input(7, { email: `LEAD4-${tag}@teste.local` }), undefined);
    assert.equal(byCnpj.id, first.id);
    assert.equal(byPhone.id, first.id);
    assert.equal(byEmail.id, first.id);
    assert.equal(await prisma.salesProspect.count({ where: { id: first.id } }), 1);
    const tasks = await prisma.hubTask.count({ where: { prospectId: first.id, doneAt: null } });
    assert.equal(tasks, 1, "não abre tarefa repetida enquanto a primeira está aberta");
    const card = await prisma.salesProspect.findUniqueOrThrow({ where: { id: first.id }, include: { notes: true } });
    assert.equal(card.acqCampaign, "lojas_nov", "origem do primeiro contato fica");
    assert.ok(card.notes.filter((n) => /formulário/i.test(n.body)).length >= 4);
  });

  test("card que já andou no funil não volta para 'A abordar'", async () => {
    const { id } = await service.campaignLead(input(8), origin);
    await prisma.salesProspect.update({ where: { id }, data: { stage: "em_contato" } });
    const again = await service.campaignLead(input(8), origin);
    assert.equal(again.id, id);
    assert.equal((await prisma.salesProspect.findUniqueOrThrow({ where: { id } })).stage, "em_contato");
  });

  test("card manual existente com o mesmo telefone recebe a origem da campanha sem trocar a fonte", async () => {
    const manual = await prisma.salesProspect.create({ data: { name: `Manual ${tag}`, segment: "vehicle", phone: phone(9), source: "manual", stage: "interessada" } });
    const { id } = await service.campaignLead(input(9), origin);
    assert.equal(id, manual.id);
    const card = await prisma.salesProspect.findUniqueOrThrow({ where: { id } });
    assert.equal(card.source, "manual");
    assert.equal(card.stage, "interessada");
    assert.equal(card.acqCampaign, "lojas_nov", "origem vazia é preenchida");
  });

  test("texto com cara de SQL é guardado como texto (Prisma)", async () => {
    const evil = `Loja'); DROP TABLE sales_prospects; -- ${tag}`;
    const { id } = await service.campaignLead(input(10, { company: evil }), undefined);
    assert.equal((await prisma.salesProspect.findUniqueOrThrow({ where: { id } })).name, evil);
    assert.ok((await prisma.salesProspect.count()) > 0);
  });

  test("empresa que se cadastra depois cai no mesmo card (pelo e-mail ou telefone do dono)", async () => {
    const byEmail = await service.campaignLead(input(11), origin);
    const owner = await prisma.user.create({ data: { name: "Dono", email: `lead11-${tag}@teste.local`, role: "partner_owner" } });
    const partner = await prisma.partner.create({ data: { ownerUserId: owner.id, type: "dealership", legalName: `Razão 11 ${tag}`, document: cnpj(11), slug: `${tag}-11` } });
    await service.linkSignup(partner.id);
    const linked = await prisma.salesProspect.findUniqueOrThrow({ where: { id: byEmail.id } });
    assert.equal(linked.partnerId, partner.id);
    assert.equal(linked.source, "campanha");
    assert.equal(await prisma.salesProspect.count({ where: { partnerId: partner.id } }), 1);

    const byPhone = await service.campaignLead(input(12), origin);
    const owner2 = await prisma.user.create({ data: { name: "Dono 2", email: `outro12-${tag}@teste.local`, phone: phone(12), role: "partner_owner" } });
    const partner2 = await prisma.partner.create({ data: { ownerUserId: owner2.id, type: "dealership", legalName: `Razão 12 ${tag}`, document: cnpj(12), slug: `${tag}-12` } });
    await service.linkSignup(partner2.id);
    assert.equal((await prisma.salesProspect.findUniqueOrThrow({ where: { id: byPhone.id } })).partnerId, partner2.id);
  });

  test("empresa já cadastrada (mesmo CNPJ) recebe anotação no card dela, sem card novo", async () => {
    const owner = await prisma.user.create({ data: { name: "Dono 13", email: `dono13-${tag}@teste.local`, role: "partner_owner" } });
    const partner = await prisma.partner.create({ data: { ownerUserId: owner.id, type: "dealership", legalName: `Razão 13 ${tag}`, document: cnpj(13), slug: `${tag}-13` } });
    const { id } = await service.campaignLead(input(13, { cnpj: cnpj(13) }), origin);
    const card = await prisma.salesProspect.findUniqueOrThrow({ where: { id }, include: { notes: true } });
    assert.equal(card.partnerId, partner.id);
    assert.equal(await prisma.salesProspect.count({ where: { OR: [{ partnerId: partner.id }, { cnpj: cnpj(13) }] } }), 1);
  });

  test("aparece no CRM do Hub com a origem 'campanha' e a campanha do anúncio", async () => {
    const { id } = await service.campaignLead(input(14), origin);
    const { CrmService } = require("../crm/crm.service") as typeof import("../crm/crm.service");
    const feed = await new CrmService(prisma, { syncPartners: async () => undefined } as never).clientes();
    const item = feed.prospeccao.find((p) => p.cardId === id);
    assert.equal(item?.origem, "campanha");
    assert.equal(item?.origemMarketing?.campanha, "lojas_nov");
    assert.equal(item?.origemMarketing?.anuncio, "video_1");
  });
});

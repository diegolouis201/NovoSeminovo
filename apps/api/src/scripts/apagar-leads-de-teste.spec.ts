import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { PrismaService } from "../prisma/prisma.service";
import { ALVOS, apagarLeadsDeTeste, type ResultadoApagar } from "./apagar-leads-de-teste";

// Apagar os leads de teste que aparecem na lista de Leads (pedido do Diego,
// 24/11/2026). Banco real (DATABASE_URL). Os registros de teste são criados
// com os mesmos dados dos de produção (data/hora de Brasília + nome, e o
// e-mail test@meta.com do Testador de Lead Ads da Meta); os "reais"
// parecidos (mesmo nome em outra data, outro e-mail) precisam ficar.
const withDb = Boolean(process.env.DATABASE_URL);
const brasilia = (quando: string) => new Date(`${quando}-03:00`);

describe("Apagar leads de teste (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const tag = `apagar-leads-${Date.now()}`;
  const ids = {
    tcross: "",
    diego2710: "",
    ronaldo: "",
    diego2610: "",
    meta: "",
    realDiego: "",
    realDiegoPereira: "",
    realMeta: "",
    realFinanciamentoMesmoDia: "",
    deal: "",
  };
  const linhas: string[] = [];
  const log = (l: string) => linhas.push(l);
  const listingTitle = `Volkswagen T-Cross conservado ${tag}`;
  let listingId = "";
  let adminId = "";

  const fin = (name: string, quando: string, extra: Record<string, unknown> = {}) =>
    prisma.financingLead
      .create({ data: { channel: "web", name, phone: "31999990000", email: `${tag}@teste.local`, assetType: "vehicle", createdAt: brasilia(quando), ...extra } as never })
      .then((r) => r.id);

  const apagarDosAlvos = async () => {
    // Limpa sobras de execuções anteriores que batam com os critérios.
    await prisma.marketingContact.deleteMany({ where: { email: "test@meta.com" } });
    for (const alvo of ALVOS) {
      if (alvo.tipo !== "financiamento") continue;
      const inicio = brasilia(`${alvo.minuto}:00`);
      await prisma.financingLead.deleteMany({ where: { createdAt: { gte: inicio, lt: new Date(inicio.getTime() + 60_000) } } });
    }
  };

  before(async () => {
    await prisma.$connect();
    await apagarDosAlvos();
    const admin = await prisma.user.create({ data: { name: `Admin ${tag}`, email: `admin-${tag}@teste.local`, role: "admin" } });
    adminId = admin.id;
    const listing = await prisma.listing.create({
      data: { ownerUserId: admin.id, type: "vehicle", title: listingTitle, description: "Teste", price: 120000, city: "Belo Horizonte", state: "MG", status: "active" } as never,
    });
    listingId = listing.id;

    ids.tcross = await fin("Diego Louis Pereira", "2026-11-13T19:33:41", { listingId });
    ids.diego2710 = await fin("Diego Louis", "2026-10-27T10:35:05");
    ids.ronaldo = await fin("Ronaldo Murasawwa", "2026-10-26T16:07:59");
    ids.diego2610 = await fin("Diego Louis", "2026-10-26T15:10:30");
    await prisma.creditConsent.create({
      data: {
        financingLeadId: ids.tcross,
        modality: "veiculo",
        product: "financiamento",
        origin: "site",
        consentVersion: "teste",
        consentText: "texto",
        accepted: true,
        acceptedAt: brasilia("2026-11-13T19:33:41"),
        timezone: "America/Sao_Paulo",
        acceptedAtLocal: "2026-11-13T19:33:41-03:00",
      },
    });
    const meta = await prisma.marketingContact.create({
      data: {
        email: "test@meta.com",
        name: "test lead: dummy data for full_name",
        source: "meta_lead_ads",
        sourceDetail: "formulario:sem_campanha",
        consent: "legitimate_interest",
        createdAt: brasilia("2026-11-24T16:43:12"),
      },
    });
    ids.meta = meta.id;

    // Reais parecidos: precisam ficar.
    ids.realDiego = await fin("Diego Louis", "2026-10-27T10:36:00", { email: `outro-${tag}@teste.local` });
    ids.realDiegoPereira = await fin("Diego Louis Pereira", "2026-11-20T09:00:00", { listingId });
    ids.realFinanciamentoMesmoDia = await fin("Maria Compradora", "2026-11-13T19:33:50");
    ids.realMeta = (
      await prisma.marketingContact.create({
        data: { email: `cliente-${tag}@teste.local`, name: "Cliente de verdade", source: "meta_lead_ads", sourceDetail: "formulario:suv", consent: "legitimate_interest", createdAt: brasilia("2026-11-24T16:43:30") },
      })
    ).id;
  });

  after(async () => {
    await prisma.creditConsent.deleteMany({ where: { financingLeadId: { in: Object.values(ids).filter(Boolean) } } });
    await prisma.financingLead.deleteMany({ where: { OR: [{ id: { in: Object.values(ids).filter(Boolean) } }, { email: { contains: tag } }] } });
    if (ids.deal) await prisma.financingDeal.deleteMany({ where: { id: ids.deal } });
    await prisma.marketingContact.deleteMany({ where: { id: { in: [ids.meta, ids.realMeta].filter(Boolean) } } });
    await prisma.opsReport.deleteMany({ where: { agent: "script:apagar-leads-de-teste" } });
    await prisma.listing.deleteMany({ where: { id: listingId } });
    await prisma.user.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  const situacao = (r: ResultadoApagar) => Object.fromEntries(r.itens.map((i) => [i.rotulo, i.situacao]));
  const existe = async () => ({
    fin: (await prisma.financingLead.findMany({ where: { id: { in: Object.values(ids).filter(Boolean) } }, select: { id: true } })).map((r) => r.id),
    contatos: (await prisma.marketingContact.findMany({ where: { id: { in: [ids.meta, ids.realMeta] } }, select: { id: true } })).map((r) => r.id),
  });

  test("os alvos são os 5 leads que o Diego listou", () => {
    assert.equal(ALVOS.length, 5);
    assert.deepEqual(
      ALVOS.map((a) => (a.tipo === "financiamento" ? `${a.minuto} ${a.nome}` : `meta ${a.email}`)),
      ["meta test@meta.com", "2026-11-13T19:33 Diego Louis Pereira", "2026-10-27T10:35 Diego Louis", "2026-10-26T16:07 Ronaldo Murasawwa", "2026-10-26T15:10 Diego Louis"],
    );
  });

  test("simulação mostra os 5 com nome, data e anúncio, e não apaga nada", async () => {
    linhas.length = 0;
    const antes = await existe();
    const r = await apagarLeadsDeTeste(prisma, { confirmar: false, log });
    assert.equal(r.modo, "simulacao");
    assert.deepEqual(Object.values(situacao(r)), ["apagar", "apagar", "apagar", "apagar", "apagar"]);
    assert.deepEqual(
      r.itens.flatMap((i) => i.ids),
      [ids.meta, ids.tcross, ids.diego2710, ids.ronaldo, ids.diego2610],
    );
    assert.deepEqual(await existe(), antes);
    const texto = linhas.join("\n");
    assert.match(texto, /SIMULAÇÃO/);
    assert.match(texto, /13\/11\/2026 19:33 .*Diego Louis Pereira/);
    assert.match(texto, /T-Cross conservado/);
    assert.match(texto, /1 consentimento/);
    assert.match(texto, /test lead: dummy data for full_name/);
    assert.ok(!texto.includes("31999990000"), "telefone não aparece");
    assert.ok(!texto.includes(`${tag}@teste.local`), "e-mail do pedido não aparece");
  });

  test("dois registros no mesmo minuto com o mesmo nome: não apaga nenhum dos dois", async () => {
    const dup = await fin("Ronaldo Murasawwa", "2026-10-26T16:07:20");
    try {
      const r = await apagarLeadsDeTeste(prisma, { confirmar: false, log });
      const item = r.itens.find((i) => i.rotulo.includes("Ronaldo"));
      assert.equal(item?.situacao, "mais_de_um");
      assert.equal(item?.ids.length, 2, "mostra os dois ids para conferir");
    } finally {
      await prisma.financingLead.deleteMany({ where: { id: dup } });
    }
  });

  test("enviado à Creditas/Credihome só sai com --incluir-enviados; com negócio registrado nunca sai", async () => {
    await prisma.financingLead.update({ where: { id: ids.diego2610 }, data: { creditasLeadId: "creditas-123", creditasSentAt: brasilia("2026-10-26T15:11:00") } });
    const deal = await prisma.financingDeal.create({
      data: {
        financingProvider: "teste",
        assetValue: 100000,
        financedAmount: 80000,
        commissionAmount: 800,
        rebatePercent: 0,
        rebateAmount: 0,
        registeredByUserId: adminId,
      },
    });
    ids.deal = deal.id;
    await prisma.financingLead.update({ where: { id: ids.diego2710 }, data: { financingDealId: deal.id } });

    linhas.length = 0;
    const sim = await apagarLeadsDeTeste(prisma, { confirmar: false, log });
    const s = situacao(sim);
    assert.equal(s[ALVOS[4].rotulo], "enviado_a_parceiro");
    assert.equal(s[ALVOS[2].rotulo], "com_negocio");
    assert.match(linhas.join("\n"), /Creditas em 26\/10\/2026/);

    const r = await apagarLeadsDeTeste(prisma, { confirmar: true, log });
    assert.equal(r.modo, "execucao");
    const { fin: ficaram, contatos } = await existe();
    // Saíram: Meta, T-Cross, Ronaldo. Ficaram: o enviado, o com negócio e os reais.
    assert.deepEqual(new Set(ficaram), new Set([ids.diego2610, ids.diego2710, ids.realDiego, ids.realDiegoPereira, ids.realFinanciamentoMesmoDia]));
    assert.deepEqual(contatos, [ids.realMeta]);
    assert.equal(await prisma.creditConsent.count({ where: { financingLeadId: ids.tcross } }), 0, "consentimento do teste sai junto");
    assert.equal(r.apagados.financiamentos, 2);
    assert.equal(r.apagados.consentimentos, 1);
    assert.equal(r.apagados.contatosMeta, 1);
    assert.ok(await prisma.financingDeal.findUnique({ where: { id: ids.deal } }), "negócio registrado nunca é apagado");

    const r2 = await apagarLeadsDeTeste(prisma, { confirmar: true, incluirEnviados: true, log });
    assert.equal(r2.apagados.financiamentos, 1);
    const depois = await existe();
    assert.deepEqual(new Set(depois.fin), new Set([ids.diego2710, ids.realDiego, ids.realDiegoPereira, ids.realFinanciamentoMesmoDia]));
    const relatorio = await prisma.opsReport.findFirst({ where: { agent: "script:apagar-leads-de-teste" }, orderBy: { createdAt: "desc" } });
    assert.ok(relatorio, "registra no histórico de operações");
  });

  test("rodar de novo não acha nada e não apaga nada", async () => {
    await prisma.financingLead.update({ where: { id: ids.diego2710 }, data: { financingDealId: null } });
    const r0 = await apagarLeadsDeTeste(prisma, { confirmar: true, log });
    assert.equal(r0.apagados.financiamentos, 1);
    const r = await apagarLeadsDeTeste(prisma, { confirmar: true, log });
    assert.deepEqual(Object.values(situacao(r)), ["nao_encontrado", "nao_encontrado", "nao_encontrado", "nao_encontrado", "nao_encontrado"]);
    assert.deepEqual(r.apagados, { financiamentos: 0, consentimentos: 0, contatosMeta: 0, emailsDoContato: 0, inscricoesDoContato: 0 });
    const { fin: ficaram, contatos } = await existe();
    assert.deepEqual(new Set(ficaram), new Set([ids.realDiego, ids.realDiegoPereira, ids.realFinanciamentoMesmoDia]));
    assert.deepEqual(contatos, [ids.realMeta]);
  });
});

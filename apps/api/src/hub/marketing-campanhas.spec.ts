import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { atribuirConversoes, resumoGastos, type LinhaGasto } from "./marketing-regras";

// Custo por campanha (Etapa 1 de marketing, 14/11/2026): o gasto de cada
// campanha (Windsor) cruzado com os leads e cadastros que chegaram com o
// mesmo utm_campaign. Regra: utm_campaign = nome da campanha no gerenciador
// de anúncios; os dois lados passam pela mesma chave (minúsculas, espaços
// viram "_"), então "Lojas Novembro" casa com "lojas_novembro".

const linha = (campanha: string, gasto: number, cliques: number, plataforma = "meta_ads"): LinhaGasto => ({ plataforma, campanha, data: "2026-11-10", gasto, cliques, impressoes: cliques * 20, conversoes: 0 });

describe("Atribuição de leads e cadastros às campanhas", () => {
  test("casa pelo nome (sem diferenciar maiúsculas e espaços) e calcula custo por lead e por cadastro", () => {
    const resumo = resumoGastos([linha("Lojas Novembro", 300, 100), linha("Lojas Novembro", 100, 20), linha("Compradores SUV", 200, 80), linha("Sem resultado", 50, 10)], {});
    const contagens = {
      lojas_novembro: { leadsCampanha: 4, cadastros: 2, leadsCompradores: 0 },
      compradores_suv: { leadsCampanha: 0, cadastros: 0, leadsCompradores: 10 },
      campanha_antiga: { leadsCampanha: 1, cadastros: 0, leadsCompradores: 3 },
    };
    const r = atribuirConversoes(resumo, contagens);
    const lojas = r.porCampanha.find((c) => c.campanha === "Lojas Novembro")!;
    assert.equal(lojas.gasto, 400);
    assert.equal(lojas.leadsCampanha, 4);
    assert.equal(lojas.cadastros, 2);
    assert.equal(lojas.leadsCompradores, 0);
    assert.equal(lojas.conversoes, 6);
    assert.equal(lojas.custoPorLead, 100);
    assert.equal(lojas.custoPorCadastro, 200);
    const suv = r.porCampanha.find((c) => c.campanha === "Compradores SUV")!;
    assert.equal(suv.custoPorLead, 20);
    assert.equal(suv.custoPorCadastro, undefined);
    const nada = r.porCampanha.find((c) => c.campanha === "Sem resultado")!;
    assert.equal(nada.conversoes, 0);
    assert.equal(nada.custoPorLead, undefined);
    // total e plataforma deixam de ser 0 fixo
    assert.equal(r.total.conversoes, 16);
    assert.equal(r.total.custoPorConversao, 40.63);
    assert.equal(r.porPlataforma.find((p) => p.plataforma === "meta_ads")!.conversoes, 16);
    // campanha do site sem gasto no período (ou com nome diferente no Meta)
    assert.deepEqual(r.semGasto, [{ campanha: "campanha_antiga", leadsCampanha: 1, cadastros: 0, leadsCompradores: 3 }]);
  });

  test("mesmo nome em duas plataformas: conta uma vez só no total", () => {
    const resumo = resumoGastos([linha("Geral", 100, 10, "meta_ads"), linha("Geral", 100, 10, "google_ads")], {});
    const r = atribuirConversoes(resumo, { geral: { leadsCampanha: 2, cadastros: 0, leadsCompradores: 0 } });
    assert.equal(r.total.conversoes, 2);
  });
});

const withDb = Boolean(process.env.DATABASE_URL);

describe("Gastos do mês com custo por campanha (banco local + Windsor falso)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const { PrismaService } = require("../prisma/prisma.service") as typeof import("../prisma/prisma.service");
  const prisma = new PrismaService();
  const tag = `cpc${Date.now()}`;
  const nome = `Lojas Teste ${tag}`;
  const chave = `lojas_teste_${tag}`;
  const env = { ...process.env };
  let server: Server;
  const pedidos: string[] = [];

  before(async () => {
    server = createServer((req, res) => {
      pedidos.push(req.url ?? "");
      res.setHeader("Content-Type", "application/json");
      if ((req.url ?? "").startsWith("/facebook")) return res.end(JSON.stringify({ data: [{ date: "2026-11-02", campaign: nome, spend: 90, clicks: 30, impressions: 900 }, { date: "2026-11-03", campaign: nome, spend: 30, clicks: 10, impressions: 300 }] }));
      return res.end(JSON.stringify({ data: [] }));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    process.env.WINDSOR_API_KEY = "chave-falsa-de-teste";
    process.env.WINDSOR_API_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const now = new Date();
    await prisma.salesProspect.createMany({
      data: [
        { name: `A ${tag}`, segment: "vehicle", source: "campanha", acqSource: "meta_ads", acqCampaign: chave, createdAt: now },
        { name: `B ${tag}`, segment: "property", source: "campanha", acqSource: "meta_ads", acqCampaign: chave, createdAt: now },
      ],
    });
    const owner = await prisma.user.create({ data: { name: "Dono", email: `dono-${tag}@teste.local`, role: "partner_owner", acqSource: "meta_ads", acqCampaign: chave } });
    await prisma.partner.create({ data: { ownerUserId: owner.id, type: "dealership", legalName: `P ${tag}`, document: `9${String(Date.now()).slice(-13)}`, slug: `p-${tag}` } });
    const listing = await prisma.listing.findFirstOrThrow({ where: { partnerId: { not: null } }, select: { id: true, partnerId: true } });
    await prisma.lead.create({ data: { partnerId: listing.partnerId!, listingId: listing.id, source: "form", contactName: `L ${tag}`, acqSource: "meta_ads", acqCampaign: chave } });
    await prisma.financingLead.create({ data: { channel: "web", name: `F ${tag}`, phone: "11900000000", assetType: "vehicle", acqSource: "meta_ads", acqCampaign: chave } });
  });

  after(async () => {
    process.env = env;
    server.close();
    await prisma.salesProspect.deleteMany({ where: { name: { contains: tag } } });
    await prisma.lead.deleteMany({ where: { contactName: `L ${tag}` } });
    await prisma.financingLead.deleteMany({ where: { name: `F ${tag}` } });
    await prisma.partner.deleteMany({ where: { slug: `p-${tag}` } });
    await prisma.user.deleteMany({ where: { email: `dono-${tag}@teste.local` } });
    await prisma.$disconnect();
  });

  test("campanha do Windsor ganha leads de campanha, cadastros e leads de compradores do mês", async () => {
    const { MarketingHubService } = require("./marketing.service") as typeof import("./marketing.service");
    const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
    const g = await new MarketingHubService(prisma).gastos(hoje.slice(0, 7), hoje);
    const c = g.porCampanha.find((x) => x.campanha === nome);
    assert.ok(c, "campanha do Windsor aparece");
    assert.equal(c.gasto, 120);
    assert.equal(c.cliques, 40);
    assert.equal(c.leadsCampanha, 2);
    assert.equal(c.cadastros, 1);
    assert.equal(c.leadsCompradores, 2);
    assert.equal(c.custoPorLead, 30);
    assert.equal(c.custoPorCadastro, 120);
    assert.ok(g.total.conversoes >= 5, "conversões deixam de ser 0 fixo");
    assert.ok(typeof g.custo.porCadastro === "number", "número global continua");
    assert.ok(pedidos.some((u) => u.startsWith("/facebook")), "leu o Meta Ads pelo Windsor");
  });
});

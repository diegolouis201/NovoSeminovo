import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { PrismaService } from "../prisma/prisma.service";
import { MarketingHubService } from "./marketing.service";

// Marketing do Hub no banco: o Claude do Marketing envia, o Diego aprova ou
// pede ajuste, o Hub publica no Instagram e no Facebook na hora marcada.

const withDb = Boolean(process.env.DATABASE_URL);

describe("Chave do Claude do Marketing", () => {
  const { MarketingFeedController } = require("./marketing.controller") as typeof import("./marketing.controller");
  const ctrl = new MarketingFeedController({ listar: async () => [] } as never);
  test("sem chave configurada: indisponível; chave errada: recusa", async () => {
    delete process.env.MARKETING_FEED_KEY;
    await assert.rejects(ctrl.listar("Bearer x", {}), /não configurado/);
    process.env.MARKETING_FEED_KEY = "chave-do-marketing-para-testes-com-mais-de-32-caracteres";
    await assert.rejects(ctrl.listar("Bearer errada", {}), /Chave inválida/);
    assert.deepEqual(await ctrl.listar("Bearer chave-do-marketing-para-testes-com-mais-de-32-caracteres", {}), []);
  });
  test("recolher (ajuste ou cancelar) pela chave: precisa de motivo e passa pelo serviço com o autor Claude", async () => {
    const chamadas: unknown[][] = [];
    const c = new MarketingFeedController({ pedirAjuste: async (...a: unknown[]) => void chamadas.push(["ajuste", ...a]), cancelar: async (...a: unknown[]) => void chamadas.push(["cancelar", ...a]) } as never);
    const key = "Bearer chave-do-marketing-para-testes-com-mais-de-32-caracteres";
    await assert.rejects(c.recolher("Bearer errada", "abc", { acao: "ajuste", motivo: "x" }), /Chave inválida/);
    await assert.rejects(c.recolher(key, "abc", { acao: "ajuste", motivo: "" }), /motivo|Too small|String must/i);
    await assert.rejects(c.recolher(key, "abc", { acao: "apagar", motivo: "x" }), /Invalid enum|acao/i);
    await c.recolher(key, "abc", { acao: "ajuste", motivo: "Tirar o cashback" });
    await c.recolher(key, "def", { acao: "cancelar", motivo: "Post só sobre cashback" });
    assert.deepEqual(chamadas, [
      ["ajuste", "abc", "Tirar o cashback", "claude"],
      ["cancelar", "def", "claude", "Post só sobre cashback"],
    ]);
  });
});
const PNG_1X1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("Marketing do Hub (banco local)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const prisma = new PrismaService();
  const mkt = new MarketingHubService(prisma);
  const tag = `mkt-${Date.now()}`;
  let server: Server;
  const calls: { path: string; body: string }[] = [];
  const env = { ...process.env };

  before(async () => {
    // Graph API de mentira (Instagram e Facebook).
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const path = (req.url ?? "").split("?")[0];
        calls.push({ path: `${req.method} ${path}`, body });
        res.setHeader("Content-Type", "application/json");
        if (req.method === "POST" && path.endsWith("/ig1/media")) return res.end(JSON.stringify({ id: `c${calls.length}` }));
        if (req.method === "GET" && /\/c\d+$/.test(path)) return res.end(JSON.stringify({ status_code: "FINISHED" }));
        if (path.endsWith("/ig1/media_publish")) return res.end(JSON.stringify({ id: "midia1" }));
        if (path.endsWith("/midia1")) return res.end(JSON.stringify({ permalink: "https://instagram.com/p/abc" }));
        if (path.endsWith("/pg1/photos")) return res.end(JSON.stringify({ id: "foto1", post_id: "pg1_post1" }));
        res.statusCode = 404;
        res.end(JSON.stringify({ error: { message: "rota de teste desconhecida" } }));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const addr = server.address() as { port: number };
    Object.assign(process.env, {
      INSTAGRAM_GRAPH_HOST: `http://127.0.0.1:${addr.port}`,
      INSTAGRAM_ACCESS_TOKEN: "token-de-teste",
      INSTAGRAM_ACCOUNT_ID: "ig1",
      FACEBOOK_PAGE_ID: "pg1",
      FACEBOOK_PAGE_TOKEN: "token-pagina-teste",
      PUBLIC_API_URL: "https://api.exemplo.com",
    });
  });

  after(async () => {
    process.env = env;
    server.close();
    await prisma.mktContent.deleteMany({ where: { titulo: { contains: tag } } });
    await prisma.mktBudget.deleteMany({ where: { month: "2099-01" } });
    await prisma.mktStrategy.deleteMany({ where: { plataforma: "linkedin" } });
    await prisma.mktSetting.deleteMany({ where: { chave: "impulso" } });
    await prisma.$disconnect();
  });

  test("imagem enviada vira JPEG no nosso armazenamento; arquivo que não é imagem é recusado", async () => {
    const url = await mkt.salvarMidia({ nome: "arte.png", base64: PNG_1X1 });
    assert.match(url, /\.jpg$/);
    await assert.rejects(mkt.salvarMidia({ nome: "x.png", base64: Buffer.from("não é imagem").toString("base64") }), /imagem/);
  });

  test("Claude envia → Diego pede ajuste → Claude revisa → Diego aprova; histórico registra tudo", async () => {
    const midia = await mkt.salvarMidia({ nome: "arte.png", base64: PNG_1X1 });
    const c = await mkt.criar({ tipo: "post", redes: ["instagram", "facebook"], titulo: `Boas-vindas ${tag}`, legenda: "Bem-vinda, Loja X!", midias: [midia] }, "claude", "Claude Marketing");
    let d = await mkt.detalhe(c.id);
    assert.equal(d.status, "em_aprovacao");
    await assert.rejects(mkt.aprovar(c.id, {}, "u1"), /hora/i, "aprovar exige escolher quando publicar");
    await mkt.pedirAjuste(c.id, "Trocar a foto", "u1");
    await assert.rejects(mkt.aprovar(c.id, { publicarEm: new Date().toISOString() }, "u1"), /não pode/);
    await mkt.revisar(c.id, { legenda: "Bem-vinda, Loja X! Agora no NovoSeminovo." }, "Claude Marketing");
    d = await mkt.detalhe(c.id);
    assert.equal(d.revisao, 2);
    assert.equal(d.status, "em_aprovacao");
    assert.equal(d.feedback, "Trocar a foto");
    await mkt.aprovar(c.id, { publicarEm: "2099-01-01T12:00:00Z" }, "u1");
    d = await mkt.detalhe(c.id);
    assert.equal(d.status, "aprovado");
    assert.deepEqual(d.historico.map((h) => h.acao), ["enviado", "ajuste", "revisado", "aprovado"]);
  });

  test("mídia de fora do nosso armazenamento é recusada (só link https para vídeo)", async () => {
    await assert.rejects(mkt.criar({ tipo: "post", redes: ["instagram"], titulo: `x ${tag}`, legenda: "x", midias: ["http://site-qualquer.com/a.jpg"] }, "claude", "Claude"), /mídia/i);
    const ok = await mkt.criar({ tipo: "reels", redes: ["instagram"], titulo: `Reels ${tag}`, legenda: "x", midias: ["https://drive.google.com/file/d/abc/view"] }, "claude", "Claude");
    assert.ok(ok.id);
  });

  test("na hora marcada, publica no Instagram e no Facebook; TikTok fica para publicar à mão", async () => {
    const midia = await mkt.salvarMidia({ nome: "arte.png", base64: PNG_1X1 });
    const c = await mkt.criar({ tipo: "post", redes: ["instagram", "facebook", "tiktok"], titulo: `Publicar ${tag}`, legenda: "Legenda teste", midias: [midia] }, "claude", "Claude");
    await mkt.aprovar(c.id, { publicarEm: "2020-01-01T12:00:00Z" }, "u1");
    calls.length = 0;
    const r = await mkt.publicarPendentes(new Date());
    assert.ok(r.publicados >= 1);
    let d = await mkt.detalhe(c.id);
    assert.equal(d.links.instagram, "https://instagram.com/p/abc");
    assert.equal(d.links.facebook, "https://www.facebook.com/pg1_post1");
    assert.equal(d.status, "aprovado", "ainda falta o TikTok, à mão");
    assert.ok(calls.some((x) => x.path.endsWith("/ig1/media") && x.body.includes(encodeURIComponent("https://api.exemplo.com/uploads/"))), "manda a URL pública da imagem");
    assert.ok(calls.some((x) => x.path.endsWith("/pg1/photos") && x.body.includes("token-pagina-teste")), "Facebook usa o token da página");
    calls.length = 0;
    await mkt.publicarPendentes(new Date());
    assert.equal(calls.length, 0, "não publica de novo");
    await mkt.marcarPublicado(c.id, { rede: "tiktok", link: "https://www.tiktok.com/@novoseminovo/video/1" }, "u1");
    d = await mkt.detalhe(c.id);
    assert.equal(d.status, "publicado");
    await assert.rejects(mkt.marcarPublicado(c.id, { rede: "tiktok", link: "javascript:alert(1)" }, "u1"), /link/i);
  });

  test("erro ao publicar vira status erro com o motivo, e o token nunca aparece", async () => {
    process.env.INSTAGRAM_ACCOUNT_ID = "conta-inexistente";
    const midia = await mkt.salvarMidia({ nome: "arte.png", base64: PNG_1X1 });
    const c = await mkt.criar({ tipo: "post", redes: ["instagram"], titulo: `Erro ${tag}`, legenda: "x", midias: [midia] }, "claude", "Claude");
    await mkt.aprovar(c.id, { publicarEm: "2020-01-01T12:00:00Z" }, "u1");
    await mkt.publicarPendentes(new Date());
    const d = await mkt.detalhe(c.id);
    assert.equal(d.status, "erro");
    assert.ok(d.erro && !d.erro.includes("token-de-teste"));
    process.env.INSTAGRAM_ACCOUNT_ID = "ig1";
  });

  test("importação: o mesmo conteúdo (origemId) não entra duas vezes; detalhes e impulso ficam guardados", async () => {
    const dados = { tipo: "reels" as const, redes: ["instagram" as const], titulo: `Importado ${tag}`, legenda: "x", dataPlanejada: "2099-02-01T19:00:00-03:00", origemId: `crm-conteudo:${tag}`, detalhes: { pilar: "Mostra", formato: "Reel", roteiro: "cena 1" }, impulso: { status: "proposto" as const, orcamentoDia: 12, dias: 7, inicio: "2099-02-02", objetivo: "Visitas ao site", publico: "Brasil, 22 a 60" } };
    const a = await mkt.criar(dados, "claude", "Claude");
    const b = await mkt.criar(dados, "claude", "Claude");
    assert.equal(b.id, a.id);
    assert.equal(b.repetido, true);
    const d = await mkt.detalhe(a.id);
    assert.equal(d.detalhes?.roteiro, "cena 1");
    assert.equal(d.impulso?.status, "proposto");
    await mkt.aprovarImpulso(a.id, "u1");
    assert.equal((await mkt.detalhe(a.id)).impulso?.status, "aprovado");
    assert.ok((await mkt.impulsos()).some((x) => x.id === a.id));
  });

  test("aprovar todos: aprova de uma vez o que está aguardando e tem data; sem data fica", async () => {
    const com = await mkt.criar({ tipo: "post", redes: ["facebook"], titulo: `Lote A ${tag}`, legenda: "x", dataPlanejada: "2099-03-01T12:00:00-03:00" }, "claude", "Claude");
    const sem = await mkt.criar({ tipo: "post", redes: ["facebook"], titulo: `Lote B ${tag}`, legenda: "x" }, "claude", "Claude");
    const r = await mkt.aprovarTodos("u1");
    assert.ok(r.aprovados >= 1);
    assert.equal((await mkt.detalhe(com.id)).status, "aprovado");
    assert.equal((await mkt.detalhe(sem.id)).status, "em_aprovacao");
    assert.ok(r.semData >= 1);
  });

  test("estratégia por plataforma e de impulsionamento", async () => {
    await mkt.salvarEstrategia("linkedin", { status: "planejada", objetivo: `obj ${tag}`, publico: "lojas", frequencia: "1x", formatos: "texto", horario: "9h", tom: "direto" });
    const e = (await mkt.estrategias()).find((x) => x.plataforma === "linkedin");
    assert.equal(e?.objetivo, `obj ${tag}`);
    await mkt.salvarImpulsoRegras({ objetivo: `tracionar ${tag}`, limiteDia: 20 });
    assert.equal((await mkt.impulsoRegras()).objetivo, `tracionar ${tag}`);
  });

  test("vídeo: só MP4 de verdade (pelos bytes)", async () => {
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(64)]);
    const url = await mkt.salvarVideo(mp4, "reel.mp4");
    assert.match(url, /\.mp4$/);
    await assert.rejects(mkt.salvarVideo(Buffer.from("<html>"), "x.mp4"), /MP4/);
  });

  test("prospecção vira card 'A abordar' no funil, sem duplicar", async () => {
    const empresas = [
      { id: `p1-${tag}`, empresa: `Loja Prospect ${tag}`, tipo: "Loja de veículos", cidade: "Aracaju", uf: "SE", telefone: "(79) 99649-1011", email: "loja@exemplo.com", site: "https://loja.exemplo.com", endereco: "Av. X, 1", nota: 4.9, avaliacoes: 259 },
      { id: `p2-${tag}`, empresa: `Imob Prospect ${tag}`, tipo: "Imobiliária", cidade: "Belém", uf: "PA", telefone: "", email: "", site: "", endereco: "", nota: null, avaliacoes: 0 },
    ];
    const r = await mkt.importarProspeccao(empresas);
    assert.deepEqual([r.criados, r.repetidos], [2, 0]);
    const r2 = await mkt.importarProspeccao(empresas);
    assert.deepEqual([r2.criados, r2.repetidos], [0, 2]);
    const card = await prisma.salesProspect.findFirst({ where: { name: `Loja Prospect ${tag}` }, include: { notes: true } });
    assert.equal(card?.stage, "a_abordar");
    assert.equal(card?.segment, "vehicle");
    assert.equal(card?.source, "prospeccao");
    assert.ok(card?.notes.some((n) => n.body.includes("loja.exemplo.com")));
    assert.equal((await prisma.salesProspect.findFirst({ where: { name: `Imob Prospect ${tag}` } }))?.segment, "property");
    // aparece no CRM do Hub (Empresas → "A abordar")
    const { CrmService } = require("../crm/crm.service") as typeof import("../crm/crm.service");
    const feed = await new CrmService(prisma, { syncPartners: async () => undefined } as never).clientes();
    const noCrm = feed.prospeccao.find((p) => p.nome === `Loja Prospect ${tag}`);
    assert.equal(noCrm?.etapa.id, "a_abordar");
    assert.equal(noCrm?.cidade, "Aracaju");
    await prisma.salesProspect.deleteMany({ where: { name: { contains: tag } } });
  });

  test("orçamento do mês por plataforma", async () => {
    await mkt.salvarOrcamento({ mes: "2099-01", plataforma: "meta_ads", valor: 500 });
    await mkt.salvarOrcamento({ mes: "2099-01", plataforma: "meta_ads", valor: 600 });
    assert.deepEqual(await mkt.orcamentos("2099-01"), { meta_ads: 600 });
  });
});

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

  test("orçamento do mês por plataforma", async () => {
    await mkt.salvarOrcamento({ mes: "2099-01", plataforma: "meta_ads", valor: 500 });
    await mkt.salvarOrcamento({ mes: "2099-01", plataforma: "meta_ads", valor: 600 });
    assert.deepEqual(await mkt.orcamentos("2099-01"), { meta_ads: 600 });
  });
});

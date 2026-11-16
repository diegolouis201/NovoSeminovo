import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { SeoAtualizarSchema, SeoQuerySchema } from "@novoseminovo/shared-types";
import { assinarJwt, filtrarGuias, gscConfig, linhasSeo, oportunidadesSeo, periodosSeo, totaisSeo, variacaoSeo } from "./search-console";

// SEO no Hub: Google Search Console lido pela API com a conta de serviço do
// Google (JWT RS256 assinado aqui, trocado por um token de acesso). Chave em
// arquivo (secrets/gsc_service_account), nunca em log nem em URL.

const b64url = (s: string) => Buffer.from(s, "base64url").toString("utf8");

describe("SEO: regras puras", () => {
  test("períodos: termina 3 dias atrás (o Google demora a fechar) e compara com o período anterior do mesmo tamanho", () => {
    const hoje = new Date("2026-11-16T12:00:00Z");
    assert.deepEqual(periodosSeo(28, hoje), { periodo: { inicio: "2026-10-17", fim: "2026-11-13" }, anterior: { inicio: "2026-09-19", fim: "2026-10-16" } });
    assert.deepEqual(periodosSeo(7, hoje), { periodo: { inicio: "2026-11-07", fim: "2026-11-13" }, anterior: { inicio: "2026-10-31", fim: "2026-11-06" } });
    assert.deepEqual(periodosSeo(90, hoje).periodo, { inicio: "2026-08-16", fim: "2026-11-13" });
    // 01h de 17/11 em UTC ainda é dia 16 em Brasília.
    assert.equal(periodosSeo(7, new Date("2026-11-17T01:00:00Z")).periodo.fim, "2026-11-13");
  });

  test("variação: diferença e porcentagem; base zero não vira infinito", () => {
    assert.deepEqual(variacaoSeo(150, 100), { atual: 150, anterior: 100, variacao: 50, variacaoPct: 50 });
    assert.deepEqual(variacaoSeo(80, 100), { atual: 80, anterior: 100, variacao: -20, variacaoPct: -20 });
    assert.deepEqual(variacaoSeo(5, 0), { atual: 5, anterior: 0, variacao: 5, variacaoPct: null });
    assert.equal(variacaoSeo(1, 3).variacaoPct, -66.67, "duas casas");
  });

  test("totais: linha única do Google; sem linha = zeros", () => {
    assert.deepEqual(totaisSeo({ rows: [{ clicks: 12, impressions: 400, ctr: 0.03, position: 9.456 }] }), { cliques: 12, impressoes: 400, ctr: 0.03, posicao: 9.46 });
    assert.deepEqual(totaisSeo({}), { cliques: 0, impressoes: 0, ctr: 0, posicao: 0 });
    assert.deepEqual(totaisSeo({ rows: [{ clicks: "x", impressions: -3 }] }), { cliques: 0, impressoes: 0, ctr: 0, posicao: 0 }, "valor estranho vira zero");
  });

  test("linhas: chave da dimensão, métricas numéricas, texto cortado em 500", () => {
    const longo = "a".repeat(800);
    const r = linhasSeo({ rows: [{ keys: ["carro usado bh"], clicks: 3, impressions: 90, ctr: 0.0333, position: 7.25 }, { keys: [longo], clicks: 1, impressions: 2, ctr: 0.5, position: 1 }, { keys: [], clicks: 1 }, { clicks: 1 }] });
    assert.equal(r.length, 2, "linha sem chave é descartada");
    assert.deepEqual(r[0], { chave: "carro usado bh", cliques: 3, impressoes: 90, ctr: 0.0333, posicao: 7.25 });
    assert.equal(r[1]!.chave.length, 500);
    assert.deepEqual(linhasSeo({ rows: "lixo" }), []);
  });

  test("oportunidades: posição entre 8 e 20 e impressões no mínimo; uma por consulta (a página com mais impressões); mais impressões primeiro", () => {
    const rows = [
      { keys: ["financiamento carro", "https://novoseminovo.com.br/guia/financiamento"], clicks: 2, impressions: 300, ctr: 0.0067, position: 11.2 },
      { keys: ["financiamento carro", "https://novoseminovo.com.br/"], clicks: 0, impressions: 40, ctr: 0, position: 14 },
      { keys: ["carros bh", "https://novoseminovo.com.br/carros"], clicks: 5, impressions: 900, ctr: 0.0056, position: 8 },
      { keys: ["apartamento bh", "https://novoseminovo.com.br/imoveis"], clicks: 0, impressions: 50, ctr: 0, position: 20 },
      { keys: ["já na página 1", "https://novoseminovo.com.br/"], clicks: 30, impressions: 1000, ctr: 0.03, position: 3.1 },
      { keys: ["longe demais", "https://novoseminovo.com.br/"], clicks: 0, impressions: 1000, ctr: 0, position: 20.5 },
      { keys: ["pouca gente", "https://novoseminovo.com.br/"], clicks: 0, impressions: 9, ctr: 0, position: 10 },
      { keys: ["no limite", "https://novoseminovo.com.br/x"], clicks: 0, impressions: 10, ctr: 0, position: 7.99 },
    ];
    const r = oportunidadesSeo({ rows });
    assert.deepEqual(
      r.map((o) => [o.consulta, o.pagina]),
      [
        ["carros bh", "https://novoseminovo.com.br/carros"],
        ["financiamento carro", "https://novoseminovo.com.br/guia/financiamento"],
        ["apartamento bh", "https://novoseminovo.com.br/imoveis"],
      ],
    );
    assert.equal(r[1]!.impressoes, 300);
    assert.equal(oportunidadesSeo({ rows }, { posicaoMin: 8, posicaoMax: 20, impressoesMin: 100 }).length, 2, "regra configurável");
  });

  test("guias: só páginas com /guia/ no caminho", () => {
    const linhas = [
      { chave: "https://novoseminovo.com.br/guia/como-financiar", cliques: 1, impressoes: 10, ctr: 0.1, posicao: 5 },
      { chave: "https://novoseminovo.com.br/guias", cliques: 1, impressoes: 10, ctr: 0.1, posicao: 5 },
      { chave: "https://novoseminovo.com.br/carros?q=/guia/", cliques: 1, impressoes: 10, ctr: 0.1, posicao: 5 },
      { chave: "https://novoseminovo.com.br/guia/", cliques: 1, impressoes: 10, ctr: 0.1, posicao: 5 },
    ];
    assert.deepEqual(filtrarGuias(linhas).map((l) => l.chave), ["https://novoseminovo.com.br/guia/como-financiar", "https://novoseminovo.com.br/guia/"]);
  });

  test("dias: zod aceita só 7, 28 ou 90 (e nada além)", () => {
    const q = (v: unknown) => SeoQuerySchema.safeParse(v).success;
    assert.equal(q({}), true);
    assert.equal(q({ dias: "7" }), true);
    assert.equal(q({ dias: "28" }), true);
    assert.equal(q({ dias: "90" }), true);
    assert.equal(q({ dias: "30" }), false);
    assert.equal(q({ dias: "7 OR 1=1" }), false);
    assert.equal(q({ dias: "<script>" }), false);
    assert.equal(q({ dias: ["7", "28"] }), false);
    assert.equal(q({ dias: "7", outro: "1" }), false);
    const b = (v: unknown) => SeoAtualizarSchema.safeParse(v).success;
    assert.equal(b({ dias: 28 }), true);
    assert.equal(b({ dias: "28" }), false);
    assert.equal(b({ dias: 365 }), false);
  });

  test("configuração: sem GSC_SITE ou sem arquivo da chave = não configurado, explicando o que falta (sem segredo)", () => {
    const pasta = mkdtempSync(join(tmpdir(), "gsc-cfg-"));
    try {
      const arq = join(pasta, "gsc");
      const segredo = `-----BEGIN PRIVATE KEY-----${"SEGREDO-NAO-PODE-VAZAR".repeat(8)}-----END PRIVATE KEY-----`;
      const semSite = gscConfig({ NODE_ENV: "test", GSC_SERVICE_ACCOUNT_FILE: arq });
      assert.equal(semSite.ok, false);
      assert.match(!semSite.ok ? semSite.falta : "", /GSC_SITE/);
      const semArquivo = gscConfig({ NODE_ENV: "production", GSC_SITE: "sc-domain:novoseminovo.com.br", GSC_SERVICE_ACCOUNT_FILE: join(pasta, "nao-existe") });
      assert.equal(semArquivo.ok, false);
      assert.match(!semArquivo.ok ? semArquivo.falta : "", /gsc_service_account|arquivo/);
      writeFileSync(arq, `{"type": "service_account", "private_key": "${segredo}", "client_email": `);
      chmodSync(arq, 0o600);
      const quebrado = gscConfig({ NODE_ENV: "test", GSC_SITE: "sc-domain:novoseminovo.com.br", GSC_SERVICE_ACCOUNT_FILE: arq });
      assert.equal(quebrado.ok, false);
      assert.ok(!quebrado.ok && !quebrado.falta.includes("SEGREDO"), "mensagem não ecoa o conteúdo do arquivo");
      writeFileSync(arq, JSON.stringify({ type: "service_account", private_key: segredo, client_email: "nao-e-email" }));
      const invalido = gscConfig({ NODE_ENV: "test", GSC_SITE: "sc-domain:novoseminovo.com.br", GSC_SERVICE_ACCOUNT_FILE: arq });
      assert.equal(invalido.ok, false);
      assert.ok(!invalido.ok && !invalido.falta.includes("SEGREDO") && !invalido.falta.includes("nao-e-email"));
      writeFileSync(arq, JSON.stringify({ type: "service_account", private_key: segredo, client_email: "hub@projeto.iam.gserviceaccount.com" }));
      const site = (s: string) => gscConfig({ NODE_ENV: "test", GSC_SITE: s, GSC_SERVICE_ACCOUNT_FILE: arq });
      const ok = site("sc-domain:novoseminovo.com.br");
      assert.equal(ok.ok, true);
      assert.equal(ok.ok && ok.config.conta.token_uri, "https://oauth2.googleapis.com/token", "token_uri padrão");
      assert.equal(ok.ok && ok.config.apiUrl, "https://www.googleapis.com/webmasters/v3");
      assert.equal(site("https://novoseminovo.com.br/").ok, true, "propriedade por prefixo de URL");
      assert.equal(site("sc-domain:novo seminovo.com.br").ok, false);
      assert.equal(site("javascript:alert(1)").ok, false);
      assert.equal(site("sc-domain:x.com/../../outra").ok, false);
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });
});

describe("SEO: Search Console com token e API falsos", () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const PRIVATE_PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const EMAIL = "hub-seo@novoseminovo-teste.iam.gserviceaccount.com";
  const ACCESS = "ya29.tokenDeAcessoFalsoDoGoogleParaTeste0123456789";
  const SITE = "sc-domain:novoseminovo.com.br";
  const pasta = mkdtempSync(join(tmpdir(), "gsc-"));
  const arquivo = join(pasta, "gsc_service_account");
  const env = { ...process.env };
  const { SeoService } = require("./seo.service") as typeof import("./seo.service");
  const { limparCacheTokenGsc } = require("./search-console") as typeof import("./search-console");
  let tokenSrv: Server;
  let api: Server;
  let tokenPedidos: Array<{ body: string; assertion: string; valido: boolean; claims: Record<string, unknown>; header: Record<string, unknown> }> = [];
  let apiPedidos: Array<{ url: string; auth?: string; body: Record<string, unknown> }> = [];
  const logs: string[] = [];
  let falhaApi = false;
  let expiraEm = 3600;
  let caso = 0;

  const porta = (s: Server) => (s.address() as AddressInfo).port;
  const ler = (req: IncomingMessage) => new Promise<string>((r) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => r(b));
  });
  const servico = () => {
    const s = new SeoService();
    const log = (m: unknown) => void logs.push(String(m));
    (s as unknown as { logger: unknown }).logger = { warn: log, error: log, log, debug: log };
    s.agora = () => new Date("2026-11-16T12:00:00Z");
    return s;
  };

  // Respostas do Search Console falso, por tipo de consulta.
  const respostaGsc = (body: Record<string, unknown>) => {
    const dims = (body.dimensions as string[] | undefined) ?? [];
    const anterior = body.startDate === "2026-09-19";
    if (!dims.length) return { rows: [anterior ? { clicks: 100, impressions: 4000, ctr: 0.025, position: 12 } : { clicks: 150, impressions: 5000, ctr: 0.03, position: 10.5 }] };
    if (dims.join() === "date") return { rows: [{ keys: ["2026-10-17"], clicks: 5, impressions: 200, ctr: 0.025, position: 11 }, { keys: ["2026-10-18"], clicks: 7, impressions: 210, ctr: 0.0333, position: 10 }] };
    if (dims.join() === "query") return { rows: [{ keys: ["carros usados bh"], clicks: 40, impressions: 900, ctr: 0.0444, position: 4.2 }, { keys: ["<script>alert(1)</script>"], clicks: 1, impressions: 3, ctr: 0.33, position: 30 }] };
    if (dims.join() === "page" && body.dimensionFilterGroups) return { rows: [{ keys: ["https://novoseminovo.com.br/guia/financiar-carro"], clicks: 3, impressions: 120, ctr: 0.025, position: 9 }, { keys: ["https://novoseminovo.com.br/carros"], clicks: 3, impressions: 120, ctr: 0.025, position: 9 }] };
    if (dims.join() === "page") return { rows: [{ keys: ["https://novoseminovo.com.br/"], clicks: 80, impressions: 2000, ctr: 0.04, position: 6 }] };
    if (dims.join() === "query,page") return { rows: [{ keys: ["financiamento carro bh", "https://novoseminovo.com.br/guia/financiar-carro"], clicks: 1, impressions: 250, ctr: 0.004, position: 12.3 }, { keys: ["carros usados bh", "https://novoseminovo.com.br/"], clicks: 40, impressions: 900, ctr: 0.0444, position: 4.2 }] };
    return { rows: [] };
  };

  before(async () => {
    writeFileSync(arquivo, JSON.stringify({ type: "service_account", project_id: "teste", private_key_id: "abc", private_key: PRIVATE_PEM, client_email: EMAIL, token_uri: "https://oauth2.googleapis.com/token" }, null, 2));
    chmodSync(arquivo, 0o600);
    tokenSrv = createServer(async (req, res) => {
      const body = await ler(req);
      const p = new URLSearchParams(body);
      const assertion = p.get("assertion") ?? "";
      const [h, c, s] = assertion.split(".");
      const v = createVerify("RSA-SHA256");
      v.update(`${h}.${c}`);
      const valido = Boolean(s) && v.verify(publicKey, Buffer.from(s!, "base64url"));
      let claims: Record<string, unknown> = {};
      let header: Record<string, unknown> = {};
      try {
        claims = JSON.parse(b64url(c ?? ""));
        header = JSON.parse(b64url(h ?? ""));
      } catch {
        /* inválido */
      }
      tokenPedidos.push({ body, assertion, valido, claims, header });
      res.setHeader("Content-Type", "application/json");
      if (!valido || p.get("grant_type") !== "urn:ietf:params:oauth:grant-type:jwt-bearer") {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "invalid_grant", error_description: `bad assertion ${assertion}` }));
      }
      res.end(JSON.stringify({ access_token: ACCESS, expires_in: expiraEm, token_type: "Bearer" }));
    });
    api = createServer(async (req, res) => {
      const raw = await ler(req);
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(raw);
      } catch {
        /* vazio */
      }
      apiPedidos.push({ url: req.url ?? "", auth: req.headers.authorization, body });
      res.setHeader("Content-Type", "application/json");
      if (falhaApi || req.headers.authorization !== `Bearer ${ACCESS}`) {
        res.statusCode = 403;
        return res.end(JSON.stringify({ error: { code: 403, status: "PERMISSION_DENIED", message: `User does not have sufficient permission ${ACCESS}`, errors: [{ reason: "forbidden" }] } }));
      }
      res.end(JSON.stringify(respostaGsc(body)));
    });
    await new Promise<void>((r) => tokenSrv.listen(0, "127.0.0.1", r));
    await new Promise<void>((r) => api.listen(0, "127.0.0.1", r));
  });

  after(() => {
    process.env = env;
    tokenSrv.close();
    api.close();
    rmSync(pasta, { recursive: true, force: true });
  });

  beforeEach(() => {
    caso += 1;
    process.env = {
      ...env,
      NODE_ENV: "test",
      GSC_SITE: SITE,
      GSC_SERVICE_ACCOUNT_FILE: arquivo,
      GSC_TOKEN_URL: `http://127.0.0.1:${porta(tokenSrv)}/token${caso}`,
      GSC_API_URL: `http://127.0.0.1:${porta(api)}/webmasters/v3`,
    };
    delete process.env.GSC_SERVICE_ACCOUNT;
    limparCacheTokenGsc();
    tokenPedidos = [];
    apiPedidos = [];
    logs.length = 0;
    falhaApi = false;
    expiraEm = 3600;
  });

  test("JWT RS256 assinado com a chave da conta de serviço (confere com a chave pública)", () => {
    const jwt = assinarJwt({ client_email: EMAIL, private_key: PRIVATE_PEM, token_uri: "https://oauth2.googleapis.com/token" }, 1_800_000_000);
    const [h, c, s] = jwt.split(".");
    assert.deepEqual(JSON.parse(b64url(h!)), { alg: "RS256", typ: "JWT" });
    assert.deepEqual(JSON.parse(b64url(c!)), { iss: EMAIL, scope: "https://www.googleapis.com/auth/webmasters.readonly", aud: "https://oauth2.googleapis.com/token", iat: 1_800_000_000, exp: 1_800_003_600 });
    const v = createVerify("RSA-SHA256");
    v.update(`${h}.${c}`);
    assert.equal(v.verify(publicKey, Buffer.from(s!, "base64url")), true);
  });

  test("lê o Search Console: token pela conta de serviço, corpo de cada consulta e resultado montado", async () => {
    const r = await servico().ler(28);
    assert.equal(r.configurado, true);
    assert.equal(r.erro, undefined);
    assert.equal(tokenPedidos.length, 1);
    const t = tokenPedidos[0]!;
    assert.equal(t.valido, true, "assinatura confere com a chave pública");
    assert.equal(new URLSearchParams(t.body).get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
    assert.equal(t.claims.iss, EMAIL);
    assert.equal(t.claims.scope, "https://www.googleapis.com/auth/webmasters.readonly");
    assert.equal(t.claims.aud, process.env.GSC_TOKEN_URL, "aud = endereço do token");
    assert.equal(Number(t.claims.exp) - Number(t.claims.iat), 3600);

    // Propriedade na URL codificada; token só no Authorization.
    for (const p of apiPedidos) {
      assert.equal(p.url, "/webmasters/v3/sites/sc-domain%3Anovoseminovo.com.br/searchAnalytics/query");
      assert.equal(p.auth, `Bearer ${ACCESS}`);
    }
    const corpos = apiPedidos.map((p) => p.body);
    const achar = (dims: string, inicio = "2026-10-17", filtro = false) => corpos.find((b) => ((b.dimensions as string[] | undefined) ?? []).join() === dims && b.startDate === inicio && Boolean(b.dimensionFilterGroups) === filtro);
    assert.deepEqual(achar(""), { startDate: "2026-10-17", endDate: "2026-11-13", type: "web", rowLimit: 1 });
    assert.deepEqual(achar("", "2026-09-19"), { startDate: "2026-09-19", endDate: "2026-10-16", type: "web", rowLimit: 1 });
    assert.deepEqual(achar("date"), { startDate: "2026-10-17", endDate: "2026-11-13", type: "web", dimensions: ["date"], rowLimit: 28 });
    assert.deepEqual(achar("query"), { startDate: "2026-10-17", endDate: "2026-11-13", type: "web", dimensions: ["query"], rowLimit: 50 });
    assert.deepEqual(achar("page"), { startDate: "2026-10-17", endDate: "2026-11-13", type: "web", dimensions: ["page"], rowLimit: 50 });
    assert.deepEqual(achar("query,page"), { startDate: "2026-10-17", endDate: "2026-11-13", type: "web", dimensions: ["query", "page"], rowLimit: 1000 });
    assert.deepEqual(achar("page", "2026-10-17", true), {
      startDate: "2026-10-17",
      endDate: "2026-11-13",
      type: "web",
      dimensions: ["page"],
      rowLimit: 50,
      dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "contains", expression: "/guia/" }] }],
    });
    assert.equal(apiPedidos.length, 7);

    assert.deepEqual(r.periodo, { inicio: "2026-10-17", fim: "2026-11-13" });
    assert.deepEqual(r.anterior, { inicio: "2026-09-19", fim: "2026-10-16" });
    assert.deepEqual(r.totais!.cliques, { atual: 150, anterior: 100, variacao: 50, variacaoPct: 50 });
    assert.deepEqual(r.totais!.impressoes, { atual: 5000, anterior: 4000, variacao: 1000, variacaoPct: 25 });
    assert.equal(r.totais!.ctr.atual, 0.03);
    assert.equal(r.totais!.ctr.variacao, 0.005);
    assert.equal(r.totais!.posicao.variacao, -1.5, "posição menor = melhor");
    assert.deepEqual(r.serie.map((d) => [d.dia, d.cliques]), [["2026-10-17", 5], ["2026-10-18", 7]]);
    assert.equal(r.consultas[0]!.chave, "carros usados bh");
    assert.equal(r.consultas[1]!.chave, "<script>alert(1)</script>", "texto do Google vai cru; a tela escapa (React)");
    assert.equal(r.paginas[0]!.chave, "https://novoseminovo.com.br/");
    assert.deepEqual(r.oportunidades.map((o) => [o.consulta, o.pagina, o.impressoes]), [["financiamento carro bh", "https://novoseminovo.com.br/guia/financiar-carro", 250]]);
    assert.deepEqual(r.guias.map((g) => g.chave), ["https://novoseminovo.com.br/guia/financiar-carro"], "guias: confere de novo o /guia/ no caminho");
    assert.deepEqual(r.regraOportunidade, { posicaoMin: 8, posicaoMax: 20, impressoesMin: 10 });
    assert.equal(r.site, SITE);
    assert.ok(r.atualizadoEm);
  });

  test("token guardado até 5 minutos antes de vencer", async () => {
    const s = servico();
    await s.ler(7);
    await s.ler(90);
    assert.equal(tokenPedidos.length, 1, "segundo período usa o mesmo token");
    limparCacheTokenGsc();
    expiraEm = 240; // vence em 4 min: já está dentro da margem de 5 min
    await s.ler(28);
    await s.atualizar(28);
    assert.equal(tokenPedidos.length, 3, "token quase vencido é renovado");
  });

  test("cache de 6 horas por período; Atualizar ignora o cache, mas só uma vez a cada 5 minutos", async () => {
    const s = servico();
    await s.ler(28);
    const n = apiPedidos.length;
    await s.ler(28);
    assert.equal(apiPedidos.length, n, "segunda leitura vem do cache");
    await s.ler(7);
    assert.ok(apiPedidos.length > n, "outro período não usa o cache do primeiro");
    const m = apiPedidos.length;
    const r = await s.atualizar(28);
    assert.equal(apiPedidos.length, m + 7, "Atualizar busca de novo");
    assert.ok(r.atualizadoEm);
    await assert.rejects(s.atualizar(28), (e: { getStatus?: () => number; message: string }) => e.getStatus?.() === 429 && /minuto/.test(e.message));
    await assert.rejects(s.atualizar(7), (e: { getStatus?: () => number }) => e.getStatus?.() === 429, "o limite vale para qualquer período");
  });

  test("Google recusa (sem permissão na propriedade): aviso sem segredo; com dado antigo, ele continua", async () => {
    falhaApi = true;
    const r = await servico().ler(28);
    assert.equal(r.configurado, true);
    assert.match(r.erro ?? "", /403/);
    assert.match(r.erro ?? "", /Restrita|usuário/i, "explica como dar acesso");
    assert.deepEqual(r.consultas, []);
    const s = servico();
    falhaApi = false;
    await s.ler(28);
    falhaApi = true;
    const velho = await s.atualizar(28);
    assert.match(velho.erro ?? "", /403/);
    assert.equal(velho.consultas.length, 2, "mantém o que já tinha");
    for (const texto of [...logs, r.erro ?? "", velho.erro ?? ""]) {
      for (const segredo of [ACCESS, PRIVATE_PEM.slice(40, 90), "PRIVATE KEY"]) assert.ok(!texto.includes(segredo), `segredo vazou: ${texto}`);
    }
    assert.ok(logs.length > 0, "falha vira aviso no log");
  });

  test("token recusado: erro sem a assinatura nem a chave", async () => {
    writeFileSync(arquivo, JSON.stringify({ type: "service_account", private_key: generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString(), client_email: EMAIL }));
    try {
      const r = await servico().ler(28);
      assert.match(r.erro ?? "", /invalid_grant/);
      const assertion = tokenPedidos[0]!.assertion;
      for (const texto of [...logs, r.erro ?? ""]) {
        assert.ok(!texto.includes(assertion.split(".")[2]!), "assinatura não vaza");
        assert.ok(!texto.includes("PRIVATE KEY"));
      }
    } finally {
      writeFileSync(arquivo, JSON.stringify({ type: "service_account", private_key: PRIVATE_PEM, client_email: EMAIL }));
    }
  });

  test("chave e token nunca na URL", async () => {
    await servico().ler(28);
    for (const p of apiPedidos) {
      assert.ok(!p.url.includes(ACCESS));
      assert.ok(!p.url.includes("key="));
    }
    assert.ok(!tokenPedidos.some((t) => t.body.includes("PRIVATE")));
  });

  test("não configurado: sem chamar o Google, diz o que falta", async () => {
    delete process.env.GSC_SITE;
    const r = await servico().ler(28);
    assert.equal(r.configurado, false);
    assert.match(r.falta ?? "", /GSC_SITE/);
    assert.equal(tokenPedidos.length + apiPedidos.length, 0);
    process.env.GSC_SITE = SITE;
    process.env.GSC_SERVICE_ACCOUNT_FILE = join(pasta, "nao-existe");
    const r2 = await servico().ler(28);
    assert.equal(r2.configurado, false);
    assert.equal(r2.dias, 28);
    assert.deepEqual(r2.consultas, []);
  });
});

describe("SEO: rota e permissão", () => {
  const { SeoController } = require("./seo.controller") as typeof import("./seo.controller");
  const { HubGuard } = require("./hub.guard") as typeof import("./hub.guard");
  const { Reflector } = require("@nestjs/core") as typeof import("@nestjs/core");
  const pedidos: unknown[] = [];
  const ctrl = new SeoController({ ler: async (d: number) => (pedidos.push(["ler", d]), { dias: d }), atualizar: async (d: number) => (pedidos.push(["atualizar", d]), { dias: d }) } as never);
  const perfis = {
    dono: { userId: "dono", name: "Dono", email: "d@x", profile: "dono", permissions: ["crm.ver", "crm.editar", "financeiro", "marketing", "equipe"] },
    mkt: { userId: "mkt", name: "Ana", email: "a@x", profile: "marketing", permissions: ["marketing"] },
    com: { userId: "com", name: "Bia", email: "b@x", profile: "comercial", permissions: ["crm.ver", "crm.editar"] },
  } as Record<string, unknown>;
  const guard = new HubGuard(new Reflector(), { access: async (id: string) => perfis[id] ?? null } as never);
  const ctx = (userId: string, handler: unknown) => ({ switchToHttp: () => ({ getRequest: () => ({ user: { id: userId } }) }), getHandler: () => handler, getClass: () => SeoController }) as never;

  test("ver: perfis com marketing; comercial recebe 403. Atualizar: só o dono", async () => {
    assert.equal(await guard.canActivate(ctx("dono", SeoController.prototype.ver)), true);
    assert.equal(await guard.canActivate(ctx("mkt", SeoController.prototype.ver)), true);
    await assert.rejects(guard.canActivate(ctx("com", SeoController.prototype.ver)), (e: { getStatus?: () => number }) => e.getStatus?.() === 403);
    assert.equal(await guard.canActivate(ctx("dono", SeoController.prototype.atualizar)), true);
    await assert.rejects(guard.canActivate(ctx("mkt", SeoController.prototype.atualizar)), (e: { getStatus?: () => number }) => e.getStatus?.() === 403);
  });

  test("dias validado pelo zod antes do serviço; padrão 28", async () => {
    await assert.rejects(ctrl.ver({ dias: "30" }), /Período inválido/);
    await assert.rejects(ctrl.ver({ dias: "28; DROP TABLE users" }), /Período inválido/);
    await assert.rejects(ctrl.atualizar({ dias: "<script>" }), /Período inválido/);
    assert.equal(pedidos.length, 0);
    await ctrl.ver({});
    await ctrl.ver({ dias: "90" });
    await ctrl.atualizar({ dias: 7 });
    assert.deepEqual(pedidos, [["ler", 28], ["ler", 90], ["atualizar", 7]]);
  });
});

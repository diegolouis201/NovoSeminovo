import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { JORNADA_PREMISSAS_PADRAO, JornadaSeguidoresManualSchema } from "@novoseminovo/shared-types";
import { montarJornada } from "./jornada-regras";
import { diaBrasil, escolherSeguidores, estadoDoBanco, registrarLeitura, resumoRede, ESTADO_VAZIO, type SeguidoresEstado } from "./jornada-seguidores";
import { canalYoutube, seguidoresYoutube } from "./youtube";

// Seguidores das redes na Jornada: Instagram e Facebook pela Graph da Meta
// (Instagram cai para o Windsor se a Graph recusar), YouTube pela YouTube
// Data API e, para qualquer rede, número digitado pelo dono. Guardados no
// banco (último valor + um ponto por dia) e comparados com 30 dias atrás.
// Nada é inventado: rede sem número fica null.

const zero = { assinaturas: 0, planosAnuncio30d: 0, empresas: 0, particulares: 0 };

describe("Jornada: regras dos seguidores", () => {
  test("dia no fuso de Brasília", () => {
    assert.equal(diaBrasil(new Date("2026-11-16T02:00:00Z")), "2026-11-15", "23h em Brasília ainda é dia 15");
    assert.equal(diaBrasil(new Date("2026-11-16T12:00:00Z")), "2026-11-16");
  });

  test("histórico: no máximo um ponto por dia por rede, o mais novo vale", () => {
    let e = registrarLeitura(ESTADO_VAZIO, "instagram", 100, new Date("2026-11-16T10:00:00Z"));
    e = registrarLeitura(e, "instagram", 105, new Date("2026-11-16T18:00:00Z"));
    assert.deepEqual(e.historico.instagram, [{ dia: "2026-11-16", valor: 105 }]);
    assert.deepEqual(e.atual.instagram, { valor: 105, em: "2026-11-16T18:00:00.000Z", origem: "automatico" });
    e = registrarLeitura(e, "instagram", 110, new Date("2026-11-17T12:00:00Z"));
    assert.deepEqual(e.historico.instagram, [{ dia: "2026-11-16", valor: 105 }, { dia: "2026-11-17", valor: 110 }]);
    assert.equal(e.historico.facebook, undefined, "outra rede não muda");
    assert.equal(ESTADO_VAZIO.historico.instagram, undefined, "não altera o estado de entrada");
  });

  test("histórico guarda só 400 dias", () => {
    let e: SeguidoresEstado = ESTADO_VAZIO;
    const inicio = Date.parse("2025-01-01T12:00:00Z");
    for (let i = 0; i < 410; i++) e = registrarLeitura(e, "facebook", i, new Date(inicio + i * 86_400_000));
    const h = e.historico.facebook!;
    assert.equal(h.length, 400);
    assert.equal(h.at(-1)!.valor, 409);
    assert.equal(h[0]!.valor, 10);
  });

  test("resumo: crescimento contra 30 dias atrás só quando o histórico alcança", () => {
    const hoje = new Date("2026-11-16T12:00:00Z");
    let e = registrarLeitura(ESTADO_VAZIO, "instagram", 200, new Date("2026-10-20T12:00:00Z"));
    e = registrarLeitura(e, "instagram", 250, hoje);
    const curto = resumoRede(e, "instagram", hoje, true);
    assert.equal(curto.valor, 250);
    assert.equal(curto.variacao30d, null, "27 dias de histórico: sem comparação");
    assert.equal(curto.aoVivo, true);

    e = registrarLeitura(ESTADO_VAZIO, "instagram", 150, new Date("2026-10-10T12:00:00Z"));
    e = registrarLeitura(e, "instagram", 200, new Date("2026-10-15T12:00:00Z"));
    e = registrarLeitura(e, "instagram", 210, new Date("2026-10-20T12:00:00Z"));
    e = registrarLeitura(e, "instagram", 250, hoje);
    const r = resumoRede(e, "instagram", hoje, true);
    assert.equal(r.desde, "2026-10-15", "ponto mais novo com 30 dias ou mais");
    assert.equal(r.variacao30d, 50);
    assert.equal(r.variacao30dPct, 25);
    assert.equal(r.atualizadoEm, hoje.toISOString());
  });

  test("resumo: base zero não gera porcentagem infinita; rede sem leitura fica vazia", () => {
    const hoje = new Date("2026-11-16T12:00:00Z");
    let e = registrarLeitura(ESTADO_VAZIO, "tiktok", 0, new Date("2026-10-01T12:00:00Z"));
    e = registrarLeitura(e, "tiktok", 30, hoje);
    const r = resumoRede(e, "tiktok", hoje, true);
    assert.equal(r.variacao30d, 30);
    assert.equal(r.variacao30dPct, null);
    assert.deepEqual(resumoRede(e, "youtube", hoje, false), { valor: null, atualizadoEm: null, aoVivo: false, origem: null, fonteAutomatica: false, aviso: null, variacao30d: null, variacao30dPct: null, desde: null });
  });

  test("origem: leitura automática ou número digitado; valor antigo sem origem conta como automático", () => {
    const hoje = new Date("2026-11-16T12:00:00Z");
    let e = registrarLeitura(ESTADO_VAZIO, "tiktok", 80, hoje, "manual");
    assert.deepEqual(e.atual.tiktok, { valor: 80, em: hoje.toISOString(), origem: "manual" });
    const r = resumoRede(e, "tiktok", hoje, false);
    assert.equal(r.origem, "manual");
    assert.equal(r.aoVivo, false, "digitado nunca é 'ao vivo'");
    e = registrarLeitura(e, "tiktok", 85, new Date("2026-11-16T15:00:00Z"));
    assert.equal(resumoRede(e, "tiktok", hoje, true).origem, "automatico");
    assert.deepEqual(e.historico.tiktok, [{ dia: "2026-11-16", valor: 85 }], "um ponto por dia: o último do dia vale");
    const antigo = estadoDoBanco({ instagram: { valor: 10, em: hoje.toISOString() } }, {});
    assert.equal(resumoRede(antigo, "instagram", hoje, false).origem, "automatico");
    const estragado = estadoDoBanco({ instagram: { valor: 10, em: hoje.toISOString(), origem: "<script>" } }, {});
    assert.equal(estragado.atual.instagram, undefined, "origem fora da lista: ignora o valor");
    const extra = resumoRede(e, "tiktok", hoje, true, { fonteAutomatica: true, aviso: "x" });
    assert.equal(extra.fonteAutomatica, true);
    assert.equal(extra.aviso, "x");
  });

  test("canal do YouTube: id UC..., @handle ou link do canal; o resto é recusado", () => {
    assert.deepEqual(canalYoutube("UCabcdefghijklmnopqrstuv"), { id: "UCabcdefghijklmnopqrstuv" });
    assert.deepEqual(canalYoutube(" @novoseminovooficial "), { handle: "novoseminovooficial" }, "a API aceita o handle sem @");
    assert.deepEqual(canalYoutube("https://www.youtube.com/@novoseminovooficial"), { handle: "novoseminovooficial" });
    assert.deepEqual(canalYoutube("https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv"), { id: "UCabcdefghijklmnopqrstuv" });
    assert.equal(canalYoutube(""), null);
    assert.equal(canalYoutube(undefined), null);
    assert.equal(canalYoutube("@a&key=roubada"), null, "nada de parâmetro extra na URL");
    assert.equal(canalYoutube("novoseminovo"), null);
    assert.equal(canalYoutube("https://evil.com/@x"), null);
  });

  test("inscritos do YouTube: número do statistics; oculto vira null; canal inexistente é erro", () => {
    assert.equal(seguidoresYoutube({ items: [{ statistics: { subscriberCount: "1230", hiddenSubscriberCount: false } }] }), 1230);
    assert.equal(seguidoresYoutube({ items: [{ statistics: { subscriberCount: "1230", hiddenSubscriberCount: true } }] }), null);
    assert.equal(seguidoresYoutube({ items: [{ statistics: { subscriberCount: "muitos" } }] }), null);
    assert.throws(() => seguidoresYoutube({ items: [] }), /canal não encontrado/);
    assert.throws(() => seguidoresYoutube({}), /canal não encontrado/);
  });

  test("número digitado: rede da lista e inteiro de 0 a 1 bilhão; texto, SQL e script recusados", () => {
    const ok = (v: unknown) => JornadaSeguidoresManualSchema.safeParse(v).success;
    assert.equal(ok({ rede: "tiktok", valor: 1520 }), true);
    assert.equal(ok({ rede: "linkedin", valor: 0 }), true);
    assert.equal(ok({ rede: "linkedin", valor: 1_000_000_000 }), true);
    assert.equal(ok({ rede: "linkedin", valor: 1_000_000_001 }), false);
    assert.equal(ok({ rede: "tiktok", valor: -1 }), false);
    assert.equal(ok({ rede: "tiktok", valor: 1.5 }), false);
    assert.equal(ok({ rede: "tiktok", valor: Number.NaN }), false);
    assert.equal(ok({ rede: "tiktok", valor: "100; DROP TABLE users" }), false);
    assert.equal(ok({ rede: "<script>alert(1)</script>", valor: 1 }), false);
    assert.equal(ok({ rede: "orkut", valor: 1 }), false);
    assert.equal(ok({ rede: "tiktok", valor: 1, extra: 1 }), false);
  });

  test("escolher a conta: prefere a do NovoSeminovo, senão a primeira com número", () => {
    const rows = [
      { username: "outra_loja", followers_count: 900 },
      { username: "novoseminovooficial", followers_count: "1234" },
    ];
    assert.equal(escolherSeguidores(rows, "followers_count"), 1234);
    assert.equal(escolherSeguidores([{ username: "a", followers_count: null }, { username: "b", followers_count: 7 }], "followers_count"), 7);
    assert.equal(escolherSeguidores([{ username: "a", followers_count: "muitos" }], "followers_count"), null);
    assert.equal(escolherSeguidores([{ username: "a", followers_count: -3 }], "followers_count"), null, "negativo não vale");
    assert.equal(escolherSeguidores([], "followers_count"), null);
  });

  test("próximo marco mostra % da meta de seguidores de cada rede", () => {
    const redes = { instagram: { valor: 500, atualizadoEm: null, aoVivo: true, origem: "automatico" as const, fonteAutomatica: true, aviso: null, variacao30d: null, variacao30dPct: null, desde: null } };
    const j = montarJornada({ ...zero, redes }, JORNADA_PREMISSAS_PADRAO, new Date("2026-11-16T12:00:00Z"));
    // Próximo marco da receita: R$ 10 -> 1 cliente -> 20 seguidores no Instagram.
    const prox = j.receita.find((m) => m.status === "proximo")!;
    assert.equal(prox.progressoSeguidores!.instagram, 100, "passou da meta: trava em 100");
    assert.equal(prox.progressoSeguidores!.facebook, null, "sem número: null");
    const proxCli = j.clientes.find((m) => m.status === "proximo")!;
    assert.equal(proxCli.seguidores.instagram, 200);
    assert.equal(proxCli.progressoSeguidores!.instagram, 100);
    const j2 = montarJornada({ ...zero, redes: { instagram: { ...redes.instagram, valor: 50 } } }, JORNADA_PREMISSAS_PADRAO, new Date());
    assert.equal(j2.clientes.find((m) => m.status === "proximo")!.progressoSeguidores!.instagram, 25, "50 de 200");
    assert.equal(j2.atual.seguidores.instagram, 50);
    assert.equal(j2.atual.redes.instagram.valor, 50);
    assert.equal(j2.atual.redes.linkedin.valor, null);
    assert.equal(j2.receita.find((m) => m.status === "futuro")!.progressoSeguidores, undefined);
  });
});

const withDb = Boolean(process.env.DATABASE_URL);

describe("Jornada: seguidores lidos da Graph, do YouTube e do Windsor (servidores falsos + banco)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const { PrismaService } = require("../prisma/prisma.service") as typeof import("../prisma/prisma.service");
  const { SeguidoresService } = require("./jornada-seguidores.service") as typeof import("./jornada-seguidores.service");
  const prisma = new PrismaService();
  const env = { ...process.env };
  const WINDSOR_KEY = "chave-windsor-falsa-de-teste-123";
  const SYSTEM_TOKEN = "EAAsystemUserTokenDeTesteJornada123456";
  const PAGE_TOKEN = "EAApageTokenDeTesteJornada987654321";
  const YT_KEY = "AIzaChaveFalsaDoYoutubeParaTeste0123456";
  const PAGE_ID = "828845163855705";
  const CANAL_ID = "UCabcdefghijklmnopqrstuv";
  const CHAVES = ["jornada_seguidores", "jornada_seguidores_historico"];
  const pasta = mkdtempSync(join(tmpdir(), "yt-"));
  const arquivoChave = join(pasta, "youtube_api_key");
  let windsor: Server;
  let graph: Server;
  let youtube: Server;
  let salvos: Array<{ chave: string; valor: unknown }> = [];
  const pedidos: Array<{ servidor: string; url: string; auth?: string; goog?: string }> = [];
  const logs: string[] = [];
  let falhaWindsor = false;
  let falhaGraph = false;
  let falhaIgGraph = false;
  let falhaYoutube = false;
  let caso = 0;
  let ig: unknown[] = [];
  let igGraph: Record<string, unknown> | undefined;
  let fb: Record<string, unknown> = {};
  let yt: Record<string, unknown> = {};

  const servico = () => {
    const s = new SeguidoresService(prisma);
    const log = (m: unknown) => void logs.push(String(m));
    (s as unknown as { logger: unknown }).logger = { warn: log, error: log, log, debug: log };
    return s;
  };
  const porta = (s: Server) => (s.address() as AddressInfo).port;
  const lido = async () => (await prisma.mktSetting.findUnique({ where: { chave: "jornada_seguidores" } }))?.valor as Record<string, { valor: number; em: string; origem?: string }> | undefined;
  const historico = async () => (await prisma.mktSetting.findUnique({ where: { chave: "jornada_seguidores_historico" } }))!.valor as Record<string, Array<{ dia: string; valor: number }>>;

  before(async () => {
    salvos = (await prisma.mktSetting.findMany({ where: { chave: { in: CHAVES } } })).map((r) => ({ chave: r.chave, valor: r.valor }));
    writeFileSync(arquivoChave, `${YT_KEY}\n`);
    chmodSync(arquivoChave, 0o600);
    windsor = createServer((req: IncomingMessage, res) => {
      pedidos.push({ servidor: "windsor", url: req.url ?? "" });
      res.setHeader("Content-Type", "application/json");
      if (falhaWindsor) {
        res.statusCode = 500;
        return res.end("{}");
      }
      const url = new URL(req.url ?? "/", "http://x");
      if (url.searchParams.get("api_key") !== WINDSOR_KEY) {
        res.statusCode = 401;
        return res.end("{}");
      }
      const conector = url.pathname.split("/").filter(Boolean).at(-1)!;
      if (conector === "instagram") return res.end(JSON.stringify({ data: ig }));
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "no accounts" }));
    });
    graph = createServer((req: IncomingMessage, res) => {
      pedidos.push({ servidor: "graph", url: req.url ?? "", auth: req.headers.authorization });
      res.setHeader("Content-Type", "application/json");
      const url = new URL(req.url ?? "/", "http://x");
      const campos = url.searchParams.get("fields");
      if (url.pathname === `/v23.0/${PAGE_ID}` && campos === "access_token" && req.headers.authorization === `Bearer ${SYSTEM_TOKEN}`) {
        return res.end(JSON.stringify({ access_token: PAGE_TOKEN, id: PAGE_ID }));
      }
      if (falhaGraph || req.headers.authorization !== `Bearer ${PAGE_TOKEN}`) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: { message: `Invalid token ${PAGE_TOKEN}`, type: "OAuthException", code: 190 } }));
      }
      if (url.pathname === `/v23.0/${PAGE_ID}` && campos === "instagram_business_account{followers_count,username}") {
        if (falhaIgGraph) {
          res.statusCode = 403;
          return res.end(JSON.stringify({ error: { message: "(#10) Application does not have permission for this action", type: "OAuthException", code: 10 } }));
        }
        return res.end(JSON.stringify({ id: PAGE_ID, ...(igGraph ? { instagram_business_account: igGraph } : {}) }));
      }
      if (url.pathname === `/v23.0/${PAGE_ID}` && campos === "followers_count,fan_count") return res.end(JSON.stringify({ id: PAGE_ID, ...fb }));
      res.statusCode = 404;
      return res.end("{}");
    });
    youtube = createServer((req: IncomingMessage, res) => {
      pedidos.push({ servidor: "youtube", url: req.url ?? "", goog: req.headers["x-goog-api-key"] as string | undefined });
      res.setHeader("Content-Type", "application/json");
      if (falhaYoutube || req.headers["x-goog-api-key"] !== YT_KEY) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: { code: 400, message: `API key not valid ${req.headers["x-goog-api-key"] ?? ""}` } }));
      }
      return res.end(JSON.stringify(yt));
    });
    await new Promise<void>((r) => windsor.listen(0, "127.0.0.1", r));
    await new Promise<void>((r) => graph.listen(0, "127.0.0.1", r));
    await new Promise<void>((r) => youtube.listen(0, "127.0.0.1", r));
  });

  after(async () => {
    process.env = env;
    windsor.close();
    graph.close();
    youtube.close();
    rmSync(pasta, { recursive: true, force: true });
    await prisma.mktSetting.deleteMany({ where: { chave: { in: CHAVES } } });
    for (const s of salvos) await prisma.mktSetting.create({ data: { chave: s.chave, valor: s.valor as object } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    caso += 1;
    process.env = {
      ...env,
      NODE_ENV: "test",
      WINDSOR_API_KEY: WINDSOR_KEY,
      // Cada caso num caminho novo: o cache em memória do cliente Windsor é por URL.
      WINDSOR_API_URL: `http://127.0.0.1:${porta(windsor)}/caso${caso}`,
      META_PAGE_TOKEN: SYSTEM_TOKEN,
      META_PAGE_TOKEN_FILE: "/nao/existe",
      META_PAGE_ID: PAGE_ID,
      META_GRAPH_URL: `http://127.0.0.1:${porta(graph)}`,
      YOUTUBE_API_KEY_FILE: arquivoChave,
      YOUTUBE_API_URL: `http://127.0.0.1:${porta(youtube)}/youtube/v3`,
      YOUTUBE_CHANNEL: "@novoseminovooficial",
    };
    delete process.env.YOUTUBE_API_KEY;
    pedidos.length = 0;
    logs.length = 0;
    falhaWindsor = false;
    falhaGraph = false;
    falhaIgGraph = false;
    falhaYoutube = false;
    ig = [{ username: "outra", followers_count: 9 }, { username: "novoseminovooficial", followers_count: 4 }];
    igGraph = { followers_count: 512, username: "novoseminovooficial", id: "17841400000000000" };
    fb = { followers_count: 321, fan_count: 300 };
    yt = { items: [{ id: CANAL_ID, statistics: { subscriberCount: "1230", hiddenSubscriberCount: false, viewCount: "99" } }] };
    await prisma.mktSetting.deleteMany({ where: { chave: { in: CHAVES } } });
  });

  test("Instagram e Facebook pela Graph, YouTube pela API; guarda no banco; TikTok e LinkedIn sem fonte automática", async () => {
    const redes = await servico().atualizar();
    assert.equal(redes.instagram.valor, 512, "Instagram direto da Graph");
    assert.equal(redes.instagram.origem, "automatico");
    assert.equal(redes.instagram.aoVivo, true);
    assert.equal(redes.instagram.aviso, null);
    assert.equal(redes.facebook.valor, 321, "followers_count tem preferência");
    assert.equal(redes.youtube.valor, 1230);
    assert.equal(redes.youtube.fonteAutomatica, true);
    assert.equal(redes.tiktok.valor, null);
    assert.equal(redes.linkedin.valor, null);
    assert.equal(redes.tiktok.fonteAutomatica, false);
    assert.equal(redes.linkedin.fonteAutomatica, false);
    assert.ok(!pedidos.some((p) => p.servidor === "windsor"), "Graph funcionou: Windsor nem é chamado");
    const salvo = (await lido())!;
    assert.deepEqual([salvo.instagram!.valor, salvo.instagram!.origem], [512, "automatico"]);
    assert.equal(salvo.youtube!.valor, 1230);
    assert.equal(salvo.tiktok, undefined);
    assert.equal((await historico()).instagram!.length, 1);
  });

  test("Graph recusa o Instagram (permissão): cai para o Windsor e avisa qual permissão falta, sem segredo", async () => {
    falhaIgGraph = true;
    const redes = await servico().atualizar();
    assert.equal(redes.instagram.valor, 4, "Windsor: conta do NovoSeminovo, não a outra");
    assert.equal(redes.instagram.origem, "automatico");
    assert.match(redes.instagram.aviso ?? "", /instagram_basic/);
    assert.ok(logs.some((l) => /instagram_basic/.test(l)), "log nomeia a permissão provável");
    for (const l of [...logs, redes.instagram.aviso ?? ""]) {
      for (const segredo of [PAGE_TOKEN, SYSTEM_TOKEN, WINDSOR_KEY, YT_KEY]) assert.ok(!l.includes(segredo), `segredo no log: ${l}`);
    }
  });

  test("página sem Instagram ligado: também tenta o Windsor", async () => {
    igGraph = undefined;
    assert.equal((await servico().atualizar()).instagram.valor, 4);
  });

  test("Graph e Windsor fora do ar: fica o último valor guardado com a data", async () => {
    await servico().atualizar();
    process.env.WINDSOR_API_URL += "-b";
    falhaGraph = true;
    falhaWindsor = true;
    falhaYoutube = true;
    const redes = await servico().atualizar();
    assert.equal(redes.instagram.valor, 512);
    assert.equal(redes.instagram.aoVivo, false);
    assert.ok(redes.instagram.atualizadoEm);
    assert.equal(redes.facebook.valor, 321);
    assert.equal(redes.youtube.valor, 1230);
    assert.equal(redes.youtube.aoVivo, false);
    assert.ok(logs.some((l) => /Instagram/.test(l)) && logs.some((l) => /Facebook/.test(l)) && logs.some((l) => /YouTube/.test(l)));
  });

  test("tokens só no Authorization e chave do YouTube só no x-goog-api-key: nunca na URL nem no log", async () => {
    await servico().atualizar();
    const yt1 = pedidos.filter((p) => p.servidor === "youtube");
    assert.equal(yt1.length, 1);
    assert.equal(yt1[0]!.goog, YT_KEY, "chave lida do arquivo secrets/youtube_api_key");
    const u = new URL(yt1[0]!.url, "http://x");
    assert.equal(u.pathname, "/youtube/v3/channels");
    assert.equal(u.searchParams.get("part"), "statistics");
    assert.equal(u.searchParams.get("forHandle"), "novoseminovooficial");
    assert.equal(u.searchParams.get("key"), null);
    assert.ok(pedidos.filter((p) => p.servidor === "graph").some((p) => p.auth === `Bearer ${PAGE_TOKEN}`));
    for (const p of pedidos) for (const segredo of [PAGE_TOKEN, SYSTEM_TOKEN, YT_KEY]) assert.ok(!p.url.includes(segredo), `segredo na URL: ${p.url}`);
    process.env.WINDSOR_API_URL += "-b";
    falhaGraph = true;
    falhaWindsor = true;
    falhaYoutube = true;
    await servico().atualizar();
    assert.ok(logs.length > 0, "falha vira aviso no log");
    for (const l of logs) for (const segredo of [PAGE_TOKEN, SYSTEM_TOKEN, WINDSOR_KEY, YT_KEY]) assert.ok(!l.includes(segredo), `segredo no log: ${l}`);
  });

  test("YouTube por id do canal; inscritos ocultos = sem número", async () => {
    process.env.YOUTUBE_CHANNEL = CANAL_ID;
    yt = { items: [{ id: CANAL_ID, statistics: { subscriberCount: "50", hiddenSubscriberCount: true } }] };
    const redes = await servico().atualizar();
    assert.equal(redes.youtube.valor, null);
    const u = new URL(pedidos.find((p) => p.servidor === "youtube")!.url, "http://x");
    assert.equal(u.searchParams.get("id"), CANAL_ID);
    assert.equal(u.searchParams.get("forHandle"), null);
  });

  test("sem chave ou sem canal do YouTube: rede não é automática e nada é chamado", async () => {
    process.env.YOUTUBE_API_KEY_FILE = join(pasta, "nao-existe");
    let redes = await servico().atualizar();
    assert.equal(redes.youtube.valor, null);
    assert.equal(redes.youtube.fonteAutomatica, false);
    process.env.YOUTUBE_API_KEY_FILE = arquivoChave;
    delete process.env.YOUTUBE_CHANNEL;
    redes = await servico().atualizar();
    assert.equal(redes.youtube.fonteAutomatica, false);
    assert.ok(!pedidos.some((p) => p.servidor === "youtube"));
  });

  test("número digitado: guarda como manual com data e vale quando não há leitura automática", async () => {
    const s = servico();
    const r = await s.registrarManual("tiktok", 1520);
    assert.equal(r.valor, 1520);
    assert.equal(r.origem, "manual");
    const salvo = (await lido())!;
    assert.equal(salvo.tiktok!.origem, "manual");
    assert.ok(salvo.tiktok!.em);
    const redes = await s.redes();
    assert.equal(redes.tiktok.valor, 1520, "tela já mostra o digitado");
    assert.equal(redes.tiktok.origem, "manual");
    await s.registrarManual("tiktok", 1600);
    const h = (await historico()).tiktok!;
    assert.equal(h.length, 1, "um ponto por dia: o último do dia vale");
    assert.equal(h[0]!.valor, 1600);
    // Leitura automática seguinte não apaga o digitado da rede sem fonte.
    assert.equal((await servico().atualizar()).tiktok.valor, 1600);
  });

  test("leitura automática passa por cima do digitado; se ela cair, o digitado vale", async () => {
    const s = servico();
    await s.registrarManual("youtube", 999);
    let redes = await s.atualizar();
    assert.equal(redes.youtube.valor, 1230, "automática ganha");
    assert.equal(redes.youtube.origem, "automatico");
    falhaYoutube = true;
    await s.registrarManual("youtube", 1300);
    redes = await s.atualizar();
    assert.equal(redes.youtube.valor, 1300, "automática fora do ar: vale o digitado");
    assert.equal(redes.youtube.origem, "manual");
  });

  test("cache de 1 hora: segunda leitura não chama as fontes", async () => {
    const s = servico();
    await s.redes();
    const n = pedidos.length;
    assert.ok(n > 0);
    igGraph = { followers_count: 999 };
    const de_novo = await s.redes();
    assert.equal(pedidos.length, n);
    assert.equal(de_novo.instagram.valor, 512);
  });

  test("valor estragado no banco é ignorado (não derruba a tela)", async () => {
    await prisma.mktSetting.create({ data: { chave: "jornada_seguidores", valor: { instagram: { valor: "<script>", em: "x" } } } });
    await prisma.mktSetting.create({ data: { chave: "jornada_seguidores_historico", valor: "lixo" } });
    falhaGraph = true;
    falhaWindsor = true;
    const redes = await servico().atualizar();
    assert.equal(redes.instagram.valor, null);
  });

  test("rotina não roda em teste", () => {
    const s = servico();
    s.onModuleInit();
    assert.equal((s as unknown as { timer?: unknown }).timer, undefined);
  });
});

describe("Jornada: rota do número digitado", () => {
  const { JornadaController } = require("./jornada.controller") as typeof import("./jornada.controller");
  const { HubGuard } = require("./hub.guard") as typeof import("./hub.guard");
  const { Reflector } = require("@nestjs/core") as typeof import("@nestjs/core");
  const recebidos: unknown[] = [];
  const ctrl = new JornadaController({ salvarSeguidoresManual: async (rede: string, valor: number) => (recebidos.push([rede, valor]), { valor, origem: "manual" }) } as never);
  const perfis = {
    u1: { userId: "u1", name: "Dono", email: "d@x", profile: "dono", permissions: ["crm.ver", "financeiro", "equipe"] },
    u2: { userId: "u2", name: "Ana", email: "a@x", profile: "marketing", permissions: ["crm.ver", "marketing"] },
  } as Record<string, unknown>;
  const guard = new HubGuard(new Reflector(), { access: async (id: string) => perfis[id] ?? null } as never);
  const ctx = (userId: string) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user: { id: userId } }) }), getHandler: () => JornadaController.prototype.salvarSeguidores, getClass: () => JornadaController }) as never;

  test("só o dono (permissão equipe) digita; o resto da equipe recebe 403", async () => {
    assert.equal(Reflect.getMetadata("hub:permission", JornadaController.prototype.salvarSeguidores), "equipe");
    assert.equal(await guard.canActivate(ctx("u1")), true);
    await assert.rejects(guard.canActivate(ctx("u2")), (e: { getStatus?: () => number }) => e.getStatus?.() === 403);
  });

  test("corpo validado antes do serviço (zod)", async () => {
    await assert.rejects(ctrl.salvarSeguidores({ rede: "tiktok", valor: "1.000<script>" }), /Use só números/);
    await assert.rejects(ctrl.salvarSeguidores({ rede: "orkut", valor: 10 }), /Rede inválida/);
    await assert.rejects(ctrl.salvarSeguidores({ rede: "tiktok", valor: -5 }), /0 a 1.000.000.000/);
    await assert.rejects(ctrl.salvarSeguidores({ rede: "tiktok", valor: 10, origem: "automatico" }), /BadRequest|Unrecognized|não reconhecid/i);
    assert.equal(recebidos.length, 0);
    const r = await ctrl.salvarSeguidores({ rede: "linkedin", valor: 340 });
    assert.deepEqual(recebidos, [["linkedin", 340]]);
    assert.deepEqual(r, { ok: true, rede: { valor: 340, origem: "manual" } });
  });
});

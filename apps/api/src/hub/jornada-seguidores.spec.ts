import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { JORNADA_PREMISSAS_PADRAO } from "@novoseminovo/shared-types";
import { montarJornada } from "./jornada-regras";
import { diaBrasil, escolherSeguidores, registrarLeitura, resumoRede, ESTADO_VAZIO, type SeguidoresEstado } from "./jornada-seguidores";

// Seguidores das redes na Jornada: lidos sozinhos (Windsor.ai e Graph API da
// Meta), guardados no banco (último valor bom + um ponto por dia) e
// comparados com 30 dias atrás. Nada é inventado: rede sem número fica null.

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
    assert.deepEqual(e.atual.instagram, { valor: 105, em: "2026-11-16T18:00:00.000Z" });
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
    assert.deepEqual(resumoRede(e, "youtube", hoje, false), { valor: null, atualizadoEm: null, aoVivo: false, variacao30d: null, variacao30dPct: null, desde: null });
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
    const redes = { instagram: { valor: 500, atualizadoEm: null, aoVivo: true, variacao30d: null, variacao30dPct: null, desde: null } };
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

describe("Jornada: seguidores lidos do Windsor e da Graph (servidores falsos + banco)", { skip: !withDb && "sem DATABASE_URL" }, () => {
  const { PrismaService } = require("../prisma/prisma.service") as typeof import("../prisma/prisma.service");
  const { SeguidoresService } = require("./jornada-seguidores.service") as typeof import("./jornada-seguidores.service");
  const prisma = new PrismaService();
  const env = { ...process.env };
  const WINDSOR_KEY = "chave-windsor-falsa-de-teste-123";
  const SYSTEM_TOKEN = "EAAsystemUserTokenDeTesteJornada123456";
  const PAGE_TOKEN = "EAApageTokenDeTesteJornada987654321";
  const PAGE_ID = "828845163855705";
  const CHAVES = ["jornada_seguidores", "jornada_seguidores_historico"];
  let windsor: Server;
  let graph: Server;
  let salvos: Array<{ chave: string; valor: unknown }> = [];
  const pedidos: Array<{ url: string; auth?: string }> = [];
  const logs: string[] = [];
  let falhaWindsor = false;
  let falhaGraph = false;
  let caso = 0;
  let ig: unknown[] = [];
  let fb: Record<string, unknown> = {};
  let extras: Record<string, Record<string, unknown>[]> = {};

  const servico = () => {
    const s = new SeguidoresService(prisma);
    const log = (m: unknown) => void logs.push(String(m));
    (s as unknown as { logger: unknown }).logger = { warn: log, error: log, log };
    return s;
  };
  const porta = (s: Server) => (s.address() as AddressInfo).port;

  before(async () => {
    salvos = (await prisma.mktSetting.findMany({ where: { chave: { in: CHAVES } } })).map((r) => ({ chave: r.chave, valor: r.valor }));
    windsor = createServer((req: IncomingMessage, res) => {
      pedidos.push({ url: req.url ?? "" });
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
      const campos = (url.searchParams.get("fields") ?? "").split(",").filter((c) => c !== "date");
      if (conector === "instagram") return res.end(JSON.stringify({ data: ig }));
      const linhas = extras[conector];
      if (!linhas) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "no accounts" }));
      }
      if (!linhas.some((l) => campos.some((c) => c in l))) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "unknown field" }));
      }
      return res.end(JSON.stringify({ data: linhas }));
    });
    graph = createServer((req: IncomingMessage, res) => {
      pedidos.push({ url: req.url ?? "", auth: req.headers.authorization });
      res.setHeader("Content-Type", "application/json");
      const url = new URL(req.url ?? "/", "http://x");
      if (url.pathname === `/v23.0/${PAGE_ID}` && url.searchParams.get("fields") === "access_token" && req.headers.authorization === `Bearer ${SYSTEM_TOKEN}`) {
        return res.end(JSON.stringify({ access_token: PAGE_TOKEN, id: PAGE_ID }));
      }
      if (falhaGraph || req.headers.authorization !== `Bearer ${PAGE_TOKEN}`) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: { message: `Invalid token ${PAGE_TOKEN}`, type: "OAuthException", code: 190 } }));
      }
      if (url.pathname === `/v23.0/${PAGE_ID}`) return res.end(JSON.stringify({ id: PAGE_ID, ...fb }));
      res.statusCode = 404;
      return res.end("{}");
    });
    await new Promise<void>((r) => windsor.listen(0, "127.0.0.1", r));
    await new Promise<void>((r) => graph.listen(0, "127.0.0.1", r));
    process.env = {
      ...env,
      NODE_ENV: "test",
      WINDSOR_API_KEY: WINDSOR_KEY,
      META_PAGE_TOKEN: SYSTEM_TOKEN,
      META_PAGE_TOKEN_FILE: "/nao/existe",
      META_PAGE_ID: PAGE_ID,
      META_GRAPH_URL: `http://127.0.0.1:${porta(graph)}`,
    };
  });

  after(async () => {
    process.env = env;
    windsor.close();
    graph.close();
    await prisma.mktSetting.deleteMany({ where: { chave: { in: CHAVES } } });
    for (const s of salvos) await prisma.mktSetting.create({ data: { chave: s.chave, valor: s.valor as object } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Cada caso num caminho novo: o cache em memória do cliente Windsor é por URL.
    caso += 1;
    process.env.WINDSOR_API_URL = `http://127.0.0.1:${porta(windsor)}/caso${caso}`;
    pedidos.length = 0;
    logs.length = 0;
    falhaWindsor = false;
    falhaGraph = false;
    ig = [{ username: "outra", followers_count: 9 }, { username: "novoseminovooficial", followers_count: 4 }];
    fb = { followers_count: 321, fan_count: 300 };
    extras = {};
    await prisma.mktSetting.deleteMany({ where: { chave: { in: CHAVES } } });
  });

  test("lê Instagram (Windsor) e Facebook (Graph), guarda no banco; redes não conectadas ficam null", async () => {
    const redes = await servico().atualizar();
    assert.equal(redes.instagram.valor, 4, "conta do NovoSeminovo, não a outra");
    assert.equal(redes.facebook.valor, 321, "followers_count tem preferência");
    assert.equal(redes.tiktok.valor, null);
    assert.equal(redes.youtube.valor, null);
    assert.equal(redes.linkedin.valor, null);
    assert.equal(redes.instagram.aoVivo, true);
    const salvo = (await prisma.mktSetting.findUnique({ where: { chave: "jornada_seguidores" } }))!.valor as Record<string, { valor: number; em: string }>;
    assert.equal(salvo.instagram!.valor, 4);
    assert.equal(salvo.facebook!.valor, 321);
    assert.equal(salvo.tiktok, undefined);
    const hist = (await prisma.mktSetting.findUnique({ where: { chave: "jornada_seguidores_historico" } }))!.valor as Record<string, unknown[]>;
    assert.equal(hist.instagram!.length, 1);
  });

  test("token da página só no cabeçalho Authorization; nem token nem chave nos logs", async () => {
    falhaWindsor = true;
    await servico().atualizar();
    const graphPedidos = pedidos.filter((p) => p.auth);
    assert.ok(graphPedidos.some((p) => p.auth === `Bearer ${PAGE_TOKEN}` && /fields=followers_count%2Cfan_count/.test(p.url)));
    assert.ok(pedidos.every((p) => !p.url.includes(PAGE_TOKEN) && !p.url.includes(SYSTEM_TOKEN)), "token nunca na URL");
    falhaGraph = true;
    await servico().atualizar();
    assert.ok(logs.length > 0, "falha vira aviso no log");
    for (const l of logs) {
      assert.ok(!l.includes(PAGE_TOKEN) && !l.includes(SYSTEM_TOKEN) && !l.includes(WINDSOR_KEY), `segredo no log: ${l}`);
    }
  });

  test("sem followers_count, usa fan_count da página", async () => {
    fb = { fan_count: 300 };
    assert.equal((await servico().atualizar()).facebook.valor, 300);
  });

  test("cache de 1 hora: segunda leitura não chama as fontes", async () => {
    const s = servico();
    await s.redes();
    const n = pedidos.length;
    assert.ok(n > 0);
    ig = [{ username: "novoseminovooficial", followers_count: 999 }];
    const de_novo = await s.redes();
    assert.equal(pedidos.length, n);
    assert.equal(de_novo.instagram.valor, 4);
  });

  test("fonte fora do ar: mostra o último valor guardado com a data", async () => {
    await servico().atualizar();
    process.env.WINDSOR_API_URL = `http://127.0.0.1:${porta(windsor)}/caso${caso}-b`;
    falhaWindsor = true;
    falhaGraph = true;
    const redes = await servico().atualizar();
    assert.equal(redes.instagram.valor, 4);
    assert.equal(redes.instagram.aoVivo, false);
    assert.ok(redes.instagram.atualizadoEm);
    assert.equal(redes.facebook.valor, 321);
    assert.equal(redes.facebook.aoVivo, false);
    assert.ok(logs.some((l) => /Instagram/.test(l)) && logs.some((l) => /Facebook/.test(l)));
  });

  test("histórico: duas leituras no mesmo dia viram um ponto só", async () => {
    await servico().atualizar();
    process.env.WINDSOR_API_URL = `http://127.0.0.1:${porta(windsor)}/caso${caso}-b`;
    ig = [{ username: "novoseminovooficial", followers_count: 6 }];
    await servico().atualizar();
    const hist = (await prisma.mktSetting.findUnique({ where: { chave: "jornada_seguidores_historico" } }))!.valor as Record<string, Array<{ valor: number }>>;
    assert.equal(hist.instagram!.length, 1);
    assert.equal(hist.instagram![0]!.valor, 6);
  });

  test("TikTok, YouTube e LinkedIn entram quando o Windsor devolve um total numérico", async () => {
    extras = {
      tiktok_organic: [{ date: "2026-11-14", followers_count: 60 }, { date: "2026-11-16", followers_count: 70 }],
      youtube: [{ subscriber_count: "12" }],
      linkedin_organic: [{ follower_count: "não sei" }],
    };
    const redes = await servico().atualizar();
    assert.equal(redes.tiktok.valor, 70, "dia mais recente, sem somar os dias");
    assert.equal(redes.youtube.valor, 12);
    assert.equal(redes.linkedin.valor, null, "texto não vira número");
  });

  test("valor estragado no banco é ignorado (não derruba a tela)", async () => {
    await prisma.mktSetting.create({ data: { chave: "jornada_seguidores", valor: { instagram: { valor: "<script>", em: "x" } } } });
    await prisma.mktSetting.create({ data: { chave: "jornada_seguidores_historico", valor: "lixo" } });
    falhaWindsor = true;
    falhaGraph = true;
    const redes = await servico().atualizar();
    assert.equal(redes.instagram.valor, null);
  });

  test("rotina não roda em teste", () => {
    const s = servico();
    s.onModuleInit();
    assert.equal((s as unknown as { timer?: unknown }).timer, undefined);
  });
});

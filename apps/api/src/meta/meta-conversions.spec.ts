import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanFbc,
  cleanFbp,
  cleanMetaEventId,
  isMetaPixelId,
  parseMetaEventQueue,
  serializeMetaEventQueue,
} from "@novoseminovo/shared-types";
import { buildFbc, hashEmail, hashPhone, metaConfig, metaContextFrom } from "./meta-conversions";
import { MetaConversionsService } from "./meta-conversions.service";

// Etapa 2a de marketing: Meta Pixel + API de Conversões, dormente até o Diego
// criar o pixel. Sem ID do pixel ou sem token (arquivo secrets/meta_capi_token)
// nada é enviado; sem o "Aceitar" dos cookies, também não.

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const EVENT_ID = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";
const TOKEN = "EAAtokenDeTesteDaMetaMuitoSecreto123456";
const FBP = "fb.1.1731500000000.1234567890";

describe("Meta: validação do que vem do site", () => {
  test("ID do pixel: só números", () => {
    assert.equal(isMetaPixelId("123456789012345"), true);
    assert.equal(isMetaPixelId(" 123456789012345 "), false);
    assert.equal(isMetaPixelId("12345abc"), false);
    assert.equal(isMetaPixelId("123');alert(1);//"), false);
    assert.equal(isMetaPixelId(""), false);
    assert.equal(isMetaPixelId(undefined), false);
    assert.equal(isMetaPixelId("1".repeat(30)), false);
  });

  test("id do evento: só UUID, até 64 caracteres", () => {
    assert.equal(cleanMetaEventId(EVENT_ID), EVENT_ID);
    assert.equal(cleanMetaEventId(EVENT_ID.toUpperCase()), EVENT_ID.toUpperCase());
    assert.equal(cleanMetaEventId("abc"), undefined);
    assert.equal(cleanMetaEventId(`${EVENT_ID}<script>`), undefined);
    assert.equal(cleanMetaEventId("' OR 1=1 --"), undefined);
    assert.equal(cleanMetaEventId(undefined), undefined);
  });

  test("_fbp e _fbc: formato da Meta, nada além", () => {
    assert.equal(cleanFbp(FBP), FBP);
    assert.equal(cleanFbp("fb.1.1731500000000.123<script>"), undefined);
    assert.equal(cleanFbp("qualquer coisa"), undefined);
    assert.equal(cleanFbc("fb.1.1731500000000.IwAR3xYz_AbC-123"), "fb.1.1731500000000.IwAR3xYz_AbC-123");
    assert.equal(cleanFbc("fb.1.1731500000000.Iw\"AR"), undefined);
  });

  test("fila de eventos do navegador: nome, id e categoria conferidos", () => {
    const raw = serializeMetaEventQueue([
      { name: "Lead", eventId: EVENT_ID, category: "lojas" },
      { name: "CompleteRegistration", eventId: EVENT_ID.replace("3f", "4a") },
    ]);
    assert.deepEqual(parseMetaEventQueue(raw), [
      { name: "Lead", eventId: EVENT_ID, category: "lojas" },
      { name: "CompleteRegistration", eventId: EVENT_ID.replace("3f", "4a") },
    ]);
    assert.deepEqual(parseMetaEventQueue(encodeURIComponent(raw)), parseMetaEventQueue(raw));
    // Evento inventado, id inválido ou categoria fora da lista são descartados.
    assert.deepEqual(parseMetaEventQueue(`Purchase:${EVENT_ID}:,Lead:x:lojas,Lead:${EVENT_ID}:<img>,Lead:${EVENT_ID}:`), [{ name: "Lead", eventId: EVENT_ID }]);
    assert.deepEqual(parseMetaEventQueue(undefined), []);
  });
});

describe("Meta: normalização e hash", () => {
  test("e-mail em minúsculas e sem espaços antes do SHA-256", () => {
    assert.equal(hashEmail("  Maria.Silva@Exemplo.COM "), sha("maria.silva@exemplo.com"));
    assert.equal(hashEmail(""), undefined);
    assert.equal(hashEmail(undefined), undefined);
  });

  test("telefone só com números e o 55 do Brasil", () => {
    assert.equal(hashPhone("(31) 98888-7777"), sha("5531988887777"));
    assert.equal(hashPhone("+55 31 98888-7777"), sha("5531988887777"));
    assert.equal(hashPhone("031 3333-4444"), sha("553133334444"));
    assert.equal(hashPhone("123"), undefined);
    assert.equal(hashPhone(undefined), undefined);
  });

  test("fbc montado a partir do fbclid", () => {
    assert.equal(buildFbc("IwAR3xYz_AbC-123", 1731500000123), "fb.1.1731500000123.IwAR3xYz_AbC-123");
    assert.equal(buildFbc(undefined, 1), undefined);
    assert.equal(buildFbc("tem espaço", 1), undefined);
  });
});

describe("Meta: contexto do evento a partir dos cabeçalhos do site", () => {
  const request = (headers: Record<string, string>) => ({ headers, ip: "10.0.0.2" }) as never;
  const consented = {
    "x-ns-consent": "granted",
    "x-ns-event-id": EVENT_ID,
    "x-ns-fbp": FBP,
    "x-ns-page-url": "http://localhost:3000/para-lojas/comecar?email=maria@exemplo.com#topo",
    "x-client-ip": "200.100.50.25",
    "x-client-user-agent": "Mozilla/5.0 (Teste)",
    "x-ns-origem": encodeURIComponent("meta_ads|paid|lojas|anuncio_1|publico_a|IwAR3xYz_AbC-123"),
  };

  test("sem o aceite dos cookies não há contexto (nada vai para a Meta)", () => {
    const { "x-ns-consent": _consent, ...rest } = consented;
    assert.equal(metaContextFrom(request(rest), { WEB_ORIGIN: "http://localhost:3000" }), undefined);
    assert.equal(metaContextFrom(request({ ...consented, "x-ns-consent": "denied" }), { WEB_ORIGIN: "http://localhost:3000" }), undefined);
  });

  test("com aceite: id do evento, fbp, fbc do clique, IP, navegador e página sem a query", () => {
    const ctx = metaContextFrom(request(consented), { WEB_ORIGIN: "http://localhost:3000" }, 1731500000999);
    assert.deepEqual(ctx, {
      eventId: EVENT_ID,
      fbp: FBP,
      fbc: "fb.1.1731500000999.IwAR3xYz_AbC-123",
      clientIp: "200.100.50.25",
      userAgent: "Mozilla/5.0 (Teste)",
      sourceUrl: "http://localhost:3000/para-lojas/comecar",
    });
  });

  test("_fbc do navegador vale mais que o montado; valores forjados são descartados", () => {
    const ctx = metaContextFrom(
      request({
        ...consented,
        "x-ns-fbc": "fb.1.1731400000000.IwAR3xYz_AbC-123",
        "x-ns-fbp": "fb.1.<script>",
        "x-ns-page-url": "javascript:alert(1)",
        "x-client-ip": "não é ip",
      }),
      { WEB_ORIGIN: "http://localhost:3000" },
    );
    assert.equal(ctx?.fbc, "fb.1.1731400000000.IwAR3xYz_AbC-123");
    assert.equal(ctx?.fbp, undefined);
    assert.equal(ctx?.sourceUrl, undefined);
    assert.equal(ctx?.clientIp, undefined);
  });

  test("página de outro domínio não vira event_source_url", () => {
    const ctx = metaContextFrom(request({ ...consented, "x-ns-page-url": "https://golpe.example.com/para-lojas" }), { WEB_ORIGIN: "http://localhost:3000" });
    assert.equal(ctx?.sourceUrl, undefined);
  });

  test("id do evento inválido: a API gera um novo (só o servidor manda)", () => {
    const ctx = metaContextFrom(request({ ...consented, "x-ns-event-id": "'; DROP TABLE users; --" }), {});
    assert.ok(ctx);
    assert.notEqual(ctx.eventId, "'; DROP TABLE users; --");
    assert.ok(cleanMetaEventId(ctx.eventId));
  });
});

describe("Meta: configuração", () => {
  test("ID do pixel só com números; token só com tamanho mínimo", () => {
    const tokenFile = () => TOKEN;
    assert.equal(metaConfig({ META_PIXEL_ID: "123456789012345" }, tokenFile)?.pixelId, "123456789012345");
    assert.equal(metaConfig({ META_PIXEL_ID: "12345abc" }, tokenFile), undefined);
    assert.equal(metaConfig({}, tokenFile), undefined);
    assert.equal(metaConfig({ META_PIXEL_ID: "123456789012345" }, () => "curto"), undefined);
    const missing = () => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    };
    assert.equal(metaConfig({ META_PIXEL_ID: "123456789012345", NODE_ENV: "production", META_CAPI_TOKEN: TOKEN }, missing), undefined);
    // Também aceita o mesmo nome do site (uma variável só no .env).
    assert.equal(metaConfig({ NEXT_PUBLIC_META_PIXEL_ID: "998877665544" }, tokenFile)?.pixelId, "998877665544");
    assert.equal(metaConfig({ META_PIXEL_ID: "123456789012345", META_TEST_EVENT_CODE: "TEST12345" }, tokenFile)?.testEventCode, "TEST12345");
    assert.equal(metaConfig({ META_PIXEL_ID: "123456789012345", META_TEST_EVENT_CODE: "x<y" }, tokenFile)?.testEventCode, undefined);
  });
});

describe("Meta: API de Conversões contra um servidor falso", () => {
  let server: Server;
  let status = 200;
  let delayMs = 0;
  const calls: Array<{ method?: string; url: string; body: Record<string, unknown> }> = [];
  const logs: string[] = [];
  const env = { ...process.env };
  const prisma = {
    user: { findUnique: async () => ({ email: "Comprador@Exemplo.com", phone: "(31) 97777-6666" }) },
    listing: { findUnique: async () => ({ type: "property" }) },
  };

  const service = () => {
    const created = new MetaConversionsService(prisma as never);
    const log = (message: unknown) => void logs.push(String(message));
    (created as unknown as { logger: unknown }).logger = { warn: log, error: log, log };
    return created;
  };
  const ctx = { eventId: EVENT_ID, fbp: FBP, fbc: "fb.1.1731500000999.IwAR3xYz_AbC-123", clientIp: "200.100.50.25", userAgent: "Mozilla/5.0 (Teste)", sourceUrl: "https://novoseminovo.com.br/para-lojas/comecar" };

  before(async () => {
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        calls.push({ method: req.method, url: req.url ?? "", body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {} });
        setTimeout(() => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.end(
            status === 200
              ? JSON.stringify({ events_received: 1, fbtrace_id: "abc" })
              : JSON.stringify({ error: { message: `Invalid OAuth access token ${TOKEN} para maria@exemplo.com`, type: "OAuthException", code: 190 } }),
          );
        }, delayMs);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  });

  after(() => {
    server.close();
    process.env = env;
  });

  beforeEach(() => {
    calls.length = 0;
    logs.length = 0;
    status = 200;
    delayMs = 0;
    process.env = {
      ...env,
      NODE_ENV: "test",
      META_PIXEL_ID: "123456789012345",
      META_CAPI_TOKEN: TOKEN,
      META_CAPI_TOKEN_FILE: "/caminho/que/nao/existe",
      META_GRAPH_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      META_TEST_EVENT_CODE: "",
    };
  });

  test("Lead: formato do evento, hash do e-mail/telefone e o mesmo event_id do navegador", async () => {
    await service().track("Lead", ctx, { email: " Maria@Exemplo.com ", phone: "(31) 98888-7777" }, "lojas");
    assert.equal(calls.length, 1);
    const [call] = calls;
    assert.equal(call.method, "POST");
    assert.equal(call.url, "/v23.0/123456789012345/events");
    assert.equal(call.body.access_token, TOKEN);
    assert.equal(call.body.test_event_code, undefined);
    const [event] = call.body.data as Array<Record<string, unknown>>;
    assert.equal(event.event_name, "Lead");
    assert.equal(event.event_id, EVENT_ID);
    assert.equal(event.action_source, "website");
    assert.equal(event.event_source_url, ctx.sourceUrl);
    assert.ok(Math.abs(Number(event.event_time) - Date.now() / 1000) < 10);
    assert.deepEqual(event.user_data, {
      em: [sha("maria@exemplo.com")],
      ph: [sha("5531988887777")],
      client_ip_address: "200.100.50.25",
      client_user_agent: "Mozilla/5.0 (Teste)",
      fbc: ctx.fbc,
      fbp: FBP,
    });
    assert.deepEqual(event.custom_data, { content_category: "lojas" });
    // Nada de dado pessoal em claro no corpo enviado.
    const sent = JSON.stringify(call.body);
    assert.ok(!sent.includes("maria@exemplo.com") && !sent.includes("98888"));
  });

  test("CompleteRegistration de quem tem conta: e-mail e telefone lidos do cadastro", async () => {
    await service().track("CompleteRegistration", ctx, { userId: "usuario-1" }, "conta");
    const [event] = calls[0].body.data as Array<Record<string, unknown>>;
    assert.equal(event.event_name, "CompleteRegistration");
    const user = event.user_data as Record<string, unknown>;
    assert.deepEqual(user.em, [sha("comprador@exemplo.com")]);
    assert.deepEqual(user.ph, [sha("5531977776666")]);
  });

  test("código de teste do Events Manager vai junto quando configurado", async () => {
    process.env.META_TEST_EVENT_CODE = "TEST12345";
    await service().track("Lead", ctx, { email: "a@b.com" }, "veiculo");
    assert.equal(calls[0].body.test_event_code, "TEST12345");
  });

  test("sem aceite dos cookies (contexto vazio): nenhuma chamada", async () => {
    await service().track("Lead", undefined, { email: "a@b.com" }, "lojas");
    assert.equal(calls.length, 0);
  });

  test("sem ID do pixel ou sem token: desligado, nenhuma chamada", async () => {
    delete process.env.META_PIXEL_ID;
    assert.equal(service().isEnabled(), false);
    await service().track("Lead", ctx, { email: "a@b.com" }, "lojas");
    process.env.META_PIXEL_ID = "123456789012345";
    delete process.env.META_CAPI_TOKEN;
    assert.equal(service().isEnabled(), false);
    await service().track("Lead", ctx, { email: "a@b.com" }, "lojas");
    assert.equal(calls.length, 0);
  });

  test("erro da Meta: não quebra, e o log não traz o token nem dado pessoal", async () => {
    status = 400;
    await assert.doesNotReject(service().track("Lead", ctx, { email: "maria@exemplo.com", phone: "(31) 98888-7777" }, "lojas"));
    assert.equal(calls.length, 1);
    assert.ok(logs.length >= 1);
    const text = logs.join("\n");
    assert.ok(!text.includes(TOKEN), "token apareceu no log");
    assert.ok(!text.includes("maria@exemplo.com"), "e-mail apareceu no log");
    assert.match(text, /HTTP 400/);
  });

  test("Meta lenta: desiste no tempo limite sem travar nem lançar erro", async () => {
    process.env.META_CAPI_TIMEOUT_MS = "100";
    delayMs = 1000;
    const started = Date.now();
    await assert.doesNotReject(service().track("Lead", ctx, { email: "a@b.com" }, "lojas"));
    assert.ok(Date.now() - started < 900);
    assert.ok(!logs.join("\n").includes(TOKEN));
  });

  test("Meta fora do ar: só registra o aviso", async () => {
    process.env.META_GRAPH_URL = "http://127.0.0.1:1";
    await assert.doesNotReject(service().track("Lead", ctx, { email: "a@b.com" }, "lojas"));
    assert.ok(logs.length >= 1);
    assert.ok(!logs.join("\n").includes(TOKEN));
  });
});

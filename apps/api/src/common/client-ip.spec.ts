import { describe, test, after } from "node:test";
import assert from "node:assert/strict";
import { Controller, Get, Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import type { Request } from "express";
import { clientIp, THROTTLER_OPTIONS } from "./client-ip";

// IP do visitante (limites por pessoa e registro do consentimento de
// crédito). Em produção a API fica atrás do Caddy, que grava o IP real em
// X-Forwarded-For (e descarta o que o visitante mandou nesse cabeçalho); o
// site chama a API pelo servidor e repassa o IP do visitante em
// x-client-ip. Esse cabeçalho só vale quando quem chama é um servidor
// nosso (endereço interno) — do contrário qualquer um troca de "IP" a cada
// pedido e passa por cima dos limites.

function req(socket: string, headers: Record<string, string> = {}): Request {
  return { headers, socket: { remoteAddress: socket }, ip: socket } as unknown as Request;
}

describe("clientIp", () => {
  test("visitante pelo Caddy: IP real do X-Forwarded-For", () => {
    assert.equal(clientIp(req("172.18.0.4", { "x-forwarded-for": "203.0.113.7" })), "203.0.113.7");
  });

  test("X-Forwarded-For com vários valores: vale o último (quem o proxy viu)", () => {
    assert.equal(clientIp(req("172.18.0.4", { "x-forwarded-for": "1.1.1.1, 203.0.113.7" })), "203.0.113.7");
  });

  test("visitante pelo Caddy NÃO escolhe o próprio IP com x-client-ip", () => {
    for (let i = 0; i < 5; i++) {
      assert.equal(clientIp(req("172.18.0.4", { "x-forwarded-for": "203.0.113.7", "x-client-ip": `9.9.9.${i}` })), "203.0.113.7");
    }
  });

  test("servidor do site pelo Caddy (rede interna do Docker): vale o x-client-ip", () => {
    assert.equal(clientIp(req("172.18.0.4", { "x-forwarded-for": "172.18.0.1", "x-client-ip": "198.51.100.4" })), "198.51.100.4");
  });

  test("servidor do site direto (sem Caddy): vale o x-client-ip, inclusive IPv6", () => {
    assert.equal(clientIp(req("::ffff:172.18.0.5", { "x-client-ip": "198.51.100.4" })), "198.51.100.4");
    assert.equal(clientIp(req("127.0.0.1", { "x-client-ip": "2001:db8::1" })), "2001:db8::1");
  });

  test("x-client-ip que não é IP é ignorado (texto, script, SQL, lista)", () => {
    for (const bad of ["<script>alert(1)</script>", "' OR 1=1 --", "desconhecido", "1.2.3.4.5", ""]) {
      assert.equal(clientIp(req("172.18.0.5", { "x-client-ip": bad })), "172.18.0.5", bad);
    }
    assert.equal(clientIp(req("172.18.0.5", { "x-client-ip": "198.51.100.4, 9.9.9.9" })), "198.51.100.4");
  });

  test("conexão direta de endereço público: ignora X-Forwarded-For e x-client-ip", () => {
    assert.equal(clientIp(req("203.0.113.9", { "x-forwarded-for": "8.8.8.8", "x-client-ip": "9.9.9.9" })), "203.0.113.9");
  });

  test("endereços internos reconhecidos: 10/8, 172.16/12, 192.168/16, loopback, fc00::/7, fe80::/10", () => {
    for (const internal of ["10.0.0.2", "172.31.255.1", "192.168.1.10", "127.0.0.1", "::1", "fd12::1", "fe80::1", "::ffff:10.1.2.3"]) {
      assert.equal(clientIp(req(internal, { "x-client-ip": "198.51.100.4" })), "198.51.100.4", internal);
    }
    for (const external of ["172.32.0.1", "11.0.0.1", "8.8.8.8", "2001:db8::5"]) {
      assert.equal(clientIp(req(external, { "x-client-ip": "198.51.100.4" })), external, external);
    }
  });

  test("sem endereço nenhum: 'desconhecido'", () => {
    assert.equal(clientIp({ headers: {}, socket: {} } as unknown as Request), "desconhecido");
  });
});

// Limite global (ThrottlerGuard) contado por visitante, não por quem
// repassa: antes a chave era req.ip, que atrás do Caddy é o IP do próprio
// Caddy — todo o site dividia o mesmo limite (120/min, e 5 logins/min).
@Controller("teste-limite")
class LimitController {
  @Get()
  ok() {
    return { ok: true };
  }
}

@Module({
  imports: [ThrottlerModule.forRoot({ ...THROTTLER_OPTIONS, throttlers: [{ name: "default", ttl: 60_000, limit: 2 }] })],
  controllers: [LimitController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class LimitModule {}

describe("Limite global por visitante (ThrottlerGuard)", async () => {
  const app = await NestFactory.create(LimitModule, { logger: false });
  await app.listen(0);
  const base = await app.getUrl();
  after(() => app.close());
  const hit = (headers: Record<string, string>) => fetch(`${base}/teste-limite`, { headers }).then((res) => res.status);

  test("visitantes diferentes atrás do mesmo servidor não dividem o limite", async () => {
    assert.equal(await hit({ "x-client-ip": "198.51.100.1" }), 200);
    assert.equal(await hit({ "x-client-ip": "198.51.100.1" }), 200);
    assert.equal(await hit({ "x-client-ip": "198.51.100.2" }), 200);
    assert.equal(await hit({ "x-client-ip": "198.51.100.3" }), 200);
  });

  test("o mesmo visitante passa do limite e recebe 429", async () => {
    assert.equal(await hit({ "x-client-ip": "198.51.100.1" }), 429);
  });

  test("valores globais do site: 120 por minuto", () => {
    assert.deepEqual(THROTTLER_OPTIONS.throttlers, [{ name: "default", ttl: 60_000, limit: 120 }]);
  });
});

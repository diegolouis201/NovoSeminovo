import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { visitorIpFrom } from "./ip";

// IP do visitante que o servidor do site repassa à API (x-client-ip) para os
// limites por pessoa (apps/api/src/common/client-ip.ts). Vem do
// X-Forwarded-For que o Caddy grava; valor que não é IP não vai.

const from = (headers: Record<string, string>) => visitorIpFrom((name) => headers[name] ?? null);

describe("visitorIpFrom", () => {
  test("primeiro valor do X-Forwarded-For", () => {
    assert.equal(from({ "x-forwarded-for": "203.0.113.7" }), "203.0.113.7");
    assert.equal(from({ "x-forwarded-for": "203.0.113.7, 172.18.0.4" }), "203.0.113.7");
    assert.equal(from({ "x-forwarded-for": "2001:db8::1" }), "2001:db8::1");
  });

  test("sem X-Forwarded-For usa o X-Real-IP", () => {
    assert.equal(from({ "x-real-ip": "198.51.100.9" }), "198.51.100.9");
  });

  test("texto que não é IP não é repassado (cabeçalho, script, SQL)", () => {
    for (const bad of ["<script>alert(1)</script>", "' OR 1=1 --", "abc", "1.2.3.4.5"]) {
      assert.equal(from({ "x-forwarded-for": bad }), undefined, bad);
    }
    assert.equal(from({}), undefined);
  });
});

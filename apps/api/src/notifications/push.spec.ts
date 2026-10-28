import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import type { PrismaService } from "../prisma/prisma.service";
import { apnsJwt, apnsPayload, fcmMessage, PushService } from "./push.service";

describe("Push do app", () => {
  test("JWT da Apple é ES256 válido com a chave .p8", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const jwt = apnsJwt(pem, "KEY123", "TEAM456", 1_700_000_000_000);
    const [header, claims, signature] = jwt.split(".");
    assert.deepEqual(JSON.parse(Buffer.from(header, "base64url").toString()), { alg: "ES256", kid: "KEY123" });
    assert.deepEqual(JSON.parse(Buffer.from(claims, "base64url").toString()), { iss: "TEAM456", iat: 1_700_000_000 });
    const ok = verify("sha256", Buffer.from(`${header}.${claims}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url"));
    assert.equal(ok, true);
  });

  test("mensagens levam título, texto e o link para abrir a tela certa", () => {
    const message = { title: "Nova mensagem", body: "Oi", link: "/conta/mensagens/1" };
    assert.deepEqual(fcmMessage("tok", message).message.data, { link: "/conta/mensagens/1" });
    assert.equal(fcmMessage("tok", message).message.notification.title, "Nova mensagem");
    assert.equal(apnsPayload(message).aps.alert.body, "Oi");
    assert.equal(apnsPayload(message).link, "/conta/mensagens/1");
  });

  test("app desinstalado: o Firebase diz UNREGISTERED e o token é apagado", async () => {
    const deleted: string[] = [];
    const prisma = {
      pushDevice: {
        findMany: async () => [{ token: "token-android-velho", platform: "android" }],
        deleteMany: async ({ where }: { where: { token: string } }) => void deleted.push(where.token),
      },
    } as unknown as PrismaService;
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    process.env.FCM_SERVICE_ACCOUNT = Buffer.from(
      JSON.stringify({ project_id: "ns", client_email: "push@ns.iam", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) }),
    ).toString("base64");
    const realFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      if (String(url).includes("oauth2")) return new Response(JSON.stringify({ access_token: "at", expires_in: 3600 }));
      return new Response(JSON.stringify({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }), { status: 404 });
    }) as typeof fetch;
    try {
      await new PushService(prisma).sendToUser("u1", { title: "Oi", body: "x" });
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.FCM_SERVICE_ACCOUNT;
    }
    assert.ok(calls.some((url) => url.includes("fcm.googleapis.com/v1/projects/ns/messages:send")));
    assert.deepEqual(deleted, ["token-android-velho"]);
  });

  test("sem chaves no servidor, não tenta enviar", async () => {
    let called = false;
    const prisma = { pushDevice: { findMany: async () => [{ token: "t", platform: "ios" }], deleteMany: async () => undefined } } as unknown as PrismaService;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => ((called = true), new Response("{}"))) as typeof fetch;
    try {
      await new PushService(prisma).sendToUser("u1", { title: "Oi", body: "x" });
    } finally {
      globalThis.fetch = realFetch;
    }
    assert.equal(called, false);
  });
});

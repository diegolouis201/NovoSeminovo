import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { socketAllowRequest } from "../common/cors";
import { ConversationsGateway } from "./conversations.gateway";

// Chat ao vivo (Socket.IO): CORS não vale para WebSocket — o navegador abre
// a conexão de qualquer site. A origem é conferida no aperto de mão
// (allowRequest), com a mesma lista exata do CORS (common/cors.ts).

const env = { WEB_ORIGIN: "https://novoseminovo.com.br", NODE_ENV: "production" };

function decide(origin: string | undefined): Promise<boolean> {
  return new Promise((resolve) => {
    socketAllowRequest(env)({ headers: origin === undefined ? {} : { origin } } as never, (_error, allow) => resolve(allow));
  });
}

describe("Socket.IO: origem conferida", () => {
  test("site aceito; outros sites e parecidos recusados", async () => {
    assert.equal(await decide("https://novoseminovo.com.br"), true);
    for (const origin of ["https://golpe.com", "https://novoseminovo.com.br.golpe.com", "http://novoseminovo.com.br", "null"]) {
      assert.equal(await decide(origin), false, origin);
    }
  });

  test("sem Origin (app, servidor) segue igual ao CORS: aceito; o login vem no token", async () => {
    assert.equal(await decide(undefined), true);
  });

  test("gateway usa a conferência de origem", () => {
    const options = Reflect.getMetadata("websockets:gateway_options", ConversationsGateway) as { allowRequest?: unknown };
    assert.equal(typeof options.allowRequest, "function");
  });

  test("entrar na sala com id que não é texto não consulta o banco", async () => {
    let queried = 0;
    const gateway = new ConversationsGateway({} as never, { conversation: { findUnique: async () => (queried++, null) } } as never);
    const client = { data: { userId: "u1" }, join: async () => undefined };
    await gateway.handleJoin(client as never, { conversationId: { $ne: null } } as never);
    await gateway.handleJoin(client as never, { conversationId: "x".repeat(500) } as never);
    assert.equal(queried, 0);
  });
});

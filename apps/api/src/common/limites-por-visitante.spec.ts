import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { ListingContactController } from "../conversations/conversations.controller";
import { SalesCampaignController } from "../sales/sales.controller";
import { NewsletterController } from "../marketing/newsletter.controller";
import { CampaignVisitsController } from "../hub/apresentacao.controller";
import { APRESENTACAO_TARGET } from "@novoseminovo/shared-types";

// Formulários públicos com limite por visitante. Duas falhas que existiam:
// 1) quem chamava a API direto (pelo Caddy) mandava um x-client-ip diferente
//    a cada envio e nunca batia no limite (spam de mensagens para lojas e de
//    leads de campanha);
// 2) a inscrição de novidades lia o X-Forwarded-For, que nas chamadas do
//    servidor do site é o IP do próprio site: 5 inscrições por hora para o
//    site inteiro.

const viaCaddy = (visitor: string, forged: string) =>
  ({ headers: { "x-forwarded-for": visitor, "x-client-ip": forged }, socket: { remoteAddress: "172.18.0.4" } }) as never;
const fromSiteServer = (visitor: string) =>
  ({ headers: { "x-forwarded-for": "172.18.0.1", "x-client-ip": visitor }, socket: { remoteAddress: "172.18.0.4" } }) as never;

const status = (e: unknown) => (e as { status?: number }).status;
const attempt = (fn: () => unknown) => Promise.resolve().then(fn).catch(() => undefined);

describe("Limites por visitante não se contornam trocando o x-client-ip", () => {
  test("mensagem para o anúncio: 9º envio do mesmo visitante = 429", async () => {
    const controller = new ListingContactController({ send: async () => ({ conversationId: "c", leadCreated: true }) } as never);
    const body = { name: "Teste", email: "a@b.com", phone: "31999999999", message: "Olá" };
    for (let i = 0; i < 8; i++) await attempt(() => controller.send(undefined, "l1", body, viaCaddy("203.0.113.50", `9.9.9.${i}`)));
    await assert.rejects(Promise.resolve().then(() => controller.send(undefined, "l1", body, viaCaddy("203.0.113.50", "9.9.9.200"))), (e) => status(e) === 429);
  });

  test("lead de campanha: 6º envio do mesmo visitante = 429", async () => {
    const controller = new SalesCampaignController({ campaignLead: async () => ({ id: "c" }) } as never);
    for (let i = 0; i < 5; i++) await controller.campaignLead({}, viaCaddy("203.0.113.51", `8.8.8.${i}`)).catch(() => undefined);
    await assert.rejects(controller.campaignLead({}, viaCaddy("203.0.113.51", "8.8.8.200")), (e) => status(e) === 429);
  });

  test("abertura da apresentação: x-client-ip forjado não vira contagem nova", async () => {
    let registered = 0;
    const controller = new CampaignVisitsController({ registrar: async () => void registered++ } as never);
    for (let i = 0; i < 40; i++) {
      await attempt(() => controller.registrar({ target: APRESENTACAO_TARGET, campaign: `c${i}` }, viaCaddy("203.0.113.52", `7.7.7.${i}`)));
    }
    assert.ok(registered < 40, `contou ${registered} de 40`);
  });
});

describe("Inscrição de novidades pelo servidor do site", () => {
  test("visitantes diferentes não dividem o limite de 5 por hora", async () => {
    const saved: string[] = [];
    const controller = new NewsletterController({ upsert: async (c: { email: string }) => void saved.push(c.email) } as never);
    for (let i = 0; i < 8; i++) {
      await controller.subscribe(fromSiteServer(`198.51.100.${i + 10}`), { email: `pessoa${i}@exemplo.com`, interest: "geral", consent: true });
    }
    assert.equal(saved.length, 8);
  });

  test("o mesmo visitante passa de 5 por hora e é barrado", async () => {
    const controller = new NewsletterController({ upsert: async () => undefined } as never);
    for (let i = 0; i < 5; i++) await controller.subscribe(fromSiteServer("198.51.100.99"), { email: `x${i}@exemplo.com`, interest: "geral", consent: true });
    await assert.rejects(controller.subscribe(fromSiteServer("198.51.100.99"), { email: "y@exemplo.com", interest: "geral", consent: true }), (e) => status(e) === 400);
  });
});

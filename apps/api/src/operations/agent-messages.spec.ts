import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { agentMessageToUser } from "./tools.service";

// Mensagem que um agente manda a um usuário (dono de anúncio, loja,
// vendedor) sai pelo e-mail oficial do site: não pode levar link, telefone,
// e-mail ou pedido de pagamento — mesmo que um texto malicioso tenha
// convencido o agente a escrever isso.
describe("Mensagens dos agentes para usuários", () => {
  const schema = agentMessageToUser(400);

  test("mensagem de orientação normal passa", () => {
    assert.equal(schema.safeParse("Anúncios com fotos recebem mais contatos; inclua pelo menos 8 fotos no seu anúncio.").success, true);
  });

  test("link, telefone, e-mail e pedido de pagamento são barrados", () => {
    for (const text of [
      "Para manter seu anúncio, acesse www.golpe.shop/pagar e confirme seus dados.",
      "Seu anúncio será suspenso: ligue 31 99999-8888 para regularizar agora.",
      "Responda para suporte@golpe.com com seus dados bancários urgentemente.",
      "Para não perder o destaque, faça um Pix de R$ 50 para a chave 123.456.789-00.",
    ]) {
      assert.equal(schema.safeParse(text).success, false, text);
    }
  });
});

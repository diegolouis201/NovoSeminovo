import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { caixaImapConfig, etiquetasAquecimento } from "./caixa-entrada";
import { caixaSmtpConfig, prospeccaoSmtpConfig, semSenha, statusCaixaEmail } from "./smtp";

// Várias caixas de e-mail da prospecção (lista fixa no código): cada uma
// com a sua configuração no .env e a senha num arquivo próprio.

function segredo(nome: string, valor: string) {
  const dir = mkdtempSync(join(tmpdir(), "caixa-"));
  const arq = join(dir, nome);
  writeFileSync(arq, `${valor}\n`);
  chmodSync(arq, 0o600);
  return { arq, limpar: () => rmSync(dir, { recursive: true, force: true }) };
}

describe("Caixas de e-mail da prospecção", () => {
  test("atendimento@: lê PROSPECCAO_ATENDIMENTO_* e a senha de secrets/prospeccao_atendimento_smtp_password", () => {
    const s = segredo("prospeccao_atendimento_smtp_password", "senha-atendimento");
    const env = {
      NODE_ENV: "production",
      PROSPECCAO_ATENDIMENTO_SMTP_HOST: "email-ssl.com.br",
      PROSPECCAO_ATENDIMENTO_SMTP_USER: "atendimento@novoseminovo.com.br",
      PROSPECCAO_ATENDIMENTO_SMTP_PASSWORD_FILE: s.arq,
      PROSPECCAO_ATENDIMENTO_FROM_NAME: "Caio | NovoSeminovo",
      PROSPECCAO_ATENDIMENTO_IMAP_PORT: "993",
    };
    const c = caixaSmtpConfig("atendimento", env);
    assert.equal(c?.caixa, "atendimento");
    assert.equal(c?.host, "email-ssl.com.br");
    assert.equal(c?.port, 465);
    assert.equal(c?.secure, true);
    assert.equal(c?.password, "senha-atendimento");
    assert.equal(c?.fromName, "Caio | NovoSeminovo");
    assert.deepEqual(statusCaixaEmail("atendimento", env), { chave: "atendimento", endereco: "atendimento@novoseminovo.com.br", configurada: true, leitura: true });
    const imap = caixaImapConfig("atendimento", env);
    assert.equal(imap?.host, "email-ssl.com.br", "IMAP usa o host do SMTP quando não tem o próprio");
    assert.equal(imap?.port, 993);
    assert.equal(imap?.user, "atendimento@novoseminovo.com.br");
    // A configuração de uma caixa não vaza para a outra.
    assert.equal(caixaSmtpConfig("prospeccao", env), undefined);
    assert.equal(prospeccaoSmtpConfig(env), undefined);
    s.limpar();
  });

  test("contato@ continua com os nomes antigos (PROSPECCAO_SMTP_*, secrets/prospeccao_smtp_password)", () => {
    const s = segredo("prospeccao_smtp_password", "senha-contato");
    const env = { NODE_ENV: "production", PROSPECCAO_SMTP_HOST: "email-ssl.com.br", PROSPECCAO_SMTP_USER: "contato@novoseminovo.com.br", PROSPECCAO_SMTP_PASSWORD_FILE: s.arq };
    assert.equal(caixaSmtpConfig("prospeccao", env)?.password, "senha-contato");
    assert.equal(caixaSmtpConfig("prospeccao", env)?.fromName, "Diego | NovoSeminovo");
    assert.equal(caixaSmtpConfig("atendimento", env), undefined, "senha do contato@ não serve para o atendimento@");
    assert.equal(statusCaixaEmail("prospeccao", env).configurada, true);
    s.limpar();
  });

  test("caixa sem configuração completa: \"não configurada\" com o motivo (sem mostrar senha)", () => {
    const base = { NODE_ENV: "production" };
    let st = statusCaixaEmail("atendimento", base);
    assert.equal(st.configurada, false);
    assert.match(st.motivo ?? "", /PROSPECCAO_ATENDIMENTO_SMTP_HOST/);
    st = statusCaixaEmail("atendimento", { ...base, PROSPECCAO_ATENDIMENTO_SMTP_HOST: "h", PROSPECCAO_ATENDIMENTO_SMTP_USER: "atendimento@novoseminovo.com.br", PROSPECCAO_ATENDIMENTO_SMTP_PASSWORD_FILE: "/nao/existe" });
    assert.equal(st.configurada, false);
    assert.match(st.motivo ?? "", /secrets\/prospeccao_atendimento_smtp_password/);
    const s = segredo("p", "senha-ok");
    st = statusCaixaEmail("atendimento", { ...base, PROSPECCAO_ATENDIMENTO_SMTP_HOST: "h", PROSPECCAO_ATENDIMENTO_SMTP_USER: "contato@novoseminovo.com.br", PROSPECCAO_ATENDIMENTO_SMTP_PASSWORD_FILE: s.arq });
    assert.equal(st.configurada, false, "usuário de outra caixa não vale");
    assert.match(st.motivo ?? "", /atendimento@novoseminovo\.com\.br/);
    st = statusCaixaEmail("atendimento", { ...base, PROSPECCAO_ATENDIMENTO_SMTP_HOST: "h", PROSPECCAO_ATENDIMENTO_SMTP_USER: "atendimento@novoseminovo.com.br", PROSPECCAO_ATENDIMENTO_SMTP_PORT: "99999", PROSPECCAO_ATENDIMENTO_SMTP_PASSWORD_FILE: s.arq });
    assert.equal(st.configurada, false);
    assert.match(st.motivo ?? "", /porta/i);
    assert.ok(!JSON.stringify(st).includes("senha-ok"));
    s.limpar();
  });

  test("caixa fora da lista fixa não existe", () => {
    assert.equal(caixaSmtpConfig("vendas" as never, { PROSPECCAO_VENDAS_SMTP_HOST: "h", PROSPECCAO_VENDAS_SMTP_USER: "u@x.com", PROSPECCAO_VENDAS_SMTP_PASSWORD: "abcdef" }), undefined);
  });

  test("aquecimento: etiquetas gerais + as da caixa", () => {
    const env = { PROSPECCAO_WARMUP_TAGS: "geral1", PROSPECCAO_ATENDIMENTO_WARMUP_TAGS: "at1, at2" };
    assert.deepEqual(etiquetasAquecimento("prospeccao", env), ["geral1"]);
    assert.deepEqual(etiquetasAquecimento("atendimento", env), ["geral1", "at1", "at2"]);
  });

  test("erro do SMTP nunca leva a senha (nem em base64)", () => {
    const s = segredo("x", "s3nh4-secreta");
    const c = caixaSmtpConfig("atendimento", { PROSPECCAO_ATENDIMENTO_SMTP_HOST: "h", PROSPECCAO_ATENDIMENTO_SMTP_USER: "atendimento@novoseminovo.com.br", PROSPECCAO_ATENDIMENTO_SMTP_PASSWORD_FILE: s.arq })!;
    const b64 = Buffer.from(`\u0000${c.user}\u0000${c.password}`).toString("base64");
    const t = semSenha(`535 falhou s3nh4-secreta AUTH PLAIN ${b64}`, c);
    assert.ok(!t.includes("s3nh4-secreta") && !t.includes(b64));
    s.limpar();
  });
});

import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { FONTE_MAX_BYTES, lerEmail, prospeccaoImapConfig } from "./caixa-entrada";

// Leitura do contato@ por IMAP: mesma senha do SMTP (arquivo), host padrão
// = o do SMTP, porta 993; e-mail cru vira texto sem anexos.

describe("Configuração do IMAP", () => {
  test("sem SMTP configurado: desligado", () => assert.equal(prospeccaoImapConfig({}), undefined));
  test("host padrão = SMTP, porta 993, senha do arquivo; host e porta próprios quando informados", () => {
    const dir = mkdtempSync(join(tmpdir(), "imap-"));
    const arq = join(dir, "prospeccao_smtp_password");
    writeFileSync(arq, "senha-do-arquivo");
    chmodSync(arq, 0o600);
    const base = { PROSPECCAO_SMTP_HOST: "email-ssl.com.br", PROSPECCAO_SMTP_USER: "contato@novoseminovo.com.br", PROSPECCAO_SMTP_PASSWORD_FILE: arq, NODE_ENV: "production" };
    assert.deepEqual(prospeccaoImapConfig(base), { host: "email-ssl.com.br", port: 993, user: "contato@novoseminovo.com.br", password: "senha-do-arquivo", inseguro: false });
    const c = prospeccaoImapConfig({ ...base, PROSPECCAO_IMAP_HOST: "imap.exemplo.com", PROSPECCAO_IMAP_PORT: "1993" });
    assert.equal(c?.host, "imap.exemplo.com");
    assert.equal(c?.port, 1993);
    assert.equal(prospeccaoImapConfig({ ...base, PROSPECCAO_IMAP_PORT: "99999" }), undefined);
    rmSync(dir, { recursive: true, force: true });
  });
});

test("lê o e-mail: HTML vira texto, anexo fica de fora, cabeçalhos de conversa", async () => {
  const fonte = [
    "From: =?UTF-8?Q?Jo=C3=A3o?= <JOAO@Loja.com.br>",
    "Subject: =?UTF-8?Q?Re:_Estoque_da_Loja_Jo=C3=A3o?=",
    "Message-ID: <abc@loja.com.br>",
    "In-Reply-To: <prospeccao.e1.1.aa@novoseminovo.com.br>",
    "References: <x@y> <prospeccao.e1.1.aa@novoseminovo.com.br>",
    "Auto-Submitted: no",
    'Content-Type: multipart/mixed; boundary="B"',
    "",
    "--B",
    "Content-Type: text/html; charset=utf-8",
    "",
    "<p>Tenho <b>interesse</b><script>alert(1)</script></p>",
    "--B",
    'Content-Type: application/octet-stream; name="virus.exe"',
    "Content-Transfer-Encoding: base64",
    "",
    "TVqQAAMAAAAEAAAA",
    "--B--",
  ].join("\r\n");
  const e = await lerEmail(Buffer.from(fonte));
  assert.equal(e.de, "joao@loja.com.br");
  assert.equal(e.assunto, "Re: Estoque da Loja João");
  assert.equal(e.messageId, "<abc@loja.com.br>");
  assert.equal(e.inReplyTo, "<prospeccao.e1.1.aa@novoseminovo.com.br>");
  assert.deepEqual(e.referencias, ["<x@y>", "<prospeccao.e1.1.aa@novoseminovo.com.br>"]);
  assert.match(e.texto, /Tenho interesse/);
  assert.ok(!/virus|TVqQ|<script>/.test(e.texto));
  assert.equal(e.cabecalhos["auto-submitted"], "no");
  assert.ok(FONTE_MAX_BYTES <= 512 * 1024);
});

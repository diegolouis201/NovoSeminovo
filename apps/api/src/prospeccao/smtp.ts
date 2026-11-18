import { createTransport, type Transporter } from "nodemailer";
import { readSecret } from "../auth/secret-file";

// SMTP da prospecção (contato@novoseminovo.com.br, Locaweb), SEPARADO do
// e-mail transacional do site (Resend, EmailService). Host/porta/usuário no
// .env; a senha só do arquivo secrets/prospeccao_smtp_password (readSecret)
// e nunca aparece em log, erro gravado ou resposta da API.

type Env = Record<string, string | undefined>;
export type SmtpConfig = { host: string; port: number; secure: boolean; user: string; password: string; fromName: string; inseguro: boolean };

const COMO = 'salve a senha do e-mail em secrets/prospeccao_smtp_password (ver DEPLOY.md, "Prospecção pelo CRM")';

export function prospeccaoSmtpConfig(env: Env = process.env, reader?: (path: string) => string): SmtpConfig | undefined {
  const host = env.PROSPECCAO_SMTP_HOST?.trim();
  const user = env.PROSPECCAO_SMTP_USER?.trim();
  if (!host || !user) return undefined;
  let password: string;
  try {
    password = readSecret("PROSPECCAO_SMTP_PASSWORD", env, reader, { minLength: 4, howTo: COMO });
  } catch {
    return undefined;
  }
  const port = Number(env.PROSPECCAO_SMTP_PORT || 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return undefined;
  return {
    host,
    port,
    secure: port === 465,
    user,
    password,
    fromName: (env.PROSPECCAO_FROM_NAME || "Diego | NovoSeminovo").replace(/["\r\n]/g, "").slice(0, 80),
    // Só para o SMTP falso dos testes; em produção sempre exige TLS.
    inseguro: env.PROSPECCAO_SMTP_INSECURE === "1" && env.NODE_ENV !== "production",
  };
}

// Tira a senha (e o usuário:senha em base64) de qualquer texto de erro.
export function semSenha(texto: string, cfg: SmtpConfig | undefined): string {
  if (!cfg) return texto;
  let t = texto;
  const segredos = [cfg.password, Buffer.from(`\u0000${cfg.user}\u0000${cfg.password}`).toString("base64"), Buffer.from(cfg.password).toString("base64")];
  for (const s of segredos) if (s) t = t.split(s).join("***");
  return t;
}

export type MensagemProspeccao = {
  para: string;
  assunto: string;
  texto: string;
  html: string;
  messageId: string;
  inReplyTo?: string;
  cabecalhos: Record<string, string>;
};
export type EnviarProspeccao = (m: MensagemProspeccao) => Promise<{ messageId: string }>;

export function criarEnvio(cfg: SmtpConfig): EnviarProspeccao {
  const transporte: Transporter = createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    requireTLS: !cfg.secure && !cfg.inseguro,
    ignoreTLS: cfg.inseguro,
    auth: { user: cfg.user, pass: cfg.password },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000,
    logger: false,
    debug: false,
  });
  return async (m) => {
    const info = await transporte.sendMail({
      from: { name: cfg.fromName, address: cfg.user },
      to: m.para,
      replyTo: cfg.user,
      subject: m.assunto,
      text: m.texto,
      html: m.html,
      messageId: m.messageId,
      inReplyTo: m.inReplyTo,
      references: m.inReplyTo ? [m.inReplyTo] : undefined,
      headers: m.cabecalhos,
    });
    transporte.close();
    return { messageId: info.messageId ?? m.messageId };
  };
}

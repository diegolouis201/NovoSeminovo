import { createTransport, type Transporter } from "nodemailer";
import { CAIXAS_EMAIL, type CaixaStatus, type VendedorCaixa } from "@novoseminovo/shared-types";
import { readSecret } from "../auth/secret-file";

// SMTP da prospecção, SEPARADO do e-mail transacional do site (Resend,
// EmailService). Várias caixas (lista fixa CAIXAS_EMAIL): cada uma com
// host/porta/usuário/nome no .env (prefixo abaixo) e a senha só no arquivo
// secrets/<prefixo em minúsculas>_smtp_password (readSecret). A senha nunca
// aparece em log, erro gravado ou resposta da API.
//   prospeccao  → contato@     PROSPECCAO_SMTP_*, PROSPECCAO_FROM_NAME, PROSPECCAO_IMAP_*
//   atendimento → atendimento@ PROSPECCAO_ATENDIMENTO_SMTP_*, ..._FROM_NAME, ..._IMAP_*

type Env = Record<string, string | undefined>;
export type SmtpConfig = { caixa: VendedorCaixa; host: string; port: number; secure: boolean; user: string; password: string; fromName: string; inseguro: boolean };

export const CAIXA_PREFIXO: Record<VendedorCaixa, string> = { prospeccao: "PROSPECCAO", atendimento: "PROSPECCAO_ATENDIMENTO" };
const NOME_PADRAO: Record<VendedorCaixa, string> = { prospeccao: "Diego | NovoSeminovo", atendimento: "NovoSeminovo" };
export const caixaConhecida = (chave: string): chave is VendedorCaixa => Object.prototype.hasOwnProperty.call(CAIXAS_EMAIL, chave);
export const arquivoSenha = (chave: VendedorCaixa) => `secrets/${CAIXA_PREFIXO[chave].toLowerCase()}_smtp_password`;

type Leitura = { cfg?: SmtpConfig; motivo?: string };

function lerCaixa(chave: VendedorCaixa, env: Env, reader?: (path: string) => string): Leitura {
  const pre = CAIXA_PREFIXO[chave];
  const host = env[`${pre}_SMTP_HOST`]?.trim();
  const user = env[`${pre}_SMTP_USER`]?.trim().toLowerCase();
  if (!host) return { motivo: `falta ${pre}_SMTP_HOST no .env` };
  if (!user) return { motivo: `falta ${pre}_SMTP_USER no .env` };
  // A "prospeccao" é anterior à lista fixa (aceita o usuário que já estava);
  // as outras só com o endereço da própria caixa.
  if (chave !== "prospeccao" && user !== CAIXAS_EMAIL[chave].endereco) return { motivo: `${pre}_SMTP_USER deve ser ${CAIXAS_EMAIL[chave].endereco}` };
  const port = Number(env[`${pre}_SMTP_PORT`] || 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { motivo: `porta inválida em ${pre}_SMTP_PORT` };
  let password: string;
  try {
    password = readSecret(`${pre}_SMTP_PASSWORD`, env, reader, { minLength: 4, howTo: `salve a senha em ${arquivoSenha(chave)} (ver DEPLOY.md)` });
  } catch {
    return { motivo: `senha não encontrada em ${arquivoSenha(chave)} (ou o arquivo não está com chmod 600)` };
  }
  const nome = (chave === "prospeccao" ? env.PROSPECCAO_FROM_NAME : env[`${pre}_FROM_NAME`]) || NOME_PADRAO[chave];
  return {
    cfg: {
      caixa: chave,
      host,
      port,
      secure: port === 465,
      user,
      password,
      fromName: nome.replace(/["\r\n]/g, "").slice(0, 80),
      // Só para o SMTP falso dos testes; em produção sempre exige TLS.
      inseguro: env.PROSPECCAO_SMTP_INSECURE === "1" && env.NODE_ENV !== "production",
    },
  };
}

export function caixaSmtpConfig(chave: VendedorCaixa, env: Env = process.env, reader?: (path: string) => string): SmtpConfig | undefined {
  if (!caixaConhecida(chave)) return undefined;
  return lerCaixa(chave, env, reader).cfg;
}

// A caixa "prospeccao" (contato@), nomes antigos.
export function prospeccaoSmtpConfig(env: Env = process.env, reader?: (path: string) => string): SmtpConfig | undefined {
  return caixaSmtpConfig("prospeccao", env, reader);
}

// Nome de remetente definido no .env para a caixa (PROSPECCAO_FROM_NAME no
// contato@, PROSPECCAO_<CHAVE>_FROM_NAME nas outras). Sem ele: o nome do vendedor.
export function nomeRemetente(chave: VendedorCaixa, env: Env = process.env): string | undefined {
  const v = (chave === "prospeccao" ? env.PROSPECCAO_FROM_NAME : env[`${CAIXA_PREFIXO[chave]}_FROM_NAME`])?.replace(/["\r\n]/g, "").trim();
  return v ? v.slice(0, 80) : undefined;
}

// Situação da caixa para o Hub: configurada ou o motivo (nunca a senha).
export function statusCaixaEmail(chave: VendedorCaixa, env: Env = process.env, reader?: (path: string) => string): Omit<CaixaStatus, "vendedorAtivo"> {
  const { cfg, motivo } = lerCaixa(chave, env, reader);
  const porta = Number(env[`${CAIXA_PREFIXO[chave]}_IMAP_PORT`] || 993);
  const leitura = Boolean(cfg) && Number.isInteger(porta) && porta >= 1 && porta <= 65535;
  return { chave, endereco: CAIXAS_EMAIL[chave].endereco, configurada: Boolean(cfg), ...(motivo ? { motivo } : {}), leitura };
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
  // Respostas: a cadeia inteira do assunto (References), para cair na mesma conversa.
  referencias?: string[];
  // Nome do remetente (vendedor IA: "Nina | NovoSeminovo"); sem ele, o nome da caixa.
  deNome?: string;
  // Caixa que manda (o endereço sai da configuração dela).
  caixa: VendedorCaixa;
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
      from: { name: (m.deNome ?? cfg.fromName).replace(/["\r\n]/g, "").slice(0, 80), address: cfg.user },
      to: m.para,
      replyTo: cfg.user,
      subject: m.assunto,
      text: m.texto,
      html: m.html,
      messageId: m.messageId,
      inReplyTo: m.inReplyTo,
      references: m.referencias?.length ? m.referencias : m.inReplyTo ? [m.inReplyTo] : undefined,
      headers: m.cabecalhos,
    });
    transporte.close();
    return { messageId: info.messageId ?? m.messageId };
  };
}

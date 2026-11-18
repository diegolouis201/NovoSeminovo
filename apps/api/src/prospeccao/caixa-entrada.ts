import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import { prospeccaoSmtpConfig, semSenha } from "./smtp";

// Leitura das respostas que chegam no contato@ (IMAP). Interface pequena
// (CaixaEntrada) para os testes usarem uma caixa falsa sem servidor.
// Segurança:
// - só leitura com BODY.PEEK (não marca como lida: o Diego continua vendo
//   tudo no webmail);
// - cada e-mail lido no máximo até 512 KB; anexo nunca é aberto nem
//   guardado (só o texto vai adiante);
// - a senha é a mesma do SMTP (secrets/prospeccao_smtp_password, readSecret)
//   e nunca aparece em log.

type Env = Record<string, string | undefined>;
export type ImapConfig = { host: string; port: number; user: string; password: string; inseguro: boolean };

export const FONTE_MAX_BYTES = 512 * 1024;

export function prospeccaoImapConfig(env: Env = process.env, reader?: (path: string) => string): ImapConfig | undefined {
  const smtp = prospeccaoSmtpConfig(env, reader);
  if (!smtp) return undefined;
  const host = env.PROSPECCAO_IMAP_HOST?.trim() || smtp.host;
  const port = Number(env.PROSPECCAO_IMAP_PORT || 993);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return undefined;
  return { host, port, user: smtp.user, password: smtp.password, inseguro: smtp.inseguro };
}

export type EmailBruto = { uid: number; fonte: Buffer };
export type LoteCaixa = { uidValidity: string; emails: EmailBruto[]; maiorUid: number };

export interface CaixaEntrada {
  // E-mails com UID maior que desdeUid (ou, sem UID, chegados desde a data).
  novas(desde: { uid?: number; uidValidity?: string; data: Date }, limite: number): Promise<LoteCaixa>;
}

export function caixaImap(cfg: ImapConfig): CaixaEntrada {
  return {
    async novas(desde, limite) {
      const cliente = new ImapFlow({
        host: cfg.host,
        port: cfg.port,
        secure: !cfg.inseguro,
        auth: { user: cfg.user, pass: cfg.password },
        logger: false,
        connectionTimeout: 20_000,
        greetingTimeout: 20_000,
        socketTimeout: 60_000,
        tls: { rejectUnauthorized: !cfg.inseguro },
      });
      try {
        await cliente.connect();
        const trava = await cliente.getMailboxLock("INBOX", { readOnly: true });
        try {
          const caixa = cliente.mailbox;
          const uidValidity = caixa && typeof caixa !== "boolean" ? String(caixa.uidValidity) : "";
          const mesmaCaixa = desde.uidValidity && desde.uidValidity === uidValidity && desde.uid;
          const uids = ((await cliente.search(mesmaCaixa ? { uid: `${desde.uid! + 1}:*` } : { since: desde.data }, { uid: true })) || []).filter((u) => !mesmaCaixa || u > desde.uid!);
          uids.sort((a, b) => a - b);
          const escolhidos = uids.slice(0, limite);
          const emails: EmailBruto[] = [];
          if (escolhidos.length) {
            for await (const m of cliente.fetch(escolhidos.join(","), { uid: true, source: { start: 0, maxLength: FONTE_MAX_BYTES } }, { uid: true })) {
              if (m.source) emails.push({ uid: m.uid, fonte: Buffer.from(m.source) });
            }
          }
          return { uidValidity, emails, maiorUid: escolhidos.length ? escolhidos[escolhidos.length - 1]! : (desde.uid ?? 0) };
        } finally {
          trava.release();
        }
      } catch (error) {
        throw new Error(semSenha(error instanceof Error ? error.message : String(error), { password: cfg.password, user: cfg.user } as never).slice(0, 300));
      } finally {
        await cliente.logout().catch(() => undefined);
      }
    },
  };
}

export type EmailLido = {
  messageId?: string;
  inReplyTo?: string;
  referencias: string[];
  de: string;
  assunto: string;
  texto: string;
  cabecalhos: Record<string, string>;
  data?: Date;
  // Devolução (bounce): ids dos nossos e-mails citados no relatório e o
  // endereço que falhou (Final-Recipient).
  idsNossosCitados: string[];
  destinatarioFalhou?: string;
};

// E-mail só com HTML: vira texto puro (sem script/estilo, sem tag nenhuma).
export function htmlParaTexto(html: string): string {
  return html
    .slice(0, 200_000)
    .replace(/<(script|style|head)[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const ID = /<[^<>\s]{3,250}>/g;
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.join(" ") : String(v ?? "")).match(ID) ?? [];

// Lê o e-mail cru: cabeçalhos em texto, remetente, assunto e o texto (o HTML
// vira texto; anexos ficam de fora).
export async function lerEmail(fonte: Buffer): Promise<EmailLido> {
  const p = await simpleParser(fonte.subarray(0, FONTE_MAX_BYTES), { skipHtmlToText: false, skipImageLinks: true, skipTextLinks: true, skipTextToHtml: true, maxHtmlLengthToParse: 200_000 });
  const cabecalhos: Record<string, string> = {};
  for (const linha of p.headerLines ?? []) {
    const k = linha.key.toLowerCase();
    if (cabecalhos[k] || Object.keys(cabecalhos).length > 80) continue;
    cabecalhos[k] = linha.line.slice(linha.key.length + 1).trim().slice(0, 500);
  }
  const cru = fonte.subarray(0, FONTE_MAX_BYTES).toString("latin1");
  const de = ((p.from as AddressObject | undefined)?.value?.[0]?.address ?? "").toLowerCase().slice(0, 200);
  return {
    messageId: ids(p.messageId)[0],
    inReplyTo: ids(p.inReplyTo)[0],
    referencias: ids(p.references).slice(-20),
    de,
    assunto: (p.subject ?? "").replace(/[\r\n]+/g, " ").slice(0, 300),
    texto: (p.text?.trim() ? p.text : htmlParaTexto(typeof p.html === "string" ? p.html : "")).slice(0, 20_000),
    cabecalhos,
    data: p.date,
    idsNossosCitados: [...new Set(cru.match(/<(?:prospeccao|resposta)\.[A-Za-z0-9._-]{1,120}@novoseminovo\.com\.br>/g) ?? [])].slice(0, 5),
    destinatarioFalhou: cru.match(/^(?:Final|Original)-Recipient:\s*rfc822;\s*<?([^\s<>;]{3,200}@[^\s<>;]{3,200})>?/im)?.[1]?.toLowerCase(),
  };
}

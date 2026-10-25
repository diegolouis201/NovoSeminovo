import { webOrigin } from "./links";

// Modelo dos e-mails de marketing (campanhas e sequências). Texto do agente ou
// do admin nunca entra como HTML: é escapado, linha em branco vira parágrafo.
// Todo e-mail leva o motivo do envio e o link de descadastro (LGPD).

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// {{nome}} vira o primeiro nome do contato (ou some, sem deixar "Olá, ,").
export function personalize(text: string, name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return first
    ? text.replace(/\{\{\s*nome\s*\}\}/gi, first)
    : text.replace(/,?\s*\{\{\s*nome\s*\}\}/gi, "").replace(/^\s*[,!]\s*/gm, "");
}

export const SEND_REASON: Record<string, string> = {
  opt_in: "Você recebe este e-mail porque pediu para receber novidades do NovoSeminovo.",
  legitimate_interest: "Você recebe este e-mail porque é cliente ou pediu contato ao NovoSeminovo.",
};

export function renderMarketingEmail(params: {
  subject: string;
  preheader?: string | null;
  body: string;
  name?: string | null;
  ctaLabel?: string | null;
  ctaHref?: string;
  unsubscribeUrl: string;
  consent: string;
}): { html: string; text: string; subject: string } {
  const subject = personalize(params.subject, params.name);
  const body = personalize(params.body, params.name);
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p style="font-size:15px;line-height:1.6;color:#333;margin:0 0 16px;">${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const reason = SEND_REASON[params.consent] ?? SEND_REASON.opt_in;
  const cta =
    params.ctaHref && params.ctaLabel
      ? `<p style="margin:24px 0;"><a href="${escapeHtml(params.ctaHref)}" style="display:inline-block;padding:12px 24px;background:#76b82a;color:#ffffff;text-decoration:none;border-radius:999px;font-size:15px;font-weight:700;">${escapeHtml(params.ctaLabel)}</a></p>`
      : "";
  const preheader = params.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(personalize(params.preheader, params.name))}</div>`
    : "";
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f6f8;">${preheader}
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
  <div style="background:#ffffff;border-radius:16px;padding:28px;">
    <img src="${webOrigin()}/marca/novoseminovo-logo.png" alt="NovoSeminovo" width="140" style="display:block;margin:0 0 20px;">
    ${paragraphs}
    ${cta}
  </div>
  <p style="font-size:12px;line-height:1.5;color:#888;margin:16px 8px 0;">${escapeHtml(reason)}<br>
  Não quer mais receber? <a href="${escapeHtml(params.unsubscribeUrl)}" style="color:#888;">Descadastrar com um clique</a>.<br>
  NovoSeminovo · novoseminovo.com.br</p>
</div></body></html>`;
  const text = [
    body,
    params.ctaHref && params.ctaLabel ? `${params.ctaLabel}: ${params.ctaHref}` : "",
    "--",
    reason,
    `Descadastrar: ${params.unsubscribeUrl}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { html, text, subject };
}

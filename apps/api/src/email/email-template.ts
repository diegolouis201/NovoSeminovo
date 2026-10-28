// HTML mínimo (sem CSS externo — a maioria dos clientes de e-mail ignora
// <style> em bloco) reaproveitando as mesmas cores do design system do
// site. Link vira absoluto aqui porque fora do navegador não tem como
// resolver um caminho relativo.
// Texto vindo de usuário ou de agente de IA (título de anúncio, resumo do
// dia) nunca entra como HTML; quebras de linha viram <br>.
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Logo oficial (public/marca no site), servido pelo próprio domínio.
export const LOGO_PATH = "/marca/novoseminovo-logo-recortado.png";

export function renderNotificationEmail(params: {
  userName: string;
  title: string;
  body: string;
  link?: string;
  linkLabel?: string;
  code?: string;
  // HTML já montado e escapado por quem chama (ex.: email/daily-report.ts).
  sectionsHtml?: string;
}): string {
  const userName = escapeHtml(params.userName);
  const title = escapeHtml(params.title);
  const body = escapeHtml(params.body).replace(/\n/g, "<br>");
  const link = params.link;
  const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
  const absoluteLink = link ? `${webOrigin}${link}` : undefined;

  // Mesmo visual dos e-mails de marketing (marketing/email-render.ts): logo
  // da marca no topo, cartão branco e rodapé com o site.
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f6f8;">
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
  <div style="background: #ffffff; border-radius: 16px; padding: 28px; border-top: 6px solid #006aa4;">
    <img src="${webOrigin}${LOGO_PATH}" alt="NovoSeminovo" width="120" style="display: block; margin: 0 0 20px; border: 0;">
    <p style="margin: 0 0 16px; color: #666; font-size: 14px;">Olá, ${userName}</p>
    <h1 style="font-size: 20px; margin: 0 0 12px; color: #0e2f4a;">${title}</h1>
    <p style="font-size: 15px; line-height: 1.6; color: #333; margin: 0 0 20px;">${body}</p>
    ${params.sectionsHtml ? `<div style="margin: 0 0 24px;">${params.sectionsHtml}</div>` : ""}
    ${
      params.code
        ? `<p style="font-size: 28px; font-weight: 700; letter-spacing: 6px; margin: 0 0 20px; color: #1a1a1a;">${escapeHtml(params.code)}</p>`
        : ""
    }
    ${
      absoluteLink
        ? `<a href="${absoluteLink}" style="display: inline-block; padding: 12px 24px; background: #76b82a; color: #ffffff; text-decoration: none; border-radius: 999px; font-size: 15px; font-weight: 700;">${escapeHtml(params.linkLabel ?? "Ver no NovoSeminovo")}</a>`
        : ""
    }
  </div>
  <p style="font-size: 12px; line-height: 1.5; color: #888; margin: 16px 8px 0;">Você recebeu este e-mail porque tem uma conta no NovoSeminovo.<br>
  <a href="${webOrigin}" style="color: #006aa4; text-decoration: none;">NovoSeminovo</a> · carros e imóveis, sem enrolação.</p>
</div></body></html>`;
}

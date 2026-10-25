// HTML mínimo (sem CSS externo — a maioria dos clientes de e-mail ignora
// <style> em bloco) reaproveitando as mesmas cores do design system do
// site. Link vira absoluto aqui porque fora do navegador não tem como
// resolver um caminho relativo.
// Texto vindo de usuário ou de agente de IA (título de anúncio, resumo do
// dia) nunca entra como HTML; quebras de linha viram <br>.
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderNotificationEmail(params: { userName: string; title: string; body: string; link?: string }): string {
  const userName = escapeHtml(params.userName);
  const title = escapeHtml(params.title);
  const body = escapeHtml(params.body).replace(/\n/g, "<br>");
  const link = params.link;
  const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
  const absoluteLink = link ? `${webOrigin}${link}` : undefined;

  return `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
      <p style="font-size: 20px; font-weight: 700; margin: 0 0 4px;">NovoSeminovo</p>
      <p style="margin: 0 0 20px; color: #666;">Olá, ${userName}</p>
      <h1 style="font-size: 18px; margin: 0 0 8px;">${title}</h1>
      <p style="font-size: 14px; line-height: 1.5; color: #333; margin: 0 0 20px;">${body}</p>
      ${
        absoluteLink
          ? `<a href="${absoluteLink}" style="display: inline-block; padding: 10px 20px; background: #76b82a; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 700;">Ver no NovoSeminovo</a>`
          : ""
      }
      <p style="margin-top: 32px; font-size: 12px; color: #999;">Você recebeu este e-mail porque tem uma conta no NovoSeminovo.</p>
    </div>
  `;
}

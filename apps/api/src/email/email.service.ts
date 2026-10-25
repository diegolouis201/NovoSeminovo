import { Injectable, Logger } from "@nestjs/common";

// E-mail é opcional (ver README "Próximos passos"): sem RESEND_API_KEY,
// isEnabled() devolve false e quem chama (NotificationsService,
// SavedSearchesService) simplesmente não manda e-mail nenhum — a
// notificação dentro do site continua funcionando normalmente, do mesmo
// jeito que o resto do projeto cai pra um modo mais simples sem a chave de
// um provedor externo (ver PhotoStorage, PaymentsService).
//
// Usa a API HTTP do Resend direto via fetch, sem SDK: é uma única chamada
// POST, não compensa a dependência extra. Resend foi o provedor escolhido
// por não exigir domínio verificado pra mandar pro próprio e-mail da conta
// (via remetente compartilhado onboarding@resend.dev) — bom o bastante pra
// um ambiente de teste.
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  isEnabled(): boolean {
    return Boolean(process.env.RESEND_API_KEY);
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.isEnabled()) return;

    const apiKey = process.env.RESEND_API_KEY as string;
    const from = process.env.EMAIL_FROM ?? "NovoSeminovo <onboarding@resend.dev>";

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ from, to, subject, html }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        this.logger.warn(`Falha ao enviar e-mail pra ${to}: ${res.status} ${body}`);
      }
    } catch (error) {
      // Nunca derruba quem chamou por causa de um provedor de e-mail fora
      // do ar — a notificação dentro do site já foi gravada antes disso.
      this.logger.warn(`Falha ao enviar e-mail pra ${to}: ${error}`);
    }
  }

  // E-mail de marketing: devolve o id do Resend (para casar com o webhook) e
  // lança erro em vez de engolir, para o envio ficar registrado como falha.
  async sendMarketing(message: {
    to: string;
    subject: string;
    html: string;
    text: string;
    headers?: Record<string, string>;
    replyTo?: string;
  }): Promise<{ id: string }> {
    if (!this.isEnabled()) throw new Error("E-mail não configurado (RESEND_API_KEY)");
    const from = process.env.EMAIL_FROM ?? "NovoSeminovo <onboarding@resend.dev>";
    const apiUrl = process.env.RESEND_API_URL ?? "https://api.resend.com";
    const res = await fetch(`${apiUrl}/emails`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        headers: message.headers,
        reply_to: message.replyTo,
        tags: [{ name: "categoria", value: "marketing" }],
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !body.id) throw new Error(`Resend ${res.status}: ${body.message ?? "sem id na resposta"}`);
    return { id: body.id };
  }
}

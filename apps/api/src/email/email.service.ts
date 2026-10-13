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
}

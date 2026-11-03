import { createHash, randomBytes } from "node:crypto";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { hashPassword } from "./password";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";
import { renderNotificationEmail } from "../email/email-template";
import { forgetUserStatus } from "./jwt-auth.guard";

const TOKEN_TTL_MINUTES = 60;
const INVITE_TTL_HOURS = 72;

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// "Esqueci minha senha": link de uso único por e-mail, válido por 1 hora.
// A resposta é sempre a mesma (existindo a conta ou não) para não revelar
// quais e-mails têm cadastro.
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async request(email: string): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== "active") return { ok: true };

    const token = randomBytes(32).toString("base64url");
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordResetTokenHash: tokenHash(token), passwordResetExpiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000) },
    });
    const html = renderNotificationEmail({
      userName: user.name,
      title: "Criar uma nova senha",
      body: `Recebemos um pedido para trocar a senha da sua conta. Clique no botão abaixo para criar uma nova — o link vale por ${TOKEN_TTL_MINUTES} minutos e só funciona uma vez.\n\nSe não foi você, ignore este e-mail: sua senha continua a mesma.`,
      link: `/redefinir-senha?token=${token}`,
      linkLabel: "Criar nova senha",
    });
    await this.email
      .send(user.email, "Trocar sua senha — NovoSeminovo", html)
      .catch((error) => this.logger.error(`Falha ao enviar e-mail de troca de senha: ${error}`));
    return { ok: true };
  }

  // Convite de quem entra na equipe (ex.: comercial): mesma mecânica do
  // "esqueci minha senha", com texto de boas-vindas e validade de 3 dias.
  async invite(userId: string): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== "active") throw new BadRequestException("Conta não encontrada ou inativa.");
    const token = randomBytes(32).toString("base64url");
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordResetTokenHash: tokenHash(token), passwordResetExpiresAt: new Date(Date.now() + INVITE_TTL_HOURS * 3_600_000) },
    });
    const html = renderNotificationEmail({
      userName: user.name,
      title: "Bem-vindo à equipe NovoSeminovo",
      body: `Você foi convidado para a área Comercial do NovoSeminovo. Clique no botão abaixo para criar a sua senha — o link vale por ${INVITE_TTL_HOURS / 24} dias e só funciona uma vez.\n\nDepois, entre em novoseminovo.com.br/entrar com este e-mail.`,
      link: `/redefinir-senha?token=${token}`,
      linkLabel: "Criar minha senha",
    });
    await this.email.send(user.email, "Seu acesso à área Comercial — NovoSeminovo", html);
    return { ok: true };
  }

  async reset(token: string, password: string): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { passwordResetTokenHash: tokenHash(token) } });
    if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date() || user.status !== "active") {
      throw new BadRequestException("Este link expirou ou já foi usado. Peça um novo em \"Esqueci minha senha\".");
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(password),
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        passwordChangedAt: new Date(),
        // Quem abriu o link do e-mail provou que o e-mail é dele.
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      },
    });
    forgetUserStatus(user.id);
    return { ok: true };
  }
}

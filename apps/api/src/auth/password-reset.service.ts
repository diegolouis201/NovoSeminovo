import { createHash, randomBytes } from "node:crypto";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { hash } from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";
import { renderNotificationEmail } from "../email/email-template";
import { forgetUserStatus } from "./jwt-auth.guard";

const TOKEN_TTL_MINUTES = 60;
const SALT_ROUNDS = 10;

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

  async reset(token: string, password: string): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { passwordResetTokenHash: tokenHash(token) } });
    if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date() || user.status !== "active") {
      throw new BadRequestException("Este link expirou ou já foi usado. Peça um novo em \"Esqueci minha senha\".");
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hash(password, SALT_ROUNDS),
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

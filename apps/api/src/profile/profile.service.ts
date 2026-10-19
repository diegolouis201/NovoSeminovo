import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Profile, SendEmailVerificationResult, UpdateProfileInput } from "@novoseminovo/shared-types";
import { renderNotificationEmail } from "../email/email-template";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";

const CODE_TTL_MINUTES = 15;

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async getProfile(userId: string): Promise<Profile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("Usuário não encontrado.");

    return {
      name: user.name,
      email: user.email,
      phone: user.phone ?? undefined,
      cpf: user.cpf ?? undefined,
      gender: user.gender ?? undefined,
      birthDate: user.birthDate?.toISOString().slice(0, 10),
      zipCode: user.zipCode ?? undefined,
      state: user.state ?? undefined,
      city: user.city ?? undefined,
      emailVerified: Boolean(user.emailVerifiedAt),
    };
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<Profile> {
    if (input.cpf) {
      const cpfDigits = input.cpf.replace(/\D/g, "");
      const existing = await this.prisma.user.findUnique({ where: { cpf: cpfDigits } });
      if (existing && existing.id !== userId) {
        throw new BadRequestException("Esse CPF já está cadastrado em outra conta.");
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: input.name,
        phone: input.phone,
        cpf: input.cpf ? input.cpf.replace(/\D/g, "") : undefined,
        gender: input.gender,
        birthDate: input.birthDate ? new Date(input.birthDate) : undefined,
        zipCode: input.zipCode,
        state: input.state,
        city: input.city,
      },
    });

    return this.getProfile(userId);
  }

  // Gera um código de 6 dígitos e manda pro próprio e-mail cadastrado —
  // isEnabled() falso (sem RESEND_API_KEY) devolve sent:false, mesmo padrão
  // de outras integrações opcionais do projeto (ver EmailService).
  async sendEmailVerification(userId: string): Promise<SendEmailVerificationResult> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("Usuário não encontrado.");
    if (!this.email.isEnabled()) return { sent: false };

    const code = generateCode();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerificationCode: code,
        emailVerificationExpiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000),
      },
    });

    const html = renderNotificationEmail({
      userName: user.name,
      title: "Confirme seu e-mail",
      body: `Seu código de verificação é <strong style="font-size: 20px; letter-spacing: 2px;">${code}</strong>. Ele vale por ${CODE_TTL_MINUTES} minutos.`,
    });
    await this.email.send(user.email, "Confirme seu e-mail — NovoSeminovo", html);

    return { sent: true };
  }

  async verifyEmail(userId: string, code: string): Promise<Profile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("Usuário não encontrado.");

    if (
      !user.emailVerificationCode ||
      !user.emailVerificationExpiresAt ||
      user.emailVerificationExpiresAt < new Date()
    ) {
      throw new BadRequestException("Código expirado. Peça um novo código.");
    }
    if (user.emailVerificationCode !== code) {
      throw new BadRequestException("Código incorreto.");
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date(), emailVerificationCode: null, emailVerificationExpiresAt: null },
    });

    return this.getProfile(userId);
  }
}

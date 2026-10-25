import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { compare, hash } from "bcryptjs";
import { Prisma } from "@novoseminovo/db";
import type { Acquisition, AuthUser, LoginInput, LoginResponse, RegisterInput } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { normalizeAffiliateCode } from "../affiliates/affiliates.service";

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(input: RegisterInput, acquisition?: Acquisition): Promise<AuthUser> {
    const passwordHash = await hash(input.password, SALT_ROUNDS);
    const cpf = input.cpf.replace(/\D/g, "");
    const affiliateId = await this.referringAffiliate(input.referralCode, cpf);
    // Indicado por afiliado conta como origem "afiliado", mesmo que o cookie diga outra coisa.
    const origin = affiliateId ? { source: "afiliado", medium: acquisition?.medium ?? "link", campaign: acquisition?.campaign } : acquisition;
    try {
      const user = await this.prisma.user.create({
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone,
          cpf,
          passwordHash,
          role: "buyer",
          ...(affiliateId ? { referredByAffiliateId: affiliateId, referredAt: new Date() } : {}),
          acqSource: origin?.source,
          acqMedium: origin?.medium,
          acqCampaign: origin?.campaign,
        },
      });
      return { id: user.id, name: user.name, email: user.email, role: user.role };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const target = String((error.meta as { target?: unknown } | undefined)?.target ?? "");
        throw new ConflictException(
          target.includes("cpf")
            ? "Já existe uma conta com este CPF. Entre com ela ou recupere a senha."
            : "Já existe uma conta com este e-mail.",
        );
      }
      throw error;
    }
  }

  // Programa de afiliados: o código (link ?ref= ou digitado) só vale se for de
  // afiliado aprovado e não da própria pessoa (mesmo CPF). Código inválido
  // não trava o cadastro — só não fica indicado.
  private async referringAffiliate(code: string | undefined, cpf: string): Promise<string | undefined> {
    const clean = normalizeAffiliateCode(code);
    if (!clean) return undefined;
    const affiliate = await this.prisma.affiliate.findUnique({ where: { code: clean }, include: { user: { select: { cpf: true } } } });
    if (!affiliate || affiliate.status !== "approved" || affiliate.user.cpf === cpf) return undefined;
    return affiliate.id;
  }

  // Desfaz um cadastro que acabou de ser criado (cadastro de empresa que
  // falhou no meio) — só apaga se a conta não tem nada ligado a ela.
  async deleteUnusedUser(userId: string): Promise<void> {
    await this.prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }

  async login(input: LoginInput): Promise<LoginResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user?.passwordHash) throw new UnauthorizedException("E-mail ou senha inválidos.");

    const valid = await compare(input.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException("E-mail ou senha inválidos.");
    if (user.status === "suspended") throw new UnauthorizedException("Esta conta está suspensa.");

    const authUser: AuthUser = { id: user.id, name: user.name, email: user.email, role: user.role };
    const accessToken = await this.jwtService.signAsync({ sub: user.id, role: user.role });

    return { user: authUser, accessToken };
  }
}

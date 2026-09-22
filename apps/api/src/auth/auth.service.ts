import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { compare, hash } from "bcryptjs";
import { Prisma } from "@novoseminovo/db";
import type { AuthUser, LoginInput, RegisterInput } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(input: RegisterInput): Promise<AuthUser> {
    const passwordHash = await hash(input.password, SALT_ROUNDS);
    try {
      const user = await this.prisma.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          role: "buyer",
        },
      });
      return { id: user.id, name: user.name, email: user.email, role: user.role };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Já existe uma conta com este e-mail.");
      }
      throw error;
    }
  }

  async login(input: LoginInput): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user?.passwordHash) throw new UnauthorizedException("E-mail ou senha inválidos.");

    const valid = await compare(input.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException("E-mail ou senha inválidos.");
    if (user.status === "suspended") throw new UnauthorizedException("Esta conta está suspensa.");

    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }
}

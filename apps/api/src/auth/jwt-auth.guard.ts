import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import type { Role } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";

// Conta suspensa ou excluída perde o acesso mesmo com sessão aberta (o token
// vale 30 dias). Situação guardada por 1 minuto para não consultar o banco a
// cada requisição.
const STATUS_TTL_MS = 60 * 1000;
const statusCache = new Map<string, { status: string; passwordChangedAt?: number; at: number }>();

// Troca de senha / suspensão: esquece o que estava guardado para valer já.
export function forgetUserStatus(userId: string): void {
  statusCache.delete(userId);
}

export type AuthenticatedUser = { id: string; role: Role };

declare module "express" {
  interface Request {
    user?: AuthenticatedUser;
  }
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : undefined;
    if (!token) throw new UnauthorizedException("Faça login para continuar.");

    let payload: { sub: string; role: Role; iat?: number };
    try {
      payload = await this.jwtService.verifyAsync<{ sub: string; role: Role; iat?: number }>(token);
    } catch {
      throw new UnauthorizedException("Sessão expirada, faça login novamente.");
    }
    const state = await this.userState(payload.sub);
    if (state.status !== "active") throw new UnauthorizedException("Esta conta não está mais ativa.");
    // Sessão aberta antes da troca de senha (ex.: outro aparelho) cai.
    if (state.passwordChangedAt && payload.iat !== undefined && payload.iat * 1000 < state.passwordChangedAt - 1000) {
      throw new UnauthorizedException("Sua senha foi trocada. Entre de novo.");
    }
    request.user = { id: payload.sub, role: payload.role };
    return true;
  }

  private async userState(userId: string): Promise<{ status: string; passwordChangedAt?: number }> {
    const cached = statusCache.get(userId);
    if (cached && Date.now() - cached.at < STATUS_TTL_MS) return cached;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { status: true, passwordChangedAt: true } });
    const state = { status: user?.status ?? "missing", passwordChangedAt: user?.passwordChangedAt?.getTime(), at: Date.now() };
    statusCache.set(userId, state);
    if (statusCache.size > 10000) statusCache.clear();
    return state;
  }
}

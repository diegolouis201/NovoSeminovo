import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";

// Sempre usado depois de JwtAuthGuard (@UseGuards(JwtAuthGuard, AdminGuard)),
// que já preencheu request.user a partir do JWT.
//
// O papel que importa é o de AGORA, não o que estava no JWT quando a pessoa
// logou — o token dura 30 dias (ver auth.module.ts), então sem reconferir
// no banco, alguém rebaixado de admin (ou suspenso) continuaria com acesso
// total ao painel admin até o token expirar sozinho. Mesmo padrão já usado
// em operations/agents.service.ts pro assistente de IA do admin.
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.user) throw new ForbiddenException("Apenas administradores podem acessar isto.");

    const user = await this.prisma.user.findUnique({
      where: { id: request.user.id },
      select: { role: true, status: true },
    });
    if (!user || user.role !== "admin" || user.status !== "active") {
      throw new ForbiddenException("Apenas administradores podem acessar isto.");
    }
    return true;
  }
}

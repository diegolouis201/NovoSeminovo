import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";

// Área Comercial: só a equipe de vendas (role "sales") e o admin, ativos.
// Confere o papel de AGORA no banco (não o do token, que dura 30 dias),
// como o AdminGuard. Sempre depois do JwtAuthGuard.
@Injectable()
export class SalesGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const denied = new ForbiddenException("Apenas a equipe comercial pode acessar isto.");
    if (!request.user) throw denied;
    const user = await this.prisma.user.findUnique({ where: { id: request.user.id }, select: { role: true, status: true } });
    if (!user || user.status !== "active" || (user.role !== "sales" && user.role !== "admin")) throw denied;
    return true;
  }
}

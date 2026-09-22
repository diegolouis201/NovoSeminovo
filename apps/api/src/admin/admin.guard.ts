import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";

// Sempre usado depois de JwtAuthGuard (@UseGuards(JwtAuthGuard, AdminGuard)),
// que já preencheu request.user a partir do JWT.
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.user?.role !== "admin") {
      throw new ForbiddenException("Apenas administradores podem acessar isto.");
    }
    return true;
  }
}

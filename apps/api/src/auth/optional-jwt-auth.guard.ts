import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import type { Role } from "@novoseminovo/shared-types";

// Igual ao JwtAuthGuard, mas nunca barra a requisição: token ausente ou
// inválido só significa "visitante anônimo" (request.user fica undefined).
// Usado em rotas públicas que precisam saber "é o dono? é admin?" sem exigir
// login de todo mundo — ver ListingsController.findOne.
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : undefined;

    if (token) {
      try {
        const payload = await this.jwtService.verifyAsync<{ sub: string; role: Role }>(token);
        request.user = { id: payload.sub, role: payload.role };
      } catch {
        // token inválido/expirado: segue como anônimo, não barra a requisição.
      }
    }

    return true;
  }
}

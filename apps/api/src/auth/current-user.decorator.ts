import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { AuthenticatedUser } from "./jwt-auth.guard";

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    // Atrás de JwtAuthGuard, sempre preenchido (ou a requisição já foi barrada
    // antes de chegar aqui). Atrás de OptionalJwtAuthGuard, pode vir undefined
    // — visitante anônimo.
    return request.user;
  },
);

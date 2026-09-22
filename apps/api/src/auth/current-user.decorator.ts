import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { AuthenticatedUser } from "./jwt-auth.guard";

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
  const request = ctx.switchToHttp().getRequest<Request>();
  // Só é chamado atrás de @UseGuards(JwtAuthGuard), que preenche request.user
  // ou já barra a requisição antes de chegar aqui.
  return request.user as AuthenticatedUser;
});

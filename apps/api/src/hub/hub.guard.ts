import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { HubPermission } from "@novoseminovo/shared-types";
import type { Request } from "express";
import { HubService } from "./hub.service";

// Cada rota do Hub diz a permissão que exige (@HubPermissionRequired). O
// perfil é conferido no banco a cada chamada (HubService.access): acesso
// desligado ou conta suspensa sai na hora, sem esperar o token expirar.
// Sempre depois do JwtAuthGuard.
export const HubPermissionRequired = (permission: HubPermission | "entrar") => SetMetadata("hub:permission", permission);

@Injectable()
export class HubGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly hub: HubService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { hub?: unknown }>();
    const required = this.reflector.getAllAndOverride<string | undefined>("hub:permission", [context.getHandler(), context.getClass()]) ?? "entrar";
    const access = request.user ? await this.hub.access(request.user.id) : null;
    if (!access) throw new ForbiddenException("Acesso só para a equipe do Hub.");
    if (required !== "entrar" && !access.permissions.includes(required as HubPermission)) {
      throw new ForbiddenException("Seu perfil não tem permissão para isto.");
    }
    request.hub = access;
    return true;
  }
}

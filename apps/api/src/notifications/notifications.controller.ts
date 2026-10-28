import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { NotificationsService } from "./notifications.service";
import { PushService } from "./push.service";

function pushInput(body: { token?: unknown; platform?: unknown }): { token: string; platform: "android" | "ios" } {
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (token.length < 20 || token.length > 4096) throw new BadRequestException("Token inválido");
  if (body.platform !== "android" && body.platform !== "ios") throw new BadRequestException("Plataforma inválida");
  return { token, platform: body.platform };
}

@UseGuards(JwtAuthGuard)
@Controller()
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly push: PushService,
  ) {}

  // App do celular (mobile/): guarda o aparelho para receber push.
  @Post("me/push-devices")
  async registerPushDevice(@CurrentUser() user: { id: string }, @Body() body: { token?: unknown; platform?: unknown }) {
    const { token, platform } = pushInput(body);
    await this.push.register(user.id, token, platform);
    return { ok: true };
  }

  @Get("me/notifications")
  listMine(@CurrentUser() user: { id: string }) {
    return this.notificationsService.listMine(user.id);
  }

  @Get("me/notifications/unread-count")
  async unreadCount(@CurrentUser() user: { id: string }) {
    return { count: await this.notificationsService.unreadCount(user.id) };
  }

  @Patch("me/notifications/read-all")
  markAllRead(@CurrentUser() user: { id: string }) {
    return this.notificationsService.markAllRead(user.id);
  }

  @Patch("me/notifications/:id/read")
  markRead(@CurrentUser() user: { id: string }, @Param("id") id: string) {
    return this.notificationsService.markRead(user.id, id);
  }
}

// Saiu da conta no app: sem login (a sessão já acabou), só com o próprio token.
@SkipThrottle()
@Controller()
export class PushDevicesPublicController {
  constructor(private readonly push: PushService) {}

  @Post("push-devices/remove")
  async remove(@Body() body: { token?: unknown; platform?: unknown }) {
    const { token } = pushInput({ ...body, platform: body?.platform ?? "android" });
    await this.push.unregister(token);
    return { ok: true };
  }
}

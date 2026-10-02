import { Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { NotificationsService } from "./notifications.service";

@UseGuards(JwtAuthGuard)
@Controller()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

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

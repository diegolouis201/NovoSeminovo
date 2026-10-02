import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ListingsController } from "./listings.controller";
import { ListingsService } from "./listings.service";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [ListingsController],
  providers: [ListingsService],
})
export class ListingsModule {}

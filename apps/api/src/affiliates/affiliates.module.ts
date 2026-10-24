import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AdminGuard } from "../admin/admin.guard";
import { AffiliatesController } from "./affiliates.controller";
import { AffiliatesService } from "./affiliates.service";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [AffiliatesController],
  providers: [AffiliatesService, AdminGuard],
  exports: [AffiliatesService],
})
export class AffiliatesModule {}

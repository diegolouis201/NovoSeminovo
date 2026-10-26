import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { RebatesController } from "./rebates.controller";
import { RebatesService } from "./rebates.service";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [RebatesController],
  providers: [RebatesService],
  exports: [RebatesService],
})
export class RebatesModule {}

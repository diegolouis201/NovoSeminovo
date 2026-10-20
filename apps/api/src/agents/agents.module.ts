import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ListingsModule } from "../listings/listings.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PartnersModule } from "../partners/partners.module";
import { AdminModule } from "../admin/admin.module";
import { RebatesModule } from "../rebates/rebates.module";
import { AgentsController } from "./agents.controller";
import { AgentsService } from "./agents.service";

@Module({
  imports: [AuthModule, ListingsModule, NotificationsModule, PartnersModule, AdminModule, RebatesModule],
  controllers: [AgentsController],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
